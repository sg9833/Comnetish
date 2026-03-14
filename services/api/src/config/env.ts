import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  API_CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
  PROVIDER_AUTH_SECRET: z.string().min(16).default('comnetish-dev-provider-auth-secret'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_API_URL: z.string().url().default('https://api.anthropic.com/v1/messages'),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022')
});

export const env = envSchema.parse(process.env);
