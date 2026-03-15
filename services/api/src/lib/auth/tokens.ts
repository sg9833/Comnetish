import { createHash, randomBytes } from 'node:crypto';

export function createOpaqueToken(byteLength = 32) {
  return randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url');
}

export function createNonce(byteLength = 16) {
  return randomBytes(byteLength).toString('hex');
}