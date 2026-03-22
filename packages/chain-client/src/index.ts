import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice, SigningStargateClient } from '@cosmjs/stargate';

export type DeploymentStatus = 'OPEN' | 'ACTIVE' | 'CLOSED';
export type ProviderStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export type Deployment = {
  id: string;
  tenantAddress: string;
  sdl: string;
  status: DeploymentStatus;
  createdAt: string;
  closedAt?: string | null;
};

export type Provider = {
  id: string;
  address: string;
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  pricePerCpu: number;
  status: ProviderStatus;
  lastSeen: string;
};

export type ChainEvent = {
  type: string;
  txHash?: string;
  height?: number;
  data: Record<string, unknown>;
  raw?: unknown;
};

export type CreateDeploymentMsg = {
  sdl: string;
  tenantAddress: string;
};

export type CreateBidMsg = {
  deploymentId: string;
  price: number;
  providerAddress: string;
};

export type CreateLeaseMsg = {
  deploymentId: string;
  bidId: string;
  tenantAddress: string;
};

export type RegisterProviderMsg = {
  ownerAddress: string;
  hostUri: string;
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  pricePerCpu: number;
};

export type CreateCertificateMsg = {
  ownerAddress: string;
  publicKey: string;
  certificatePem: string;
};

export type CloseDeploymentMsg = {
  deploymentId: string;
  tenantAddress: string;
};

export type ComnetishClientConfig = {
  rpcUrl: string;
  restUrl: string;
  chainId: string;
  gasPrice?: string;
  usdPerCnt?: number;
  mock?: boolean;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
};

function envVar(name: string): string | undefined {
  const runtime = globalThis as unknown as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return runtime.process?.env?.[name];
}

const DEFAULT_CONFIG: ComnetishClientConfig = {
  rpcUrl: envVar('NEXT_PUBLIC_CHAIN_RPC_URL') ?? envVar('COMNETISH_RPC_URL') ?? 'http://localhost:26657',
  restUrl: envVar('NEXT_PUBLIC_CHAIN_REST_URL') ?? envVar('COMNETISH_REST_URL') ?? 'http://localhost:1317',
  chainId: envVar('NEXT_PUBLIC_CHAIN_ID') ?? envVar('COMNETISH_CHAIN_ID') ?? 'comnetish-1',
  gasPrice: envVar('COMNETISH_GAS_PRICE') ?? '0.025ucnt',
  usdPerCnt: Number(envVar('COMNETISH_USD_PER_CNT') ?? 0.19),
  mock: String(envVar('COMNETISH_MOCK') ?? '').toLowerCase() === 'true',
  retryAttempts: Number(envVar('COMNETISH_RETRY_ATTEMPTS') ?? 3),
  retryBaseDelayMs: Number(envVar('COMNETISH_RETRY_BASE_DELAY_MS') ?? 400)
};

const textEncoder = new TextEncoder();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`[ComnetishClient] ${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error(
    `[ComnetishClient] ${label} failed after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function generateTxHash(seed: string) {
  const random = Math.random().toString(16).slice(2, 18);
  const normalized = `${Date.now()}${seed}${random}`.replace(/[^a-zA-Z0-9]/g, '');
  return `0x${normalized.padEnd(64, '0').slice(0, 64)}`;
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function requireWebSocket(): typeof WebSocket {
  if (typeof WebSocket !== 'undefined') {
    return WebSocket;
  }
  throw new Error('[ComnetishClient] WebSocket is not available in this runtime');
}

function normalizeRpcWebSocketUrl(rpcUrl: string) {
  const trimmed = rpcUrl.replace(/\/$/, '');
  if (trimmed.startsWith('https://')) {
    return `${trimmed.replace('https://', 'wss://')}/websocket`;
  }
  if (trimmed.startsWith('http://')) {
    return `${trimmed.replace('http://', 'ws://')}/websocket`;
  }
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed.endsWith('/websocket') ? trimmed : `${trimmed}/websocket`;
  }
  return `ws://${trimmed}/websocket`;
}

function parseCoinsUcnt(balancePayload: unknown): number {
  const payload = balancePayload as { balance?: { amount?: string } };
  const amount = Number(payload.balance?.amount ?? 0);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return amount / 1_000_000;
}

async function parseBroadcastResult(result: Awaited<ReturnType<SigningStargateClient['signAndBroadcast']>>) {
  if (result.code !== 0) {
    throw new Error(`[ComnetishClient] Tx failed with code ${result.code}: ${result.rawLog}`);
  }

  return {
    txHash: result.transactionHash
  };
}

