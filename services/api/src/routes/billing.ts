import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ensureRole, getWalletAddresses, resolveProviderForUser } from '../lib/auth/authorization';
import { requireCurrentSession } from '../lib/auth/session';
import { prisma } from '../lib/db';

const billing = new Hono();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  token: z.string().trim().min(1).max(16).optional(),
  type: z.string().trim().min(1).max(64).optional(),
  direction: z.enum(['all', 'incoming', 'outgoing']).default('all')
});

const createTransactionSchema = z.object({
  type: z.string().trim().min(1).max(64),
  from: z.string().trim().min(3).max(128),
  to: z.string().trim().min(3).max(128),
  amount: z.coerce.number().positive(),
  token: z.string().trim().min(1).max(16),
  txHash: z.string().trim().min(3).max(256),
  createdAt: z.coerce.date().optional()
});

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

async function resolveBillingAddresses(user: Awaited<ReturnType<typeof requireCurrentSession>>['user']) {
  const addresses = new Set(getWalletAddresses(user));
  const provider = await resolveProviderForUser(user);

  if (provider?.address) {
    addresses.add(provider.address.toLowerCase());
  }

  return Array.from(addresses);
}

billing.get('/', zValidator('query', listQuerySchema), async (c) => {
  const current = await requireCurrentSession(c);
  const { page, limit, token, type, direction } = c.req.valid('query');
  const addresses = await resolveBillingAddresses(current.user);

  if (addresses.length === 0) {
    return c.json({
      data: [],
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 0
      }
    });
  }

  const where = {
    ...(token ? { token: token.toUpperCase() } : {}),
    ...(type ? { type } : {}),
    ...(direction === 'incoming'
      ? { to: { in: addresses } }
      : direction === 'outgoing'
        ? { from: { in: addresses } }
        : {
            OR: [{ from: { in: addresses } }, { to: { in: addresses } }]
          })
  };

  const [total, items] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return c.json({
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

billing.get('/summary', async (c) => {
  const current = await requireCurrentSession(c);
  const addresses = await resolveBillingAddresses(current.user);
  const { start, end } = getCurrentMonthRange();

  if (addresses.length === 0) {
    return c.json({
      data: {
        period: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        spentByToken: [],
        earnedByToken: [],
        totalSpent: 0,
        totalEarned: 0,
        transactionCount: 0
      }
    });
  }

  const [spentByToken, earnedByToken, transactionCount] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['token'],
      where: {
        from: { in: addresses },
        createdAt: { gte: start, lt: end }
      },
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.transaction.groupBy({
      by: ['token'],
      where: {
        to: { in: addresses },
        createdAt: { gte: start, lt: end }
      },
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.transaction.count({
      where: {
        OR: [{ from: { in: addresses } }, { to: { in: addresses } }],
        createdAt: { gte: start, lt: end }
      }
    })
  ]);

  const formattedSpent = spentByToken.map((item) => ({
    token: item.token,
    amount: Number(item._sum.amount ?? 0),
    count: item._count._all
  }));

  const formattedEarned = earnedByToken.map((item) => ({
    token: item.token,
    amount: Number(item._sum.amount ?? 0),
    count: item._count._all
  }));

  const totalSpent = formattedSpent.reduce((sum, item) => sum + item.amount, 0);
  const totalEarned = formattedEarned.reduce((sum, item) => sum + item.amount, 0);

  return c.json({
    data: {
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      spentByToken: formattedSpent,
      earnedByToken: formattedEarned,
      totalSpent,
      totalEarned,
      transactionCount
    }
  });
});

billing.post('/transactions', zValidator('json', createTransactionSchema), async (c) => {
  const current = await requireCurrentSession(c);
  ensureRole(current.user, ['ADMIN']);

  const payload = c.req.valid('json');

  const transaction = await prisma.transaction.upsert({
    where: { txHash: payload.txHash },
    update: {
      type: payload.type,
      from: payload.from,
      to: payload.to,
      amount: payload.amount,
      token: payload.token.toUpperCase(),
      ...(payload.createdAt ? { createdAt: payload.createdAt } : {})
    },
    create: {
      type: payload.type,
      from: payload.from,
      to: payload.to,
      amount: payload.amount,
      token: payload.token.toUpperCase(),
      txHash: payload.txHash,
      ...(payload.createdAt ? { createdAt: payload.createdAt } : {})
    }
  });

  return c.json({ data: transaction }, 201);
});

export { billing };
