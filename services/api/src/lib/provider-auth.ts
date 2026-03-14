import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { env } from '../config/env';

type ProviderChallenge = {
  message: string;
  expiresAt: number;
};

type ProviderSessionPayload = {
  sub: string;
  address: string;
  iat: number;
  exp: number;
};

const providerChallenges = new Map<string, ProviderChallenge>();

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function encodeSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeSegment<T>(value: string) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function signToken(unsignedToken: string) {
  return createHmac('sha256', env.PROVIDER_AUTH_SECRET).update(unsignedToken).digest();
}

export function createProviderChallenge(address: string) {
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;
  const nonce = randomBytes(16).toString('hex');
  const message = [
    'Comnetish Provider Authentication',
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
    '',
    'Sign this message to authenticate your provider dashboard session.'
  ].join('\n');

  providerChallenges.set(address.toLowerCase(), { message, expiresAt });

  return {
    message,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

export function getProviderChallenge(address: string) {
  const challenge = providerChallenges.get(address.toLowerCase());

  if (!challenge) {
    return null;
  }

  if (challenge.expiresAt < Date.now()) {
    providerChallenges.delete(address.toLowerCase());
    return null;
  }

  return challenge;
}

export function clearProviderChallenge(address: string) {
  providerChallenges.delete(address.toLowerCase());
}

export function issueProviderSessionToken(provider: { id: string; address: string }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: ProviderSessionPayload = {
    sub: provider.id,
    address: provider.address,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  };

  const encodedHeader = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeSegment(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = signToken(unsignedToken).toString('base64url');

  return {
    token: `${unsignedToken}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString()
  };
}

export function verifyProviderSessionToken(token: string) {
  const [encodedHeader, encodedPayload, signature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signToken(unsignedToken);
  const actualSignature = Buffer.from(signature, 'base64url');

  if (expectedSignature.length !== actualSignature.length) {
    return null;
  }

  if (!timingSafeEqual(expectedSignature, actualSignature)) {
    return null;
  }

  const payload = decodeSegment<ProviderSessionPayload>(encodedPayload);
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function readBearerToken(c: Context) {
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
