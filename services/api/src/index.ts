import { createBunWebSocket } from 'hono/bun';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { ZodError } from 'zod';
import { env } from './config/env';
import { prisma } from './lib/db';
import { getRecentDeploymentLogs, subscribeToDeploymentLogs } from './lib/deployment-logs';
import { connectProviderLogsStream } from './lib/provider-gateway';
import { HttpError } from './lib/http-error';
import { logger } from './lib/logger';
import { authRateLimiter } from './middleware/rate-limit';
import { requestLogger } from './middleware/request-logger';
import { ai } from './routes/ai';
import { auth } from './routes/auth';
import { bids } from './routes/bids';
import { billing } from './routes/billing';
import { deployments } from './routes/deployments';
import { leases } from './routes/leases';
import { providers } from './routes/providers';
import { stats } from './routes/stats';
import { waitlist } from './routes/waitlist';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

const wsClients = new Set<{ send: (message: string) => void }>();
const wsDeploymentSubscriptions = new WeakMap<{ send: (message: string) => void }, () => void>();

// Support comma-separated origins for local multi-machine testing
const corsOrigins = env.API_CORS_ORIGIN.split(',').map((o) => o.trim());
const corsOrigin = corsOrigins.length === 1 ? (corsOrigins[0] ?? env.API_CORS_ORIGIN) : corsOrigins;
app.use('*', cors({ origin: corsOrigin, credentials: true }));
app.use('*', requestLogger);
app.use('/api/auth/*', authRateLimiter);

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString()
  })
);

app.route('/api/providers', providers);
app.route('/api/auth', auth);
app.route('/api/deployments', deployments);
app.route('/api/leases', leases);
app.route('/api/bids', bids);
app.route('/api/billing', billing);
app.route('/api/stats', stats);
app.route('/api/ai', ai);
app.route('/api/waitlist', waitlist);

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onOpen(_, ws) {
      wsClients.add(ws as unknown as { send: (message: string) => void });
      ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));
    },
    onClose(_, ws) {
      wsClients.delete(ws as unknown as { send: (message: string) => void });
    }
  }))
);

app.get(
  '/ws/deployments/:id/logs',
  upgradeWebSocket((c) => {
    const deploymentId = c.req.param('id') ?? '';
    return {
      onOpen(_, ws) {
        const client = ws as unknown as { send: (message: string) => void };
        const recent = getRecentDeploymentLogs(deploymentId, 30);
        for (const event of recent) {
          ws.send(JSON.stringify(event));
        }

        const unsubscribe = subscribeToDeploymentLogs(deploymentId, (event) => {
          client.send(JSON.stringify(event));
        });
        wsDeploymentSubscriptions.set(client, unsubscribe);

        ws.send(
          JSON.stringify({
            type: 'connected',
            ts: new Date().toISOString(),
            deploymentId
          })
        );
      },
      onClose(_, ws) {
        const client = ws as unknown as { send: (message: string) => void };
        const unsubscribe = wsDeploymentSubscriptions.get(client);
        if (unsubscribe) {
          unsubscribe();
          wsDeploymentSubscriptions.delete(client);
        }
      }
    };
  })
);

app.get(
  '/ws/provider/:providerId/:deploymentOwner/:deploymentSequence/logs',
  upgradeWebSocket((c) => {
    const providerId = c.req.param('providerId') ?? '';
    const deploymentOwner = c.req.param('deploymentOwner') ?? '';
    const deploymentSequence = c.req.param('deploymentSequence') ?? '';

    return {
      async onOpen(_, ws) {
        const client = ws as unknown as { send: (message: string) => void };

        try {
          // Find provider by ID to get gateway URL
          const provider = await prisma.provider.findUnique({
            where: { id: providerId }
          });

          if (!provider || !provider.gatewayUrl) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Provider gateway URL not configured'
              })
            );
            ws.close();
            return;
          }

          ws.send(
            JSON.stringify({
              type: 'connecting',
              ts: new Date().toISOString(),
              provider: provider.id,
              message: `Connecting to provider logs at ${provider.gatewayUrl}`
            })
          );

          // Connect to provider logs stream
          const providerLogConfig = {
            baseUrl: provider.gatewayUrl,
            leaseId: `${deploymentOwner}-${deploymentSequence}`,
            deploymentOwner,
            deploymentSequence,
            timeout: 30000
          };

          let logCount = 0;
          await connectProviderLogsStream(providerLogConfig, async (logLine) => {
            logCount += 1;
            client.send(
              JSON.stringify({
                type: 'log',
                ts: new Date().toISOString(),
                count: logCount,
                data: logLine
              })
            );
          });

          ws.send(
            JSON.stringify({
              type: 'completed',
              ts: new Date().toISOString(),
              logCount,
              message: 'Provider logs stream completed'
            })
          );
        } catch (error) {
          console.error(
            '[api] provider logs proxy error:',
            error instanceof Error ? error.message : error
          );
          ws.send(
            JSON.stringify({
              type: 'error',
              ts: new Date().toISOString(),
              message: error instanceof Error ? error.message : 'Unknown error'
            })
          );
        }
      },
      onClose(_, ws) {
        console.log('[api] provider logs WS closed');
      }
    };
  })
);

setInterval(async () => {
  if (wsClients.size === 0) {
    return;
  }

  const [activeProviders, openDeployments] = await Promise.all([
    prisma.provider.count({ where: { status: 'ACTIVE' } }),
    prisma.deployment.count({ where: { status: { in: ['OPEN', 'ACTIVE'] } } })
  ]);

  const event = JSON.stringify({
    type: 'platform.stats',
    ts: new Date().toISOString(),
    data: {
      activeProviders,
      openDeployments
    }
  });

  for (const client of wsClients) {
    client.send(event);
  }
}, 5000);

app.onError((error, c) => {
  if (error instanceof HttpError) {
    logger.warn('request.http_error', { status: error.status, message: error.message, details: error.details });
    return c.json(
      {
        error: {
          message: error.message,
          details: error.details ?? null
        }
      },
      error.status as any
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          message: 'Validation failed',
          details: error.flatten()
        }
      },
      400
    );
  }

  logger.error('request.unhandled_error', {
    message: error.message,
    stack: error.stack
  });

  return c.json({ error: { message: 'Internal server error' } }, 500);
});

const port = env.API_PORT;

logger.info('api.starting', {
  host: env.API_HOST,
  port,
  corsOrigins,
  wsPath: '/ws',
  wsLogsPath: '/ws/deployments/:id/logs',
  health: '/health'
});

export default {
  port,
  fetch: app.fetch,
  websocket
};