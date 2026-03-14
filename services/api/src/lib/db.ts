import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function withPoolParams(url: string) {
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    return url;
  }

  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '20');
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '20');
  }
  return parsed.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: withPoolParams(env.DATABASE_URL)
      }
    }
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
