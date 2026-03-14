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
import { bids } from './routes/bids';
import { deployments } from './routes/deployments';
import { leases } from './routes/leases';
import { providers } from './routes/providers';
import { stats } from './routes/stats';

const app = new Hono();
const { upgradeWebSocket, websocket } = createBunWebSocket();

const wsClients = new Set<{ send: (message: string) => void }>();

app.use('*', cors({ origin: env.API_CORS_ORIGIN }));
app.use('*', requestLogger);

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'api',
    timestamp: new Date().toISOString()
  })
);

app.route('/api/providers', providers);
app.route('/api/deployments', deployments);
app.route('/api/leases', leases);
app.route('/api/bids', bids);
app.route('/api/stats', stats);
app.route('/api/ai', ai);

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
  corsOrigin: env.API_CORS_ORIGIN,
  wsPath: '/ws',
  health: '/health'
});

export default {
  port,
  fetch: app.fetch,
  websocket
};