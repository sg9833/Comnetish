import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  API_CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:4321'),
  AUTH_BASE_URL: z.string().url().default('http://localhost:3001'),
  AUTH_TENANT_APP_URL: z.string().url().default('http://localhost:3000'),
  AUTH_PROVIDER_APP_URL: z.string().url().default('http://localhost:3002'),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_COOKIE_SECURE: booleanString.default('false'),
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  JWT_ACCESS_SECRET: z.string().min(32).default('comnetish-dev-access-secret-change-me-1234'),
  JWT_REFRESH_SECRET: z.string().min(32).default('comnetish-dev-refresh-secret-change-me-1234'),
  PROVIDER_AUTH_SECRET: z.string().min(16).default('comnetish-dev-provider-auth-secret'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  RESEND_API_KEY: z.string().optional(),
  SIWE_DOMAIN: z.string().default('localhost'),
  SIWE_URI: z.string().url().default('http://localhost:3001'),
  SIWE_CHAIN_ID: z.coerce.number().int().positive().default(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_API_URL: z.string().url().default('https://api.anthropic.com/v1/messages'),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022')
});

export const env = envSchema.parse(process.env);
