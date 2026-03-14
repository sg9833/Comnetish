import { Hono } from 'hono';
import { prisma } from '../lib/db';

const stats = new Hono();

stats.get('/', async (c) => {
  const [totalDeployments, activeProviders, cntVolume] = await Promise.all([
    prisma.deployment.count(),
    prisma.provider.count({ where: { status: 'ACTIVE' } }),
    prisma.transaction.aggregate({
      where: { token: 'CNT' },
      _sum: { amount: true }
    })
  ]);

  return c.json({
    data: {
      totalDeployments,
      activeProviders,
      cntVolume: Number(cntVolume._sum.amount ?? 0)
    }
  });
});

export { stats };
