const log = (op: string, data?: unknown) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[provider-gateway] ${op}`, data ?? '');
  }
};

export interface ProviderGatewayConfig {
  baseUrl: string;
  leaseId: string;
  deploymentOwner: string;
  deploymentSequence: string;
  mTlsEnabled?: boolean;
  followLogs?: boolean;
  tailLines?: number;
  timeout?: number;
}

export function buildProviderLogUrl(config: ProviderGatewayConfig): string {
  const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
  const owner = config.deploymentOwner.replace(/^(akash|cosmos)1/, '');
  const dseq = config.deploymentSequence;
  return `${base}/lease/${owner}/${dseq}/logs`;
}

export function buildProviderManifestUrl(config: Omit<ProviderGatewayConfig, 'leaseId'>): string {
  const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
  const owner = config.deploymentOwner.replace(/^(akash|cosmos)1/, '');
  const dseq = config.deploymentSequence;
  return `${base}/lease/${owner}/${dseq}/manifest`;
}

/**
 * Connects to a provider's logs WebSocket and streams messages
 * Returns a promise that resolves when the stream ends or rejects on error
 */
export async function connectProviderLogsStream(
  config: ProviderGatewayConfig,
  onMessage: (data: string) => Promise<void>
): Promise<void> {
  const url = buildProviderLogUrl(config);
  const wsUrl = url.replace(/^http/, 'ws');

  log('connect', { wsUrl, leaseId: config.leaseId });

  return new Promise((resolve, reject) => {
    let attempted = false;
    let closed = false;

    const socket = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      if (!attempted) {
        socket.close();
        reject(new Error('Provider logs connection timeout'));
      }
    }, config.timeout ?? 10000);

    socket.addEventListener('open', () => {
      attempted = true;
      clearTimeout(timeout);
      log('opened', { leaseId: config.leaseId });
    });

    socket.addEventListener('message', async (event) => {
      try {
        const messageData = event.data;
        if (typeof messageData === 'string') {
          await onMessage(messageData);
        }
      } catch (error) {
        console.error('[provider-gateway] onMessage handler failed:', error);
      }
    });

    socket.addEventListener('error', (event) => {
      clearTimeout(timeout);
      const error = new Error(`Provider logs error: ${event.type}`);
      log('error', { error: error.message, leaseId: config.leaseId });

      if (!attempted) {
        reject(error);
      } else if (!closed) {
        console.error('[provider-gateway] stream error:', error);
      }
    });

    socket.addEventListener('close', () => {
      closed = true;
      clearTimeout(timeout);
      log('closed', { leaseId: config.leaseId });
      resolve();
    });
  });
}

/**
 * Fetches recent logs via HTTP GET (log tail)
 */
export async function getProviderLogsTail(
  config: Omit<ProviderGatewayConfig, 'followLogs'>,
  tailLines: number = 100
): Promise<string> {
  const url = buildProviderLogUrl({ ...config, followLogs: false, tailLines });
  const queryUrl = `${url}?tail=${tailLines}`;

  log('tail', { queryUrl });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout ?? 5000);

    const response = await fetch(queryUrl, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return text;
  } catch (error) {
    console.error('[provider-gateway] tail failed:', error);
    throw error;
  }
}

export async function submitDeploymentManifest(
  config: Omit<ProviderGatewayConfig, 'leaseId' | 'followLogs' | 'tailLines'>,
  manifestSdl: string
): Promise<{ status: number; body?: string }> {
  const url = buildProviderManifestUrl(config);

  log('submit-manifest', { url });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout ?? 30000);

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdl: manifestSdl }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const body = await response.text();
    return { status: response.status, body };
  } catch (error) {
    console.error('[provider-gateway] submit-manifest failed:', error);
    throw error;
  }
}
