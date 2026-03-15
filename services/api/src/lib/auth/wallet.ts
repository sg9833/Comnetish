import { AuthChallengeType, WalletChainType } from '@prisma/client';
import { isAddress } from 'viem';
import { env } from '../../config/env';
import { prisma } from '../db';
import { HttpError } from '../http-error';
import { createNonce } from './tokens';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function normalizeEvmAddress(address: string) {
  return address.toLowerCase();
}

export function assertEvmAddress(address: string) {
  if (!isAddress(address)) {
    throw new HttpError(400, 'A valid EVM wallet address is required');
  }
}

function buildChallengeStatement(type: AuthChallengeType) {
  switch (type) {
    case AuthChallengeType.WALLET_LINK:
      return 'Link this wallet to your Comnetish account.';
    case AuthChallengeType.PROVIDER_SIGN_IN:
      return 'Authenticate your Comnetish provider session.';
    case AuthChallengeType.WALLET_SIGN_IN:
    default:
      return 'Sign in to Comnetish with your wallet.';
  }
}

function buildSiweStyleMessage(address: string, nonce: string, expiresAt: Date, type: AuthChallengeType) {
  return [
    'Comnetish wants you to sign in with your Ethereum account:',
    address,
    '',
    buildChallengeStatement(type),
    '',
    `URI: ${env.SIWE_URI}`,
    'Version: 1',
    `Chain ID: ${env.SIWE_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`
  ].join('\n');
}

export async function createWalletChallenge(params: {
  address: string;
  type: AuthChallengeType;
  userId?: string;
}) {
  assertEvmAddress(params.address);

  const address = normalizeEvmAddress(params.address);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const nonce = createNonce(16);
  const message = buildSiweStyleMessage(address, nonce, expiresAt, params.type);

  await prisma.authChallenge.deleteMany({
    where: {
      challengeType: params.type,
      walletAddress: address,
      consumedAt: null
    }
  });

  const challenge = await prisma.authChallenge.create({
    data: {
      userId: params.userId,
      challengeType: params.type,
      chainType: WalletChainType.EVM,
      walletAddress: address,
      nonce,
      message,
      expiresAt
    }
  });

  return {
    id: challenge.id,
    message: challenge.message,
    nonce: challenge.nonce,
    expiresAt: challenge.expiresAt.toISOString()
  };
}

export async function getActiveWalletChallenge(params: {
  address: string;
  type: AuthChallengeType;
  userId?: string;
}) {
  assertEvmAddress(params.address);

  const address = normalizeEvmAddress(params.address);
  const challenge = await prisma.authChallenge.findFirst({
    where: {
      challengeType: params.type,
      walletAddress: address,
      ...(params.userId ? { userId: params.userId } : {}),
      consumedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!challenge) {
    throw new HttpError(400, 'Wallet authentication challenge has expired');
  }

  return challenge;
}

export async function consumeWalletChallenge(id: string) {
  await prisma.authChallenge.update({
    where: { id },
    data: { consumedAt: new Date() }
  });
}