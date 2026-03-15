import type { Context } from 'hono';
import { SessionType, type Prisma, type User } from '@prisma/client';
import { env } from '../../config/env';
import { HttpError } from '../http-error';
import { prisma } from '../db';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt';
import { hashToken } from './tokens';
import type { AccessTokenClaims, AuthenticatedPrincipal } from './types';
import { getAccessTokenFromCookie, getRefreshTokenFromCookie, setAuthCookies } from './cookies';

const authUserInclude = {
  wallets: true,
  oauthAccounts: true,
  providerProfile: true,
  tenantProfile: true
} satisfies Prisma.UserInclude;

export type AuthUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

function readBearerToken(c: Context) {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function getRequestIp(c: Context) {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return c.req.header('x-real-ip') ?? null;
}

export function sanitizeUser(user: AuthUser | User) {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    primaryRole: user.primaryRole,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(('wallets' in user && user.wallets)
      ? {
          wallets: user.wallets.map((wallet) => ({
            id: wallet.id,
            chainType: wallet.chainType,
            address: wallet.address,
            isPrimary: wallet.isPrimary,
            verifiedAt: wallet.verifiedAt,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt
          }))
        }
      : {}),
    ...(('providerProfile' in user && user.providerProfile)
      ? { providerProfile: user.providerProfile }
      : {}),
    ...(('tenantProfile' in user && user.tenantProfile)
      ? { tenantProfile: user.tenantProfile }
      : {}),
    ...(('oauthAccounts' in user && user.oauthAccounts)
      ? {
          oauthAccounts: user.oauthAccounts.map((account) => ({
            id: account.id,
            provider: account.provider,
            email: account.email,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt
          }))
        }
      : {})
  };
}

export function buildAccessTokenClaims(user: AuthUser, sessionId: string): AccessTokenClaims {
  return {
    sub: user.id,
    sid: sessionId,
    role: user.primaryRole,
    status: user.status,
    email_verified: Boolean(user.emailVerifiedAt),
    wallet_linked: user.wallets.length > 0,
    provider_profile_id: user.providerProfile?.id ?? null,
    tenant_profile_id: user.tenantProfile?.id ?? null
  };
}

export function buildPrincipal(user: AuthUser, sessionId: string): AuthenticatedPrincipal {
  return {
    userId: user.id,
    sessionId,
    primaryRole: user.primaryRole,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    walletLinked: user.wallets.length > 0,
    providerProfileId: user.providerProfile?.id ?? null,
    tenantProfileId: user.tenantProfile?.id ?? null
  };
}

export async function getAuthUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: authUserInclude
  });
}

export async function createSessionForUser(c: Context, user: AuthUser, sessionType: SessionType = SessionType.BROWSER) {
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      sessionType,
      refreshTokenHash: 'pending',
      userAgent: c.req.header('user-agent') ?? null,
      ipAddress: getRequestIp(c),
      expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
    }
  });

  const claims = buildAccessTokenClaims(user, session.id);
  const accessToken = await signAccessToken(claims);
  const refreshToken = await signRefreshToken(session.id, user.id);

  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(refreshToken),
      lastRefreshedAt: new Date(),
      expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
    }
  });

  setAuthCookies(c, accessToken, refreshToken);

  return {
    session: updatedSession,
    accessToken,
    refreshToken,
    principal: buildPrincipal(user, session.id)
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function resolveSessionFromRefreshToken(c: Context) {
  const refreshToken = getRefreshTokenFromCookie(c);
  if (!refreshToken) {
    return null;
  }

  const payload = await verifyRefreshToken(refreshToken).catch(() => null);
  if (!payload?.sub || !payload.sid) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        include: authUserInclude
      }
    }
  });

  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  if (session.refreshTokenHash !== hashToken(refreshToken)) {
    await revokeSession(session.id);
    return null;
  }

  return {
    session,
    user: session.user
  };
}

export async function resolveCurrentSession(c: Context) {
  const token = readBearerToken(c) ?? getAccessTokenFromCookie(c);
  if (!token) {
    return null;
  }

  const payload = await verifyAccessToken(token).catch(() => null);
  if (!payload?.sub || !payload.sid) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        include: authUserInclude
      }
    }
  });

  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  return {
    session,
    user: session.user
  };
}

export async function requireCurrentSession(c: Context) {
  const resolved = await resolveCurrentSession(c);
  if (!resolved) {
    throw new HttpError(401, 'Authentication required');
  }

  return resolved;
}

export async function rotateSession(c: Context) {
  const resolved = await resolveSessionFromRefreshToken(c);
  if (!resolved) {
    throw new HttpError(401, 'Invalid refresh token');
  }

  const { session, user } = resolved;

  const claims = buildAccessTokenClaims(user, session.id);
  const nextAccessToken = await signAccessToken(claims);
  const nextRefreshToken = await signRefreshToken(session.id, user.id);

  const nextSession = await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(nextRefreshToken),
      lastRefreshedAt: new Date(),
      expiresAt: new Date(Date.now() + env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
    }
  });

  setAuthCookies(c, nextAccessToken, nextRefreshToken);

  return {
    session: nextSession,
    user,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    principal: buildPrincipal(user, session.id)
  };
}