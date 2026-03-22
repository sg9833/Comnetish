import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import WebSocket from 'ws';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  INDEXER_CHAIN_WS_URL: z.string().default('ws://localhost:26657/websocket'),
  INDEXER_RECONNECT_DELAY_MS: z.coerce.number().int().positive().default(3000),
  INDEXER_SUBSCRIBE_QUERY: z.string().default("tm.event='Tx'"),
  INDEXER_BACKFILL_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value.toLowerCase() === 'true'),
  INDEXER_BACKFILL_PAGE_SIZE: z.coerce.number().int().min(10).max(100).default(50),
  INDEXER_START_HEIGHT: z.coerce.number().int().positive().optional(),
  DATABASE_URL: z.string().min(1)
});

const env = envSchema.parse(process.env);
const prisma = new PrismaClient();

type EventMap = Record<string, string[]>;

const INDEXER_CHECKPOINT_TX_HASH = '__indexer_checkpoint_main__';

function log(event: string, data?: Record<string, unknown>) {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[indexer] ${event}${payload}`);
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function wsToHttpUrl(wsUrl: string) {
  if (wsUrl.startsWith('wss://')) {
    return wsUrl.replace('wss://', 'https://').replace(/\/websocket$/, '');
  }
  if (wsUrl.startsWith('ws://')) {
    return wsUrl.replace('ws://', 'http://').replace(/\/websocket$/, '');
  }
  return wsUrl.replace(/\/websocket$/, '');
}

async function jsonRpcCall<T>(method: string, params: Record<string, unknown>) {
  const rpcUrl = wsToHttpUrl(env.INDEXER_CHAIN_WS_URL);
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error?.message) {
    throw new Error(`RPC ${method} error: ${payload.error.message}`);
  }

  if (!payload.result) {
    throw new Error(`RPC ${method} returned empty result`);
  }

  return payload.result;
}

function decodeBase64IfNeeded(value: string) {
  const maybeBase64 = /^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0;
  if (!maybeBase64) {
    return value;
  }

  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (!decoded) {
      return value;
    }

    const mostlyPrintable = decoded.split('').every((ch) => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
    });

    return mostlyPrintable ? decoded : value;
  } catch {
    return value;
  }
}

function normalizeEventMap(input: unknown): EventMap {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const asRecord = input as Record<string, unknown>;
    const fromMap: EventMap = {};

    for (const [key, rawValue] of Object.entries(asRecord)) {
      if (Array.isArray(rawValue)) {
        fromMap[key] = rawValue.filter((item): item is string => typeof item === 'string').map(decodeBase64IfNeeded);
      }
    }

    if (Object.keys(fromMap).length > 0) {
      return fromMap;
    }
  }

  if (Array.isArray(input)) {
    const fromArray: EventMap = {};

    for (const event of input) {
      if (!event || typeof event !== 'object') {
        continue;
      }

      const typedEvent = event as { type?: string; attributes?: Array<{ key?: string; value?: string }> };
      const type = typedEvent.type;
      if (!type || !typedEvent.attributes) {
        continue;
      }

      for (const attribute of typedEvent.attributes) {
        if (!attribute?.key || typeof attribute.value !== 'string') {
          continue;
        }

        const key = `${type}.${decodeBase64IfNeeded(attribute.key)}`;
        const value = decodeBase64IfNeeded(attribute.value);
        fromArray[key] = [...(fromArray[key] ?? []), value];
      }
    }

    return fromArray;
  }

  return {};
}

async function getCheckpointHeight() {
  const checkpoint = await prisma.transaction.findUnique({
    where: { txHash: INDEXER_CHECKPOINT_TX_HASH }
  });

  if (!checkpoint) {
    return env.INDEXER_START_HEIGHT ?? 1;
  }

  const height = Math.max(1, Math.floor(checkpoint.amount));
  return env.INDEXER_START_HEIGHT ? Math.max(env.INDEXER_START_HEIGHT, height) : height;
}

async function setCheckpointHeight(height: number) {
  const normalizedHeight = Math.max(1, Math.floor(height));
  await prisma.transaction.upsert({
    where: { txHash: INDEXER_CHECKPOINT_TX_HASH },
    update: {
      type: 'INDEXER_CHECKPOINT',
      from: 'indexer',
      to: 'indexer',
      amount: normalizedHeight,
      token: 'HEIGHT'
    },
    create: {
      type: 'INDEXER_CHECKPOINT',
      from: 'indexer',
      to: 'indexer',
      amount: normalizedHeight,
      token: 'HEIGHT',
      txHash: INDEXER_CHECKPOINT_TX_HASH
    }
  });
}

async function getLatestChainHeight() {
  const status = await jsonRpcCall<{
    sync_info?: { latest_block_height?: string };
  }>('status', {});

  const latest = Number(status.sync_info?.latest_block_height ?? 0);
  return Number.isFinite(latest) && latest > 0 ? Math.floor(latest) : 0;
}

async function replayMissedTransactions() {
  if (!env.INDEXER_BACKFILL_ENABLED) {
    log('backfill.skipped', { reason: 'disabled' });
    return;
  }

  const [checkpointHeight, latestHeight] = await Promise.all([getCheckpointHeight(), getLatestChainHeight()]);

  if (latestHeight <= 0 || checkpointHeight > latestHeight) {
    log('backfill.none', { checkpointHeight, latestHeight });
    return;
  }

  log('backfill.start', { checkpointHeight, latestHeight });

  const query = `tx.height>=${checkpointHeight} AND tx.height<=${latestHeight}`;
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;
  let processed = 0;
  let highestHeight = checkpointHeight;

  while ((page - 1) * env.INDEXER_BACKFILL_PAGE_SIZE < totalCount) {
    const result = await jsonRpcCall<{
      txs?: Array<{
        hash?: string;
        height?: string;
        tx_result?: { events?: unknown };
      }>;
      total_count?: string;
    }>('tx_search', {
      query,
      prove: false,
      page: String(page),
      per_page: String(env.INDEXER_BACKFILL_PAGE_SIZE),
      order_by: 'asc'
    });

    const txs = result.txs ?? [];
    totalCount = Number(result.total_count ?? '0');

    if (txs.length === 0) {
      break;
    }

    for (const tx of txs) {
      const events = normalizeEventMap(tx.tx_result?.events);
      const txHash = tx.hash ? tx.hash.toUpperCase() : undefined;
      const txHeight = tx.height ?? undefined;

      const mergedEvents: EventMap = {
        ...events,
        ...(txHash ? { 'tx.hash': [txHash] } : {}),
        ...(txHeight ? { 'tx.height': [txHeight] } : {})
      };

      if (Object.keys(mergedEvents).length === 0) {
        continue;
      }

      await handleTxEvents(mergedEvents);
      processed += 1;

      const numericHeight = Number(txHeight ?? 0);
      if (Number.isFinite(numericHeight) && numericHeight > highestHeight) {
        highestHeight = Math.floor(numericHeight);
      }
    }

    page += 1;
  }

  await setCheckpointHeight(highestHeight);
  log('backfill.done', { processed, checkpointHeight, highestHeight, latestHeight });
}

function firstValue(map: EventMap, keys: string[]) {
  for (const key of keys) {
    const value = map[key]?.[0];
    if (value) {
      return value;
    }
  }
  return undefined;
}

function numberValue(raw?: string, fallback = 0) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function chainId(prefix: string, ...parts: Array<string | undefined>) {
  const safe = parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9_-]/g, '-');

  return `${prefix}-${safe || Date.now().toString()}`.slice(0, 191);
}

function detectEventKinds(map: EventMap) {
  const keys = Object.keys(map).join(' ');
  return {
    deploymentCreated: keys.includes('EventDeploymentCreated'),
    deploymentClosed: keys.includes('EventDeploymentClosed'),
    bidCreated: keys.includes('EventBidCreated'),
    leaseCreated: keys.includes('EventLeaseCreated'),
    leaseClosed: keys.includes('EventLeaseClosed')
  };
}

async function ensureProvider(address?: string) {
  if (!address) {
    return null;
  }

  return prisma.provider.upsert({
    where: { address },
    update: { lastSeen: new Date(), status: 'ACTIVE' },
    create: {
      address,
      region: 'chain-indexed',
      cpu: 0,
      memory: 0,
      storage: 0,
      pricePerCpu: 0,
      status: 'ACTIVE',
      lastSeen: new Date()
    }
  });
}

async function ensureDeployment(owner?: string, dseq?: string) {
  if (!owner || !dseq) {
    return null;
  }

  const id = chainId('chain-d', owner, dseq);
  return prisma.deployment.upsert({
    where: { id },
    update: {
      tenantAddress: owner,
      status: 'OPEN'
    },
    create: {
      id,
      tenantAddress: owner,
      sdl: '# indexed from chain events',
      status: 'OPEN'
    }
  });
}

async function upsertTxAudit(type: string, txHash: string, from: string, to: string, amount = 0, token = 'ucnt') {
  await prisma.transaction.upsert({
    where: { txHash },
    update: {
      type,
      from,
      to,
      amount,
      token
    },
    create: {
      type,
      from,
      to,
      amount,
      token,
      txHash
    }
  });
}

async function handleTxEvents(eventMap: EventMap) {
  const txHash = firstValue(eventMap, ['tx.hash']) ?? chainId('tx', Date.now().toString());
  const txHeight = numberValue(firstValue(eventMap, ['tx.height']), 0);

  const owner = firstValue(eventMap, [
    'comnetish.deployment.v1.EventDeploymentCreated.owner',
    'akash.deployment.v1.EventDeploymentCreated.owner',
    'comnetish.market.v1.EventBidCreated.owner',
    'akash.market.v1.EventBidCreated.owner',
    'comnetish.market.v1.EventLeaseCreated.owner',
    'akash.market.v1.EventLeaseCreated.owner'
  ]);

  const providerAddress = firstValue(eventMap, [
    'comnetish.market.v1.EventBidCreated.provider',
    'akash.market.v1.EventBidCreated.provider',
    'comnetish.market.v1.EventLeaseCreated.provider',
    'akash.market.v1.EventLeaseCreated.provider',
    'comnetish.market.v1.EventLeaseClosed.provider',
    'akash.market.v1.EventLeaseClosed.provider'
  ]);

  const dseq = firstValue(eventMap, [
    'comnetish.deployment.v1.EventDeploymentCreated.dseq',
    'akash.deployment.v1.EventDeploymentCreated.dseq',
    'comnetish.market.v1.EventBidCreated.dseq',
    'akash.market.v1.EventBidCreated.dseq',
    'comnetish.market.v1.EventLeaseCreated.dseq',
    'akash.market.v1.EventLeaseCreated.dseq',
    'comnetish.market.v1.EventLeaseClosed.dseq',
    'akash.market.v1.EventLeaseClosed.dseq',
    'comnetish.deployment.v1.EventDeploymentClosed.dseq',
    'akash.deployment.v1.EventDeploymentClosed.dseq'
  ]);

  const gseq = firstValue(eventMap, [
    'comnetish.market.v1.EventBidCreated.gseq',
    'akash.market.v1.EventBidCreated.gseq',
    'comnetish.market.v1.EventLeaseCreated.gseq',
    'akash.market.v1.EventLeaseCreated.gseq'
  ]);

  const oseq = firstValue(eventMap, [
    'comnetish.market.v1.EventBidCreated.oseq',
    'akash.market.v1.EventBidCreated.oseq',
    'comnetish.market.v1.EventLeaseCreated.oseq',
    'akash.market.v1.EventLeaseCreated.oseq'
  ]);

  const priceAmount = firstValue(eventMap, [
    'comnetish.market.v1.EventBidCreated.price.amount',
    'akash.market.v1.EventBidCreated.price.amount',
    'comnetish.market.v1.EventLeaseCreated.price.amount',
    'akash.market.v1.EventLeaseCreated.price.amount'
  ]);

  const kinds = detectEventKinds(eventMap);

  const [provider, deployment] = await Promise.all([ensureProvider(providerAddress), ensureDeployment(owner, dseq)]);

  if (kinds.deploymentCreated && owner && deployment) {
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'OPEN', tenantAddress: owner }
    });

    await upsertTxAudit('DEPLOYMENT_CREATED', txHash, owner, 'x/deployment');
    log('deployment.created', { deploymentId: deployment.id, txHash });
  }

  if (kinds.bidCreated && deployment && provider) {
    const bidId = chainId('chain-bid', dseq, gseq, oseq, provider.address);
    await prisma.bid.upsert({
      where: { id: bidId },
      update: {
        price: numberValue(priceAmount, 0),
        status: 'OPEN'
      },
      create: {
        id: bidId,
        deploymentId: deployment.id,
        providerId: provider.id,
        price: numberValue(priceAmount, 0),
        status: 'OPEN'
      }
    });

    await upsertTxAudit('BID_CREATED', txHash, provider.address, deployment.tenantAddress, numberValue(priceAmount, 0));
    log('bid.created', { bidId, txHash });
  }

  if (kinds.leaseCreated && deployment && provider) {
    const leaseId = chainId('chain-lease', dseq, gseq, oseq, provider.address);
    const bidId = chainId('chain-bid', dseq, gseq, oseq, provider.address);

    await prisma.$transaction(async (tx) => {
      await tx.lease.upsert({
        where: { id: leaseId },
        update: {
          status: 'ACTIVE',
          pricePerBlock: numberValue(priceAmount, 0)
        },
        create: {
          id: leaseId,
          deploymentId: deployment.id,
          providerId: provider.id,
          status: 'ACTIVE',
          pricePerBlock: numberValue(priceAmount, 0)
        }
      });

      await tx.deployment.update({
        where: { id: deployment.id },
        data: { status: 'ACTIVE' }
      });

      await tx.bid.upsert({
        where: { id: bidId },
        update: { status: 'WON', price: numberValue(priceAmount, 0) },
        create: {
          id: bidId,
          deploymentId: deployment.id,
          providerId: provider.id,
          price: numberValue(priceAmount, 0),
          status: 'WON'
        }
      });

      await tx.bid.updateMany({
        where: {
          deploymentId: deployment.id,
          id: { not: bidId },
          status: 'OPEN'
        },
        data: { status: 'LOST' }
      });
    });

    await upsertTxAudit('LEASE_CREATED', txHash, deployment.tenantAddress, provider.address, numberValue(priceAmount, 0));
    log('lease.created', { leaseId, txHash });
  }

  if (kinds.leaseClosed && deployment && provider) {
    const leaseId = chainId('chain-lease', dseq, gseq, oseq, provider.address);
    await prisma.lease.updateMany({
      where: { id: leaseId },
      data: { status: 'CLOSED' }
    });

    await upsertTxAudit('LEASE_CLOSED', txHash, provider.address, deployment.tenantAddress);
    log('lease.closed', { leaseId, txHash });
  }

  if (kinds.deploymentClosed && deployment) {
    await prisma.$transaction(async (tx) => {
      await tx.deployment.update({
        where: { id: deployment.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date()
        }
      });

      await tx.lease.updateMany({
        where: {
          deploymentId: deployment.id,
          status: { in: ['PENDING', 'ACTIVE'] }
        },
        data: { status: 'CLOSED' }
      });
    });

    await upsertTxAudit('DEPLOYMENT_CLOSED', txHash, deployment.tenantAddress, 'x/deployment');
    log('deployment.closed', { deploymentId: deployment.id, txHash });
  }

  if (txHeight > 0) {
    await setCheckpointHeight(txHeight);
  }
}

function connect() {
  log('connecting', { url: env.INDEXER_CHAIN_WS_URL, query: env.INDEXER_SUBSCRIBE_QUERY });
  const socket = new WebSocket(env.INDEXER_CHAIN_WS_URL);

  socket.on('open', () => {
    socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'comnetish-indexer-subscribe',
        method: 'subscribe',
        params: {
          query: env.INDEXER_SUBSCRIBE_QUERY
        }
      })
    );

    log('subscribed');
  });

  socket.on('message', async (raw) => {
    const data = typeof raw === 'string' ? raw : raw.toString('utf8');
    const parsed = parseJson<{
      result?: {
        events?: EventMap;
        data?: { value?: { TxResult?: { result?: { events?: unknown } } } };
      };
      error?: { message?: string };
    }>(data);

    if (!parsed) {
      return;
    }

    if (parsed.error?.message) {
      log('chain.error', { message: parsed.error.message });
      return;
    }

    const directEvents = normalizeEventMap(parsed.result?.events);
    const nestedEvents = normalizeEventMap(parsed.result?.data?.value?.TxResult?.result?.events);
    const mergedEvents: EventMap = { ...directEvents };

    for (const [key, value] of Object.entries(nestedEvents)) {
      mergedEvents[key] = [...(mergedEvents[key] ?? []), ...value];
    }

    if (Object.keys(mergedEvents).length === 0) {
      return;
    }

    await handleTxEvents(mergedEvents).catch((error) => {
      log('event.handle_failed', {
        error: error instanceof Error ? error.message : 'unknown error'
      });
    });
  });

  socket.on('close', () => {
    log('socket.closed', { reconnectInMs: env.INDEXER_RECONNECT_DELAY_MS });
    setTimeout(connect, env.INDEXER_RECONNECT_DELAY_MS);
  });

  socket.on('error', (error) => {
    log('socket.error', {
      error: error instanceof Error ? error.message : 'unknown error'
    });
  });
}

async function main() {
  await prisma.$connect();
  log('ready');
  await replayMissedTransactions();
  connect();
}

main().catch(async (error) => {
  log('fatal', { error: error instanceof Error ? error.message : 'unknown error' });
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
