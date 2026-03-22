import type { Context, Next } from 'hono';
import { env } from '../config/env';
import { HttpError } from '../lib/http-error';

type RateLimitRule = {
  id: string;
  path: string;
  maxRequests: number;
  windowMs: number;
  resolveIdentity?: (c: Context) => Promise<string | null>;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getClientIp(c: Context) {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  return c.req.header('x-real-ip') ?? 'unknown';
}

async function getEmailFromBody(c: Context) {
  try {
    const body = (await c.req.raw.clone().json()) as Record<string, unknown>;
    const rawEmail = body.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : null;
    return email && email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

const authRateLimitRules: RateLimitRule[] = [
  {
    id: 'auth-login',
    path: '/api/auth/login',
    maxRequests: env.AUTH_RATE_LIMIT_LOGIN_MAX,
    windowMs: env.AUTH_RATE_LIMIT_LOGIN_WINDOW_MS
  },
  {
    id: 'auth-signup',
    path: '/api/auth/signup',
    maxRequests: env.AUTH_RATE_LIMIT_SIGNUP_MAX,
    windowMs: env.AUTH_RATE_LIMIT_SIGNUP_WINDOW_MS
  },
  {
    id: 'auth-password-forgot',
    path: '/api/auth/password/forgot',
    maxRequests: env.AUTH_RATE_LIMIT_PASSWORD_FORGOT_MAX,
    windowMs: env.AUTH_RATE_LIMIT_PASSWORD_FORGOT_WINDOW_MS,
    resolveIdentity: getEmailFromBody
  },
  {
    id: 'auth-password-reset',
    path: '/api/auth/password/reset',
    maxRequests: env.AUTH_RATE_LIMIT_PASSWORD_RESET_MAX,
    windowMs: env.AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_MS
  }
];

function findRule(path: string) {
  return authRateLimitRules.find((rule) => path === rule.path);
}

function consumeQuota(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const nextBucket: RateLimitBucket = {
      count: 1,
      resetAt: now + windowMs
    };
    buckets.set(key, nextBucket);
    return {
      limited: false,
      remaining: Math.max(maxRequests - nextBucket.count, 0),
      resetAt: nextBucket.resetAt
    };
  }

  if (existing.count >= maxRequests) {
    return {
      limited: true,
      remaining: 0,
      resetAt: existing.resetAt
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    limited: false,
    remaining: Math.max(maxRequests - existing.count, 0),
    resetAt: existing.resetAt
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000).unref?.();

export async function authRateLimiter(c: Context, next: Next) {
  const rule = findRule(c.req.path);
  if (!rule) {
    await next();
    return;
  }

  const ip = getClientIp(c);
  const identityPart = rule.resolveIdentity ? (await rule.resolveIdentity(c)) ?? 'unknown' : 'none';
  const key = `${rule.id}:${ip}:${identityPart}`;

  const decision = consumeQuota(key, rule.maxRequests, rule.windowMs);
  c.header('X-RateLimit-Limit', String(rule.maxRequests));
  c.header('X-RateLimit-Remaining', String(decision.remaining));
  c.header('X-RateLimit-Reset', new Date(decision.resetAt).toISOString());

  if (decision.limited) {
    const retryAfterSeconds = Math.max(Math.ceil((decision.resetAt - Date.now()) / 1000), 1);
    c.header('Retry-After', String(retryAfterSeconds));
    throw new HttpError(429, 'Rate limit exceeded. Please retry later.');
  }

  await next();
}
