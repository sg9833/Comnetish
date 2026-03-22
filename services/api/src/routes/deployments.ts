import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { prisma } from '../lib/db';
import { emitDeploymentLog } from '../lib/deployment-logs';
import { getDeploymentRuntime, proxyManifestToProvider, submitDeploymentManifest } from '../lib/deployment-runtime';
import { broadcastMsgCreateDeployment } from '../lib/deployment-chain';
import { HttpError } from '../lib/http-error';
import { requireCurrentSession } from '../lib/auth/session';
import {
  canAccessDeployment,
  ensureRole,
  getWalletAddresses,
  isAdmin,
  resolveProviderForUser,
  userOwnsTenantAddress
} from '../lib/auth/authorization';

const createDeploymentSchema = z.object({
  tenantAddress: z.string().min(8),
  sdl: z.string().min(20),
  escrowFunding: z
    .object({
      leaseId: z.string().min(1),
      txHash: z.string().min(3),
      token: z.string().min(1),
      amount: z.number().positive(),
      amountBaseUnits: z.string().min(1),
      providerAddress: z.string().min(8),
      escrowAddress: z.string().min(8),
      maxDurationSeconds: z.number().int().positive()
    })
    .optional()
});

const deploymentQuerySchema = z.object({
  status: z.enum(['OPEN', 'ACTIVE', 'CLOSED']).optional(),
  tenantAddress: z.string().optional()
});

const submitManifestSchema = z.object({
  leaseId: z.string().min(1).optional(),
  manifest: z.string().min(20).optional(),
  providerGatewayUrl: z.string().url().optional()
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

  const deployment = await prisma.$transaction(async (tx) => {
    const created = await tx.deployment.create({
      data: {
        userId: current.user.id,
        tenantAddress: effectiveTenantAddress,
        sdl: payload.sdl,
        status: 'OPEN'
      }
    });

    if (payload.escrowFunding) {
      await tx.transaction.upsert({
        where: { txHash: payload.escrowFunding.txHash },
        update: {
          type: 'ESCROW_DEPOSIT',
          from: effectiveTenantAddress,
          to: payload.escrowFunding.escrowAddress,
          amount: payload.escrowFunding.amount,
          token: payload.escrowFunding.token.toUpperCase()
        },
        create: {
          type: 'ESCROW_DEPOSIT',
          from: effectiveTenantAddress,
          to: payload.escrowFunding.escrowAddress,
          amount: payload.escrowFunding.amount,
          token: payload.escrowFunding.token.toUpperCase(),
          txHash: payload.escrowFunding.txHash
        }
      });
    }

    return created;
  });

  emitDeploymentLog({
    deploymentId: deployment.id,
    source: 'deployments.route',
    message: `Deployment created by tenant ${deployment.tenantAddress.slice(0, 10)}...`,
    level: 'info'
  });

  if (payload.escrowFunding) {
    emitDeploymentLog({
      deploymentId: deployment.id,
      source: 'payments.route',
      level: 'info',
      message: `Escrow funding linked tx=${payload.escrowFunding.txHash.slice(0, 10)}... amount=${payload.escrowFunding.amount} ${payload.escrowFunding.token.toUpperCase()}`
    });
  }

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

  emitDeploymentLog({
    deploymentId: updated.id,
    source: 'deployments.route',
    message: 'Deployment closed by tenant/admin request',
    level: 'warning'
  });

  return c.json({ data: updated });
});

const broadcastDeploymentSchema = z.object({
  tenantAddress: z.string().min(8),
  sdl: z.string().min(20)
});

