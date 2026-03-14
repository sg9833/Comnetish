import type { Context, Next } from 'hono';
import { logger } from '../lib/logger';

export async function requestLogger(c: Context, next: Next) {
  const start = performance.now();
  const requestId = crypto.randomUUID();

  c.set('requestId', requestId);
  await next();

  const durationMs = Number((performance.now() - start).toFixed(2));

  logger.info('request.completed', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs
  });
}
