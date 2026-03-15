import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { env } from '../../config/env';
import { createOpaqueToken } from './tokens';
import type { AccessTokenClaims } from './types';

const issuer = env.AUTH_BASE_URL;
const audience = 'comnetish';
const encoder = new TextEncoder();

function getAccessTokenSecret() {
  return encoder.encode(env.JWT_ACCESS_SECRET);
}

function getRefreshTokenSecret() {
  return encoder.encode(env.JWT_REFRESH_SECRET);
}

export async function signAccessToken(claims: AccessTokenClaims) {
  return new SignJWT({
    sid: claims.sid,
    role: claims.role,
    status: claims.status,
    email_verified: claims.email_verified,
    wallet_linked: claims.wallet_linked,
    provider_profile_id: claims.provider_profile_id,
    tenant_profile_id: claims.tenant_profile_id
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${env.AUTH_ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(getAccessTokenSecret());
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, getAccessTokenSecret(), {
    issuer,
    audience
  });

  return payload as JWTPayload & Omit<AccessTokenClaims, 'sub'>;
}

export async function signRefreshToken(sessionId: string, userId: string) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setJti(createOpaqueToken(12))
    .setExpirationTime(`${env.AUTH_REFRESH_TOKEN_TTL_DAYS}d`)
    .sign(getRefreshTokenSecret());
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(token, getRefreshTokenSecret(), {
    issuer,
    audience
  });

  return payload as JWTPayload & { sid?: string };
}