async function createSignerFromMnemonic(mnemonic: string) {
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: 'comnetish'
  });
}

export class ComnetishClient {
  private readonly config: Required<ComnetishClientConfig>;

  constructor(config: Partial<ComnetishClientConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      gasPrice: config.gasPrice ?? DEFAULT_CONFIG.gasPrice ?? '0.025ucnt',
      usdPerCnt: config.usdPerCnt ?? DEFAULT_CONFIG.usdPerCnt ?? 0.19,
      mock: config.mock ?? DEFAULT_CONFIG.mock ?? false,
      retryAttempts: config.retryAttempts ?? DEFAULT_CONFIG.retryAttempts ?? 3,
      retryBaseDelayMs: config.retryBaseDelayMs ?? DEFAULT_CONFIG.retryBaseDelayMs ?? 400
    };
  }

  getConfig() {
    return this.config;
  }

  private async withClient<T>(mnemonic: string, handler: (client: SigningStargateClient, address: string) => Promise<T>) {
    return withRetry(
      async () => {
        const signer = await createSignerFromMnemonic(mnemonic);
        const [account] = await signer.getAccounts();
        if (!account) {
          throw new Error('No account found for provided mnemonic');
        }

        const client = await SigningStargateClient.connectWithSigner(this.config.rpcUrl, signer, {
          gasPrice: GasPrice.fromString(this.config.gasPrice)
        });

        try {
          return await handler(client, account.address);
        } finally {
          client.disconnect();
        }
      },
      this.config.retryAttempts,
      this.config.retryBaseDelayMs,
      'sign+broadcast connection'
    );
  }

  async createDeployment(sdl: string, tenantKey: string): Promise<{ txHash: string; deploymentId: string }> {
    if (this.config.mock) {
      return {
        txHash: generateTxHash(`deployment:${sdl}`),
        deploymentId: generateId('dseq')
      };
    }

    const deploymentId = generateId('dseq');
    const result = await this.withClient(tenantKey, async (client, tenantAddress) => {
      const msg: CreateDeploymentMsg = { sdl, tenantAddress };
      
      // TODO(protobuf): Replace JSON encoding with protobuf
      // When chain/proto is available, use:
      //   import { MsgCreateDeployment } from './proto/comnetish/deployment/v1/msg.js';
      //   const pbMsg = MsgCreateDeployment.create({ ...msg, deploymentId });
      //   value: MsgCreateDeployment.encode(pbMsg).finish()
      // For now, JSON encoding works for mock/testing but is not production-compatible
      
      return client.signAndBroadcast(
        tenantAddress,
        [
          {
            typeUrl: '/comnetish.deployment.v1.MsgCreateDeployment',
            value: textEncoder.encode(JSON.stringify({ ...msg, deploymentId }))
          }
        ],
        'auto'
      );
    });

    const tx = await parseBroadcastResult(result);
    return { txHash: tx.txHash, deploymentId };
  }

  async createBid(deploymentId: string, price: number, providerKey: string): Promise<{ txHash: string }> {
    if (this.config.mock) {
      return { txHash: generateTxHash(`bid:${deploymentId}:${price}`) };
    }

    const result = await this.withClient(providerKey, async (client, providerAddress) => {
      const msg: CreateBidMsg = { deploymentId, price, providerAddress };
      
      // TODO(protobuf): Replace JSON encoding with protobuf (see PROTO_SETUP.md)
      return client.signAndBroadcast(
        providerAddress,
        [
          {
            typeUrl: '/comnetish.market.v1.MsgCreateBid',
            value: textEncoder.encode(JSON.stringify(msg))
          }
        ],
        'auto'
      );
    });

    return parseBroadcastResult(result);
  }

  async createLease(deploymentId: string, bidId: string, tenantKey: string): Promise<{ txHash: string }> {
    if (this.config.mock) {
      return { txHash: generateTxHash(`lease:${deploymentId}:${bidId}`) };
    }

    const result = await this.withClient(tenantKey, async (client, tenantAddress) => {
      const msg: CreateLeaseMsg = { deploymentId, bidId, tenantAddress };
      
      // TODO(protobuf): Replace JSON encoding with protobuf (see PROTO_SETUP.md)
      return client.signAndBroadcast(
        tenantAddress,
        [
          {
            typeUrl: '/comnetish.market.v1.MsgCreateLease',
            value: textEncoder.encode(JSON.stringify(msg))
          }
        ],
        'auto'
      );
    });

    return parseBroadcastResult(result);
  }

  async closeDeployment(deploymentId: string, tenantKey: string): Promise<{ txHash: string }> {
    if (this.config.mock) {
      return { txHash: generateTxHash(`close:${deploymentId}`) };
    }

    const result = await this.withClient(tenantKey, async (client, tenantAddress) => {
      const msg: CloseDeploymentMsg = { deploymentId, tenantAddress };
      return client.signAndBroadcast(
        tenantAddress,
        [
          {
            typeUrl: '/comnetish.deployment.v1.MsgCloseDeployment',
            value: textEncoder.encode(JSON.stringify(msg))
          }
        ],
        'auto'
      );
    });

    return parseBroadcastResult(result);
  }

  async registerProvider(
    provider: Omit<RegisterProviderMsg, 'ownerAddress'>,
    providerKey: string
  ): Promise<{ txHash: string }> {
    if (this.config.mock) {
      return {
        txHash: generateTxHash(`provider:${provider.hostUri}:${provider.region}`)
      };
    }

    const result = await this.withClient(providerKey, async (client, ownerAddress) => {
      const msg: RegisterProviderMsg = {
        ownerAddress,
        ...provider
      };

      // TODO(protobuf): Replace JSON encoding with protobuf (see PROTO_SETUP.md)
      return client.signAndBroadcast(
        ownerAddress,
        [
          {
            typeUrl: '/comnetish.provider.v1.MsgCreateProvider',
            value: textEncoder.encode(JSON.stringify(msg))
          }
        ],
        'auto'
      );
    });

    return parseBroadcastResult(result);
  }

  async createProviderCertificate(
    certificate: Omit<CreateCertificateMsg, 'ownerAddress'>,
    providerKey: string
  ): Promise<{ txHash: string }> {
    if (this.config.mock) {
      return {
        txHash: generateTxHash(`cert:${certificate.publicKey.slice(0, 24)}`)
      };
    }

    const result = await this.withClient(providerKey, async (client, ownerAddress) => {
      const msg: CreateCertificateMsg = {
        ownerAddress,
        ...certificate
      };

      // TODO(protobuf): Replace JSON encoding with protobuf (see PROTO_SETUP.md)
      return client.signAndBroadcast(
        ownerAddress,
        [
          {
            typeUrl: '/comnetish.cert.v1.MsgCreateCertificate',
            value: textEncoder.encode(JSON.stringify(msg))
          }
        ],
        'auto'
      );
    });

    return parseBroadcastResult(result);
  }

  async getBalance(address: string): Promise<{ cnt: number; usd: number }> {
    if (this.config.mock) {
      const cnt = 4382.54;
      return { cnt, usd: Number((cnt * this.config.usdPerCnt).toFixed(2)) };
    }

    const response = await withRetry(
      async () => {
        const url = `${this.config.restUrl.replace(/\/$/, '')}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=ucnt`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Balance query failed with status ${res.status}`);
        }
        return res.json();
      },
      this.config.retryAttempts,
      this.config.retryBaseDelayMs,
      'balance query'
    );

    const cnt = parseCoinsUcnt(response);
    return { cnt, usd: Number((cnt * this.config.usdPerCnt).toFixed(2)) };
  }

  async getDeployments(address: string): Promise<Deployment[]> {
    if (this.config.mock) {
      return [
        {
          id: 'dseq-100001',
          tenantAddress: address,
          sdl: 'services:\n  web:\n    image: nginx:alpine',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
          closedAt: null
        },
        {
          id: 'dseq-100002',
          tenantAddress: address,
          sdl: 'services:\n  api:\n    image: node:20-alpine',
          status: 'OPEN',
          createdAt: new Date(Date.now() - 14_400_000).toISOString(),
          closedAt: null
        }
      ];
    }

    return withRetry(
      async () => {
        const base = this.config.restUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/comnetish/deployments?owner=${encodeURIComponent(address)}`);
        if (!res.ok) {
          throw new Error(`Deployments query failed with status ${res.status}`);
        }
        const payload = (await res.json()) as { deployments?: Deployment[] };
        return payload.deployments ?? [];
      },
      this.config.retryAttempts,
      this.config.retryBaseDelayMs,
      'deployments query'
    );
  }

  async getProviders(): Promise<Provider[]> {
    if (this.config.mock) {
      return [
        {
          id: 'prov-1',
          address: 'comnetish1providerusw91z7m0y7l3n',
          region: 'US-West',
          cpu: 48,
          memory: 196608,
          storage: 2500,
          pricePerCpu: 0.36,
          status: 'ACTIVE',
          lastSeen: new Date().toISOString()
        },
        {
          id: 'prov-2',
          address: 'comnetish1providereuc1f7k8v8p6z',
          region: 'EU-Central',
          cpu: 64,
          memory: 262144,
          storage: 3200,
          pricePerCpu: 0.41,
          status: 'ACTIVE',
          lastSeen: new Date(Date.now() - 300_000).toISOString()
        },
        {
          id: 'prov-3',
          address: 'comnetish1providerasia1w3p8m4r2',
          region: 'Asia-Singapore',
          cpu: 40,
          memory: 163840,
          storage: 2200,
          pricePerCpu: 0.38,
          status: 'MAINTENANCE',
          lastSeen: new Date(Date.now() - 1_200_000).toISOString()
        }
      ];
    }

    return withRetry(
      async () => {
        const base = this.config.restUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/comnetish/providers`);
        if (!res.ok) {
          throw new Error(`Providers query failed with status ${res.status}`);
        }
        const payload = (await res.json()) as { providers?: Provider[] };
        return payload.providers ?? [];
      },
      this.config.retryAttempts,
      this.config.retryBaseDelayMs,
      'providers query'
    );
  }

  subscribeToEvents(callback: (event: ChainEvent) => void): WebSocket {
    const WebSocketImpl = requireWebSocket();

    if (this.config.mock) {
      const socket = {
        readyState: 1,
        close: () => undefined
      } as unknown as WebSocket;

      const interval = setInterval(() => {
        callback({
          type: 'mock.block',
          height: Math.floor(Date.now() / 1000),
          data: {
            deployments: Math.floor(Math.random() * 10) + 20,
            activeProviders: Math.floor(Math.random() * 4) + 8,
            cntVolume: Number((Math.random() * 1200 + 500).toFixed(2))
          }
        });
      }, 3000);

      const originalClose = socket.close.bind(socket);
      socket.close = (...args: unknown[]) => {
        clearInterval(interval);
        return originalClose(...(args as []));
      };

      return socket;
    }

    const wsUrl = normalizeRpcWebSocketUrl(this.config.rpcUrl);
    const socket = new WebSocketImpl(wsUrl);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'comnetish-subscribe',
          method: 'subscribe',
          params: {
            query: "tm.event='Tx'"
          }
        })
      );
    };

    socket.onmessage = (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as {
          result?: { data?: { value?: Record<string, unknown> }; events?: Record<string, string[]> };
        };

        const txHash = payload.result?.events?.['tx.hash']?.[0];
        callback({
          type: 'tx',
          txHash,
          data: payload.result?.data?.value ?? {},
          raw: payload
        });
      } catch (error) {
        callback({
          type: 'parse_error',
          data: {
            message: error instanceof Error ? error.message : 'Unknown websocket parse error'
          },
          raw: message.data
        });
      }
    };

    socket.onerror = () => {
      callback({
        type: 'connection_error',
        data: {
          message: 'WebSocket connection error'
        }
      });
    };

    return socket;
  }
}

const defaultClient = new ComnetishClient();

export async function createDeployment(
  sdl: string,
  tenantKey: string
): Promise<{ txHash: string; deploymentId: string }> {
  return defaultClient.createDeployment(sdl, tenantKey);
}

export async function createBid(
  deploymentId: string,
  price: number,
  providerKey: string
): Promise<{ txHash: string }> {
  return defaultClient.createBid(deploymentId, price, providerKey);
}

export async function createLease(
  deploymentId: string,
  bidId: string,
  tenantKey: string
): Promise<{ txHash: string }> {
  return defaultClient.createLease(deploymentId, bidId, tenantKey);
}

export async function closeDeployment(
  deploymentId: string,
  tenantKey: string
): Promise<{ txHash: string }> {
  return defaultClient.closeDeployment(deploymentId, tenantKey);
}

export async function registerProvider(
  provider: Omit<RegisterProviderMsg, 'ownerAddress'>,
  providerKey: string
): Promise<{ txHash: string }> {
  return defaultClient.registerProvider(provider, providerKey);
}

export async function createProviderCertificate(
  certificate: Omit<CreateCertificateMsg, 'ownerAddress'>,
  providerKey: string
): Promise<{ txHash: string }> {
  return defaultClient.createProviderCertificate(certificate, providerKey);
}

export async function getBalance(address: string): Promise<{ cnt: number; usd: number }> {
  return defaultClient.getBalance(address);
}

export async function getDeployments(address: string): Promise<Deployment[]> {
  return defaultClient.getDeployments(address);
}

export async function getProviders(): Promise<Provider[]> {
  return defaultClient.getProviders();
}

export function subscribeToEvents(callback: (event: ChainEvent) => void): WebSocket {
  return defaultClient.subscribeToEvents(callback);
}