import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/http-error';
import { requireCurrentSession } from '../lib/auth/session';
import {
  canAccessDeployment,
  ensureRole,
  getWalletAddresses,
  isAdmin,
  userOwnsTenantAddress
} from '../lib/auth/authorization';

const createDeploymentSchema = z.object({
  tenantAddress: z.string().min(8),
  sdl: z.string().min(20)
});

const deploymentQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACTIVE', 'CLOSED']).optional(),
  tenantAddress: z.string().optional()
});

const deployments = new Hono();

deployments.post('/', zValidator('json', createDeploymentSchema), async (c) => {
  const current = await requireCurrentSession(c);
  ensureRole(current.user, ['TENANT']);

  const payload = c.req.valid('json');
  const userWallets = getWalletAddresses(current.user);
  const requestedTenantAddress = payload.tenantAddress.toLowerCase();

  if (userWallets.length > 0 && !userOwnsTenantAddress(current.user, payload.tenantAddress) && !isAdmin(current.user)) {
    throw new HttpError(403, 'tenantAddress must belong to an authenticated wallet linked to your account');
  }

  const effectiveTenantAddress = userWallets[0] ?? requestedTenantAddress;

  const deployment = await prisma.deployment.create({
    data: {
      userId: current.user.id,
      tenantAddress: effectiveTenantAddress,
      sdl: payload.sdl,
      status: 'OPEN'
    }
  });

  return c.json({ data: deployment }, 201);
});

deployments.get('/', zValidator('query', deploymentQuerySchema), async (c) => {
  const query = c.req.valid('query');
  const items = await prisma.deployment.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenantAddress ? { tenantAddress: query.tenantAddress } : {})
    },
    include: {
      _count: { select: { bids: true, leases: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return c.json({ data: items });
});

deployments.get('/:id', async (c) => {
  const item = await prisma.deployment.findUnique({
    where: { id: c.req.param('id') },
    include: {
      bids: true,
      leases: true
    }
  });

  if (!item) {
    throw new HttpError(404, 'Deployment not found');
  }

  return c.json({ data: item });
});

deployments.post('/:id/close', async (c) => {
  const current = await requireCurrentSession(c);
  const id = c.req.param('id');
  const existing = await prisma.deployment.findUnique({ where: { id } });

  if (!existing) {
    throw new HttpError(404, 'Deployment not found');
  }

  if (existing.status === 'CLOSED') {
    return c.json({ data: existing });
  }

  if (!canAccessDeployment(current.user, existing)) {
    throw new HttpError(403, 'You do not have permission to close this deployment');
  }

  const updated = await prisma.deployment.update({
    where: { id },
    data: {
      status: 'CLOSED',
      closedAt: new Date()
    }
  });

  return c.json({ data: updated });
});

export { deployments };
