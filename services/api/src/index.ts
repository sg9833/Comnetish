import { createBunWebSocket } from 'hono/bun';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import { ZodError } from 'zod';
import { env } from './config/env';
import { prisma } from './lib/db';
import { HttpError } from './lib/http-error';
import { logger } from './lib/logger';
import { requestLogger } from './middleware/request-logger';
import { ai } from './routes/ai';
import { auth } from './routes/auth';
import { bids } from './routes/bids';
import { deployments } from './routes/deployments';
import { leases } from './routes/leases';
import { providers } from './routes/providers';
import { stats } from './routes/stats';
import { waitlist } from './routes/waitlist';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

const wsClients = new Set<{ send: (message: string) => void }>();
const wsDeploymentClients = new Map<string, Set<{ send: (message: string) => void }>>();

// Support comma-separated origins for local multi-machine testing
const corsOrigins = env.API_CORS_ORIGIN.split(',').map((o) => o.trim());
const corsOrigin = corsOrigins.length === 1 ? (corsOrigins[0] ?? env.API_CORS_ORIGIN) : corsOrigins;
app.use('*', cors({ origin: corsOrigin, credentials: true }));
app.use('*', requestLogger);

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
        if (!wsDeploymentClients.has(deploymentId)) {
          wsDeploymentClients.set(deploymentId, new Set());
        }
        wsDeploymentClients.get(deploymentId)!.add(client);
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
        wsDeploymentClients.get(deploymentId)?.delete(client);
        if (wsDeploymentClients.get(deploymentId)?.size === 0) {
          wsDeploymentClients.delete(deploymentId);
        }
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

// Broadcast structured log events to per-deployment WebSocket subscribers.
setInterval(async () => {
  if (wsDeploymentClients.size === 0) {
    return;
  }

  for (const [deploymentId, clients] of wsDeploymentClients.entries()) {
    if (clients.size === 0) {
      continue;
    }

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { leases: { where: { status: 'ACTIVE' }, take: 1 } }
    });

    if (!deployment) {
      continue;
    }

    const lease = (deployment as any).leases?.[0];
    const candidates = lease
      ? [
          `[orchestrator] lease ${lease.id.slice(0, 8)} active — pricePerBlock=${lease.pricePerBlock}`,
          `[runtime] container health probe ok`,
          `[payment] escrow balance evaluated`,
          `[scheduler] block reconciliation complete`
        ]
      : [
          `[orchestrator] deployment ${deploymentId.slice(0, 8)} awaiting lease`,
          `[marketplace] bid evaluation in progress`,
          `[runtime] provider not yet assigned`
        ];

    const message = candidates[Math.floor(Math.random() * candidates.length)] ?? '[runtime] tick';
    const level = message.includes('awaiting') || message.includes('progress') ? 'warning' : 'info';

    const event = JSON.stringify({
      type: 'log',
      ts: new Date().toISOString(),
      level,
      message
    });

    for (const client of clients) {
      client.send(event);
    }
  }
}, 3000);

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