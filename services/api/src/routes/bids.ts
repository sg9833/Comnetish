import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { emitDeploymentLog } from '../lib/deployment-logs';
import { HttpError } from '../lib/http-error';
import { requireCurrentSession } from '../lib/auth/session';
import {
  canAccessDeployment,
  ensureRole,
  isAdmin,
  resolveProviderForUser
} from '../lib/auth/authorization';

const createBidSchema = z.object({
  deploymentId: z.string().min(1),
  providerId: z.string().min(1).optional(),
  price: z.number().positive()
});

const listBidQuerySchema = z.object({
  deploymentId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional()
});

const updateBidSchema = z.object({
  status: z.enum(['OPEN', 'WON', 'LOST'])
});

const bids = new Hono();

bids.post('/', zValidator('json', createBidSchema), async (c) => {
  const current = await requireCurrentSession(c);
  ensureRole(current.user, ['PROVIDER']);

  const payload = c.req.valid('json');

  const provider = await resolveProviderForUser(current.user);
  if (!provider) {
    throw new HttpError(404, 'Provider profile not found for authenticated account');
  }

  if (payload.providerId && payload.providerId !== provider.id && !isAdmin(current.user)) {
    throw new HttpError(403, 'providerId does not match authenticated provider');
  }

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
  const bid = await prisma.bid.create({
    data: {
      deploymentId: payload.deploymentId,
      providerId: provider.id,
      price: payload.price,
      status: 'OPEN'
    },
    include: {
      provider: true,
      deployment: true
    }
  });

  emitDeploymentLog({
    deploymentId: bid.deploymentId,
    providerId: bid.providerId,
    source: 'bids.route',
    message: `Bid submitted by provider ${bid.providerId.slice(0, 8)} at price ${bid.price}`,
    level: 'info'
  });

  return c.json({ data: bid }, 201);
});

bids.get('/', zValidator('query', listBidQuerySchema), async (c) => {
  const current = await requireCurrentSession(c);
  const { deploymentId, providerId } = c.req.valid('query');

  let effectiveProviderId = providerId;
  let effectiveDeploymentId = deploymentId;

  if (current.user.primaryRole === 'PROVIDER' && !isAdmin(current.user)) {
    const provider = await resolveProviderForUser(current.user);
    if (!provider) {
      throw new HttpError(404, 'Provider profile not found for authenticated account');
    }

    effectiveProviderId = provider.id;
    effectiveDeploymentId = deploymentId;
  } else if (current.user.primaryRole === 'TENANT' && !isAdmin(current.user)) {
    if (!deploymentId) {
      throw new HttpError(400, 'Tenants must provide deploymentId');
    }

    const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
    if (!deployment) {
      throw new HttpError(404, 'Deployment not found');
    }

    if (!canAccessDeployment(current.user, deployment)) {
      throw new HttpError(403, 'You do not have permission to view bids for this deployment');
    }

    effectiveDeploymentId = deploymentId;
    effectiveProviderId = undefined;
  } else if (!deploymentId && !providerId) {
    throw new HttpError(400, 'Provide at least one filter: deploymentId or providerId');
  }

  const items = await prisma.bid.findMany({
    where: {
      ...(effectiveDeploymentId ? { deploymentId: effectiveDeploymentId } : {}),
      ...(effectiveProviderId ? { providerId: effectiveProviderId } : {})
    },
    include: {
      provider: true
    },
    orderBy: { price: 'asc' }
  });

  return c.json({ data: items });
});

// Update a bid status. Supported transitions:
// OPEN -> LOST (withdraw/reject)
// OPEN -> WON (accept)
// LOST/WON -> OPEN (manual reopen for dev flows)
bids.patch('/:id', zValidator('json', updateBidSchema), async (c) => {
  const current = await requireCurrentSession(c);
  const id = c.req.param('id');
  const { status } = c.req.valid('json');

  const bid = await prisma.bid.findUnique({
    where: { id },
    include: {
      deployment: true
    }
  });
  if (!bid) {
    throw new HttpError(404, 'Bid not found');
  }

  const userProvider = current.user.primaryRole === 'PROVIDER' ? await resolveProviderForUser(current.user) : null;
  const isProviderOwner = Boolean(userProvider && userProvider.id === bid.providerId);
  const isDeploymentOwner = canAccessDeployment(current.user, bid.deployment);

  if (!isAdmin(current.user)) {
    if (status === 'WON' && !isDeploymentOwner) {
      throw new HttpError(403, 'Only deployment owner can mark a bid as WON');
    }

    if (status === 'LOST' && !isProviderOwner && !isDeploymentOwner) {
      throw new HttpError(403, 'Only provider owner or deployment owner can mark a bid as LOST');
    }

    if (status === 'OPEN') {
      throw new HttpError(403, 'Only admin can reopen bids to OPEN');
    }
  }

  if (bid.status !== 'OPEN' && status !== 'OPEN') {
    throw new HttpError(400, 'Only OPEN bids can transition to WON/LOST');
  }

  const updated = await prisma.bid.update({
    where: { id },
    data: { status }
  });

  emitDeploymentLog({
    deploymentId: bid.deploymentId,
    providerId: bid.providerId,
    source: 'bids.route',
    message: `Bid ${bid.id.slice(0, 8)} status changed to ${status}`,
    level: status === 'LOST' ? 'warning' : 'info'
  });

  return c.json({ data: updated });
});

export { bids };
