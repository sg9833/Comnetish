import type { Deployment, UserRole } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from '../http-error';
import type { AuthUser } from './session';

export function isAdmin(user: AuthUser) {
  return user.primaryRole === 'ADMIN';
}

export function ensureRole(user: AuthUser, allowed: UserRole[]) {
  if (isAdmin(user)) {
    return;
  }

  if (!allowed.includes(user.primaryRole)) {
    throw new HttpError(403, 'Insufficient role for this action');
  }
}

export function getWalletAddresses(user: AuthUser) {
  return user.wallets.map((wallet) => wallet.address.toLowerCase());
}

export function userOwnsTenantAddress(user: AuthUser, tenantAddress: string) {
  const normalized = tenantAddress.toLowerCase();
  return getWalletAddresses(user).includes(normalized);
}

export function canAccessDeployment(user: AuthUser, deployment: Pick<Deployment, 'userId' | 'tenantAddress'>) {
  if (isAdmin(user)) {
    return true;
  }

  if (deployment.userId) {
    return deployment.userId === user.id;
  }

  return userOwnsTenantAddress(user, deployment.tenantAddress);
}

export async function resolveProviderForUser(user: AuthUser) {
  if (user.providerProfile?.providerId) {
    const byProfile = await prisma.provider.findUnique({
      where: { id: user.providerProfile.providerId }
    });
    if (byProfile) {
      return byProfile;
    }
  }

  const byUser = await prisma.provider.findFirst({
    where: { userId: user.id }
  });
  if (byUser) {
    return byUser;
  }

  const addresses = getWalletAddresses(user);
  if (!addresses.length) {
    return null;
  }

  return prisma.provider.findFirst({
    where: {
      address: {
        in: addresses
      }
    }
  });
}