import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http-error';

const createBidSchema = z.object({
  deploymentId: z.string().min(1),
  providerId: z.string().min(1),
  price: z.number().positive()
});

const listBidQuerySchema = z.object({
  deploymentId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional()
});

const updateBidSchema = z.object({
  // LOST is the only valid transition providers can make (withdrawing their bid)
  status: z.enum(['LOST'])
});

const bids = new Hono();

bids.post('/', zValidator('json', createBidSchema), async (c) => {
  const payload = c.req.valid('json');

  // Validate deployment exists and is OPEN
  const deployment = await prisma.deployment.findUnique({
    where: { id: payload.deploymentId }
  });
  if (!deployment) {
    throw new HttpError(404, 'Deployment not found');
  }
  if (deployment.status !== 'OPEN') {
    throw new HttpError(400, 'Deployment is not accepting bids');
  }

  // Validate provider exists
  const provider = await prisma.provider.findUnique({
    where: { id: payload.providerId }
  });
  if (!provider) {
    throw new HttpError(404, 'Provider not found');
  }

  const bid = await prisma.bid.create({
    data: {
      deploymentId: payload.deploymentId,
      providerId: payload.providerId,
      price: payload.price,
      status: 'OPEN'
    },
    include: {
      provider: true,
      deployment: true
    }
  });

  return c.json({ data: bid }, 201);
});

bids.get('/', zValidator('query', listBidQuerySchema), async (c) => {
  const { deploymentId, providerId } = c.req.valid('query');

  if (!deploymentId && !providerId) {
    throw new HttpError(400, 'Provide at least one filter: deploymentId or providerId');
  }

  const items = await prisma.bid.findMany({
    where: {
      ...(deploymentId ? { deploymentId } : {}),
      ...(providerId ? { providerId } : {})
    },
    include: {
      provider: true
    },
    orderBy: { price: 'asc' }
  });

  return c.json({ data: items });
});

// Withdraw a bid: provider cancels their open bid (sets status to LOST)
bids.patch('/:id', zValidator('json', updateBidSchema), async (c) => {
  const id = c.req.param('id');
  const { status } = c.req.valid('json');

  const bid = await prisma.bid.findUnique({ where: { id } });
  if (!bid) {
    throw new HttpError(404, 'Bid not found');
  }
  if (bid.status !== 'OPEN') {
    throw new HttpError(400, 'Only OPEN bids can be withdrawn');
  }

  const updated = await prisma.bid.update({
    where: { id },
    data: { status }
  });

  return c.json({ data: updated });
});

export { bids };
