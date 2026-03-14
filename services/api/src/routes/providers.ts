import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http-error';

const providers = new Hono();

const createProviderSchema = z.object({
  address: z.string().min(8),
  region: z.string().min(2),
  cpu: z.number().int().positive(),
  memory: z.number().int().positive(),
  storage: z.number().int().positive(),
  pricePerCpu: z.number().positive(),
  signature: z.string().optional()
});

providers.post('/', zValidator('json', createProviderSchema), async (c) => {
  const payload = c.req.valid('json');
  const provider = await prisma.provider.upsert({
    where: { address: payload.address },
    update: {
      region: payload.region,
      cpu: payload.cpu,
      memory: payload.memory,
      storage: payload.storage,
      pricePerCpu: payload.pricePerCpu,
      status: 'ACTIVE',
      lastSeen: new Date()
    },
    create: {
      address: payload.address,
      region: payload.region,
      cpu: payload.cpu,
      memory: payload.memory,
      storage: payload.storage,
      pricePerCpu: payload.pricePerCpu,
      status: 'ACTIVE',
      lastSeen: new Date()
    }
  });
  return c.json({ data: provider }, 201);
});

providers.get(
  '/',
  zValidator(
    'query',
    z.object({
      region: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).optional()
    })
  ),
  async (c) => {
    const { region, status } = c.req.valid('query');
    const items = await prisma.provider.findMany({
      where: {
        ...(region ? { region } : {}),
        ...(status ? { status } : {})
      },
      orderBy: { lastSeen: 'desc' }
    });

    return c.json({ data: items });
  }
);

providers.get('/stats', async (c) => {
  const [total, active, byRegion] = await Promise.all([
    prisma.provider.count(),
    prisma.provider.count({ where: { status: 'ACTIVE' } }),
    prisma.provider.groupBy({ by: ['region'], _count: { region: true } })
  ]);

  return c.json({
    data: {
      total,
      active,
      byRegion: byRegion.map((item) => ({ region: item.region, count: item._count.region }))
    }
  });
});

providers.get('/:id', async (c) => {
  const provider = await prisma.provider.findUnique({ where: { id: c.req.param('id') } });
  if (!provider) {
    throw new HttpError(404, 'Provider not found');
  }
  return c.json({ data: provider });
});

providers.get('/:id/stats', async (c) => {
  const providerId = c.req.param('id');
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });

  if (!provider) {
    throw new HttpError(404, 'Provider not found');
  }

  const [activeLeases, totalBids, wonBids] = await Promise.all([
    prisma.lease.count({ where: { providerId, status: 'ACTIVE' } }),
    prisma.bid.count({ where: { providerId } }),
    prisma.bid.count({ where: { providerId, status: 'WON' } })
  ]);

  return c.json({
    data: {
      providerId,
      activeLeases,
      totalBids,
      wonBids,
      winRate: totalBids === 0 ? 0 : Number(((wonBids / totalBids) * 100).toFixed(2)),
      availableCpu: provider.cpu,
      availableMemory: provider.memory,
      availableStorage: provider.storage
    }
  });
});

// Current provider endpoints (for authenticated requests in real app)
// These use demo provider ID for now
providers.get('/me/stats', async (c) => {
  // In production, get provider ID from auth context
  // For now, return stats for first active provider
  const provider = await prisma.provider.findFirst({ where: { status: 'ACTIVE' } });

  if (!provider) {
    return c.json(
      {
        data: {
          activeLeases: 0,
          totalEarnings: 0,
          monthlyEarnings: 0,
          cpu: 0,
          memory: 0,
          storage: 0
        }
      },
      200
    );
  }

  const [activeLeases, totalEarnings, leases] = await Promise.all([
    prisma.lease.count({ where: { providerId: provider.id, status: 'ACTIVE' } }),
    prisma.lease.aggregate({
      where: { providerId: provider.id },
      _sum: { pricePerBlock: true }
    }),
    prisma.lease.findMany({
      where: { providerId: provider.id, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' }
    })
  ]);

  // Calculate monthly earnings (approximate: sum of pricePerBlock * 720 blocks/day * 30 days)
  const monthlyEarnings = (totalEarnings._sum.pricePerBlock || 0) * 720 * 30;

  return c.json({
    data: {
      activeLeases,
      totalEarnings: totalEarnings._sum.pricePerBlock || 0,
      monthlyEarnings,
      cpu: provider.cpu,
      memory: provider.memory,
      storage: provider.storage
    }
  });
});

providers.get('/me/leases', async (c) => {
  // In production, get provider ID from auth context
  const provider = await prisma.provider.findFirst({ where: { status: 'ACTIVE' } });

  if (!provider) {
    return c.json({ data: [] });
  }

  const leases = await prisma.lease.findMany({
    where: { providerId: provider.id },
    include: {
      deployment: true,
      provider: true
    },
    orderBy: { startedAt: 'desc' }
  });

  return c.json({ data: leases });
});

providers.get('/me/bids', async (c) => {
  // In production, get provider ID from auth context
  const provider = await prisma.provider.findFirst({ where: { status: 'ACTIVE' } });

  if (!provider) {
    return c.json({ data: [] });
  }

  const bids = await prisma.bid.findMany({
    where: { providerId: provider.id },
    include: {
      deployment: true,
      provider: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return c.json({ data: bids });
});

export { providers };
