import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { emitDeploymentLog, getRecentDeploymentLogs, subscribeToDeploymentLogs } from '../lib/deployment-logs';
import { HttpError } from '../lib/http-error';
import { requireCurrentSession } from '../lib/auth/session';
import {
  canAccessDeployment,
  ensureRole,
  isAdmin,
  resolveProviderForUser
} from '../lib/auth/authorization';

const createLeaseSchema = z.object({
  deploymentId: z.string().min(1),
  providerId: z.string().min(1),
  pricePerBlock: z.number().positive(),
  escrowLeaseId: z.string().min(1).optional(),
  escrowTxHash: z.string().min(3).optional()
});

const leases = new Hono();

leases.post('/', zValidator('json', createLeaseSchema), async (c) => {
  const current = await requireCurrentSession(c);
  ensureRole(current.user, ['TENANT']);

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
  if (!canAccessDeployment(current.user, deployment)) {
    throw new HttpError(403, 'You do not have permission to create a lease for this deployment');
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

  if (lease) {
    emitDeploymentLog({
      deploymentId: lease.deploymentId,
      leaseId: lease.id,
      providerId: lease.providerId,
      source: 'leases.route',
      message: `Lease ${lease.id.slice(0, 8)} activated at pricePerBlock=${lease.pricePerBlock}`,
      level: 'info'
    });

    if (payload.escrowLeaseId || payload.escrowTxHash) {
      emitDeploymentLog({
        deploymentId: lease.deploymentId,
        leaseId: lease.id,
        providerId: lease.providerId,
        source: 'leases.route',
        message: `Escrow linkage acknowledged leaseId=${payload.escrowLeaseId ?? 'n/a'} tx=${payload.escrowTxHash?.slice(0, 12) ?? 'n/a'}...`,
        level: 'info'
      });
    }
  }

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
    const current = await requireCurrentSession(c);
    const query = c.req.valid('query');

    const provider = current.user.primaryRole === 'PROVIDER' ? await resolveProviderForUser(current.user) : null;

    if (!isAdmin(current.user)) {
      if (current.user.primaryRole === 'PROVIDER') {
        if (!provider) {
          throw new HttpError(404, 'Provider profile not found for authenticated account');
        }

        if (query.providerId && query.providerId !== provider.id) {
          throw new HttpError(403, 'providerId does not match authenticated provider');
        }
      }

      if (current.user.primaryRole === 'TENANT' && query.providerId) {
        throw new HttpError(403, 'Tenants cannot filter leases by providerId');
      }
    }

    const items = await prisma.lease.findMany({
      where: {
        ...(query.deploymentId ? { deploymentId: query.deploymentId } : {}),
        ...(isAdmin(current.user)
          ? query.providerId
            ? { providerId: query.providerId }
            : {}
          : current.user.primaryRole === 'PROVIDER'
            ? provider
              ? { providerId: provider.id }
              : {}
            : {}),
        ...(query.status ? { status: query.status } : {})
      },
      include: {
        provider: true,
        deployment: true
      },
      orderBy: { startedAt: 'desc' }
    });

    if (isAdmin(current.user) || current.user.primaryRole === 'PROVIDER') {
      return c.json({ data: items });
    }

    const filtered = items.filter((lease) => canAccessDeployment(current.user, lease.deployment));

    return c.json({ data: filtered });
  }
);

leases.get('/:id/logs', async (c) => {
  const current = await requireCurrentSession(c);
  const id = c.req.param('id');
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      deployment: true
    }
  });

  if (!lease) {
    throw new HttpError(404, 'Lease not found');
  }

  if (!isAdmin(current.user)) {
    if (current.user.primaryRole === 'PROVIDER') {
      const provider = await resolveProviderForUser(current.user);
      if (!provider || provider.id !== lease.providerId) {
        throw new HttpError(403, 'You do not have permission to view these lease logs');
      }
    } else if (!canAccessDeployment(current.user, lease.deployment)) {
      throw new HttpError(403, 'You do not have permission to view these lease logs');
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  const deploymentId = lease.deploymentId;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const recent = getRecentDeploymentLogs(deploymentId, 30);
      for (const event of recent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`));
        } catch {
          closed = true;
          return;
        }
      }

      unsubscribe = subscribeToDeploymentLogs(deploymentId, (event) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\\n\\n`));
        } catch {
          closed = true;
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }
        }
      });

      keepAlive = setInterval(() => {
        if (closed) {
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }
          return;
        }

        try {
          controller.enqueue(encoder.encode(`event: ping\\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\\n\\n`));
        } catch {
          closed = true;
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          if (keepAlive) {
            clearInterval(keepAlive);
            keepAlive = null;
          }
        }
      }, 15_000);
    },
    cancel() {
      closed = true;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
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