deployments.post('/broadcast/create', zValidator('json', broadcastDeploymentSchema), async (c) => {
  const current = await requireCurrentSession(c);
  ensureRole(current.user, ['TENANT']);

  const payload = c.req.valid('json');
  const userWallets = getWalletAddresses(current.user);

  if (userWallets.length > 0 && !userOwnsTenantAddress(current.user, payload.tenantAddress) && !isAdmin(current.user)) {
    throw new HttpError(403, 'tenantAddress must belong to an authenticated wallet linked to your account');
  }

  const relayerMnemonic = process.env.COMNETISH_RELAYER_MNEMONIC;
  if (!relayerMnemonic) {
    console.warn('[deployments] COMNETISH_RELAYER_MNEMONIC not configured; skipping on-chain broadcast');
    return c.json({
      data: {
        chainTxHash: null,
        chainDeploymentId: null,
        status: 'SKIPPED',
        message: 'On-chain broadcast not configured'
      }
    }, 501);
  }

  try {
    emitDeploymentLog({
      deploymentId: 'pending',
      source: 'deployments.broadcast',
      level: 'info',
      message: `Broadcasting MsgCreateDeployment to chain for ${payload.tenantAddress.slice(0, 10)}...`
    });

    const onChainResult = await broadcastMsgCreateDeployment(
      payload.tenantAddress,
      payload.sdl,
      relayerMnemonic
    );

    return c.json({
      data: {
        chainTxHash: onChainResult.txHash,
        chainDeploymentId: onChainResult.deploymentId,
        status: 'BROADCAST',
        message: 'Deployment broadcasted to Cosmos chain'
      }
    }, 200);
  } catch (error) {
    console.error('[deployments] broadcast create failed:', error);
    throw new HttpError(
      502,
      `Chain broadcast failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
});

deployments.post('/:id/manifest', zValidator('json', submitManifestSchema), async (c) => {
  const current = await requireCurrentSession(c);
  ensureRole(current.user, ['TENANT', 'PROVIDER']);

  const deploymentId = c.req.param('id');
  const payload = c.req.valid('json');

  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) {
    throw new HttpError(404, 'Deployment not found');
  }

  const activeLease = await prisma.lease.findFirst({
    where: {
      deploymentId,
      ...(payload.leaseId ? { id: payload.leaseId } : {}),
      status: { in: ['PENDING', 'ACTIVE'] }
    },
    orderBy: { startedAt: 'desc' }
  });

  if (!activeLease) {
    throw new HttpError(400, 'No active or pending lease found for this deployment');
  }

  if (!isAdmin(current.user)) {
    if (current.user.primaryRole === 'TENANT') {
      if (!canAccessDeployment(current.user, deployment)) {
        throw new HttpError(403, 'You do not have permission to submit manifest for this deployment');
      }
    }

    if (current.user.primaryRole === 'PROVIDER') {
      const provider = await resolveProviderForUser(current.user);
      if (!provider || provider.id !== activeLease.providerId) {
        throw new HttpError(403, 'You do not have permission to submit manifest for this lease');
      }
    }
  }

  const manifest = payload.manifest ?? deployment.sdl;

  const runtime = submitDeploymentManifest({
    deploymentId,
    leaseId: activeLease.id,
    providerId: activeLease.providerId,
    tenantAddress: deployment.tenantAddress,
    manifest,
    ...(payload.providerGatewayUrl ? { providerGatewayUrl: payload.providerGatewayUrl } : {})
  });

  const providerProxy = await proxyManifestToProvider(deploymentId);

  return c.json({
    data: {
      deploymentId,
      leaseId: runtime.leaseId,
      providerId: runtime.providerId,
      status: runtime.status,
      manifestUploadedAt: runtime.manifestUploadedAt,
      manifestForwarded: providerProxy.proxied,
      providerAccepted: providerProxy.accepted
    }
  });
});

deployments.get('/:id/runtime', async (c) => {
  const current = await requireCurrentSession(c);
  const deploymentId = c.req.param('id');

  const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
  if (!deployment) {
    throw new HttpError(404, 'Deployment not found');
  }

  if (!isAdmin(current.user)) {
    if (current.user.primaryRole === 'TENANT') {
      if (!canAccessDeployment(current.user, deployment)) {
        throw new HttpError(403, 'You do not have permission to view this deployment runtime');
      }
    }

    if (current.user.primaryRole === 'PROVIDER') {
      const provider = await resolveProviderForUser(current.user);
      const lease = await prisma.lease.findFirst({
        where: {
          deploymentId,
          status: { in: ['PENDING', 'ACTIVE'] }
        },
        orderBy: { startedAt: 'desc' }
      });

      if (!provider || !lease || lease.providerId !== provider.id) {
        throw new HttpError(403, 'You do not have permission to view this deployment runtime');
      }
    }
  }

  const runtime = await getDeploymentRuntime(deploymentId);

  if (!runtime) {
    return c.json({
      data: {
        deploymentId,
        status: 'PENDING',
        endpoint: null,
        message: 'Manifest not submitted yet'
      }
    });
  }

  return c.json({
    data: {
      deploymentId,
      leaseId: runtime.leaseId,
      providerId: runtime.providerId,
      status: runtime.status,
      endpoint: runtime.endpoint,
      manifestUploadedAt: runtime.manifestUploadedAt,
      lastTransitionAt: runtime.lastTransitionAt,
      failureReason: runtime.failureReason ?? null
    }
  });
});

export { deployments };
