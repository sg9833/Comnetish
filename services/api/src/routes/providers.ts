import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { isAddress, verifyMessage } from 'viem';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http-error';
import {
  clearProviderChallenge,
  createProviderChallenge,
  getProviderChallenge,
  issueProviderSessionToken,
  readBearerToken,
  verifyProviderSessionToken
} from '../lib/provider-auth';

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

const updateProviderSchema = z.object({
  pricePerCpu: z.number().positive().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).optional()
});

const providerChallengeSchema = z.object({
  address: z.string().min(8)
});

const providerVerifySchema = z.object({
  address: z.string().min(8),
  signature: z.string().min(10)
});

function normalizeProviderAddress(address?: string | null) {
  if (!address) {
    return undefined;
  }

  return isAddress(address) ? address.toLowerCase() : address;
}

async function resolveProviderFromSession(c: Context) {
  const token = readBearerToken(c);
  if (!token) {
    return null;
  }

  const session = verifyProviderSessionToken(token);
  if (!session) {
    throw new HttpError(401, 'Invalid provider session');
  }

  const provider = await prisma.provider.findUnique({ where: { id: session.sub } });
  if (!provider || provider.address !== session.address) {
    throw new HttpError(401, 'Provider session is no longer valid');
  }

  return provider;
}

async function resolveProvider(c: Context) {
  const sessionProvider = await resolveProviderFromSession(c);
  if (sessionProvider) {
    return sessionProvider;
  }

  const address = normalizeProviderAddress(c.req.query('address'));
  if (address) {
    return prisma.provider.findUnique({ where: { address } });
  }

  return prisma.provider.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { lastSeen: 'desc' }
  });
}

providers.post('/', zValidator('json', createProviderSchema), async (c) => {
  const payload = c.req.valid('json');
  const address = normalizeProviderAddress(payload.address) ?? payload.address;

  const provider = await prisma.provider.upsert({
    where: { address },
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
      address,
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

providers.post('/auth/challenge', zValidator('json', providerChallengeSchema), async (c) => {
  const payload = c.req.valid('json');
  const address = normalizeProviderAddress(payload.address);

  if (!address || !isAddress(address)) {
    throw new HttpError(400, 'A valid EVM wallet address is required');
  }

  const provider = await prisma.provider.findUnique({ where: { address } });
  if (!provider) {
    throw new HttpError(404, 'Provider not found for this wallet address');
  }

  return c.json({ data: createProviderChallenge(address) });
});

providers.post('/auth/verify', zValidator('json', providerVerifySchema), async (c) => {
  const payload = c.req.valid('json');
  const address = normalizeProviderAddress(payload.address);

  if (!address || !isAddress(address)) {
    throw new HttpError(400, 'A valid EVM wallet address is required');
  }

  const challenge = getProviderChallenge(address);
  if (!challenge) {
    throw new HttpError(400, 'Provider authentication challenge has expired');
  }

  const isValidSignature = await verifyMessage({
    address,
    message: challenge.message,
    signature: payload.signature as `0x${string}`
  });

  if (!isValidSignature) {
    throw new HttpError(401, 'Provider signature verification failed');
  }

  const provider = await prisma.provider.findUnique({ where: { address } });
  if (!provider) {
    throw new HttpError(404, 'Provider not found for this wallet address');
  }

  clearProviderChallenge(address);

  return c.json({
    data: {
      provider,
      session: issueProviderSessionToken(provider)
    }
  });
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

providers.get('/me', async (c) => {
  const provider = await resolveProviderFromSession(c);
  if (!provider) {
    throw new HttpError(401, 'Provider session required');
  }
  return c.json({ data: provider });
});

providers.patch('/me', zValidator('json', updateProviderSchema), async (c) => {
  const provider = await resolveProviderFromSession(c);
  if (!provider) {
    throw new HttpError(401, 'Provider session required to update settings');
  }
  const body = c.req.valid('json');
  const updated = await prisma.provider.update({
    where: { id: provider.id },
    data: { ...body, lastSeen: new Date() }
  });
  return c.json({ data: updated });
});

providers.get('/me/stats', async (c) => {
  const provider = await resolveProvider(c);

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

  const [activeLeases, totalEarnings] = await Promise.all([
    prisma.lease.count({ where: { providerId: provider.id, status: 'ACTIVE' } }),
    prisma.lease.aggregate({
      where: { providerId: provider.id },
      _sum: { pricePerBlock: true }
    })
  ]);

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
  const provider = await resolveProvider(c);

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
  const provider = await resolveProvider(c);

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

export { providers };
