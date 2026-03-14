import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http-error';

const createLeaseSchema = z.object({
  deploymentId: z.string().min(1),
  providerId: z.string().min(1),
  pricePerBlock: z.number().positive()
});

const leases = new Hono();

leases.post('/', zValidator('json', createLeaseSchema), async (c) => {
  const payload = c.req.valid('json');

  // Validate deployment, provider, and an open bid exist
  const [deployment, provider, winningBid] = await Promise.all([
    prisma.deployment.findUnique({ where: { id: payload.deploymentId } }),
    prisma.provider.findUnique({ where: { id: payload.providerId } }),
    prisma.bid.findFirst({
      where: {
        deploymentId: payload.deploymentId,
        providerId: payload.providerId,
        status: 'OPEN'
      }
    })
  ]);

  if (!deployment) {
    throw new HttpError(404, 'Deployment not found');
  }
  if (deployment.status !== 'OPEN') {
    throw new HttpError(400, 'Deployment is not accepting lease creation');
  }
  if (!provider) {
    throw new HttpError(404, 'Provider not found');
  }
  if (!winningBid) {
    throw new HttpError(400, 'No open bid found for this provider and deployment');
  }

  // Create lease and update deployment status in transaction
  const lease = await prisma.$transaction(async (tx) => {
    const newLease = await tx.lease.create({
      data: {
        deploymentId: payload.deploymentId,
        providerId: payload.providerId,
        pricePerBlock: payload.pricePerBlock,
        status: 'ACTIVE',
        startedAt: new Date()
      }
    });

    await tx.deployment.update({
      where: { id: payload.deploymentId },
      data: { status: 'ACTIVE' }
    });

    await tx.bid.update({
      where: { id: winningBid.id },
      data: { status: 'WON' }
    });

    await tx.bid.updateMany({
      where: {
        deploymentId: payload.deploymentId,
        id: { not: winningBid.id },
        status: 'OPEN'
      },
      data: { status: 'LOST' }
    });

    await tx.transaction.create({
      data: {
        type: 'LEASE_START',
        from: deployment.tenantAddress,
        to: provider.address,
        amount: payload.pricePerBlock,
        token: 'CNT',
        txHash: `lease_${newLease.id}_${Date.now()}`
      }
    });

    return tx.lease.findUnique({
      where: { id: newLease.id },
      include: {
        provider: true,
        deployment: true
      }
    });
  });

  return c.json({ data: lease }, 201);
});

leases.get(
  '/',
  zValidator(
    'query',
    z.object({
      deploymentId: z.string().optional(),
      providerId: z.string().optional(),
      status: z.enum(['PENDING', 'ACTIVE', 'CLOSED']).optional()
    })
  ),
  async (c) => {
    const query = c.req.valid('query');

    const items = await prisma.lease.findMany({
      where: {
        ...(query.deploymentId ? { deploymentId: query.deploymentId } : {}),
        ...(query.providerId ? { providerId: query.providerId } : {}),
        ...(query.status ? { status: query.status } : {})
      },
      include: {
        provider: true,
        deployment: true
      },
      orderBy: { startedAt: 'desc' }
    });

    return c.json({ data: items });
  }
);

leases.get('/:id/logs', async (c) => {
  const id = c.req.param('id');
  const lease = await prisma.lease.findUnique({ where: { id } });

  if (!lease) {
    throw new HttpError(404, 'Lease not found');
  }

  const encoder = new TextEncoder();
  let tick = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const interval = setInterval(() => {
        tick += 1;
        controller.enqueue(
          encoder.encode(`data: [${new Date().toISOString()}] lease=${id} status=${lease.status} tick=${tick}\\n\\n`)
        );

        if (tick >= 20) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
});

export { leases };
