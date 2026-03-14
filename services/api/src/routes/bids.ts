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

  // Create bid
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

bids.get(
  '/',
  zValidator(
    'query',
    z.object({
      deploymentId: z.string().min(1)
    })
  ),
  async (c) => {
    const { deploymentId } = c.req.valid('query');
    const items = await prisma.bid.findMany({
      where: { deploymentId },
      include: {
        provider: true
      },
      orderBy: { price: 'asc' }
    });

    return c.json({ data: items });
  }
);

export { bids };
