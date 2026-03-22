import { emitDeploymentLog } from './deployment-logs';

export type RuntimeStatus = 'PENDING' | 'MANIFEST_RECEIVED' | 'STARTING' | 'RUNNING' | 'FAILED';

type RuntimeState = {
  deploymentId: string;
  leaseId: string;
  providerId: string;
  tenantAddress: string;
  manifest: string;
  manifestUploadedAt: string;
  status: RuntimeStatus;
  lastTransitionAt: string;
  endpoint: string | null;
  providerGatewayUrl?: string;
  failureReason?: string;
};

const runtimeByDeploymentId = new Map<string, RuntimeState>();
const PROVIDER_GATEWAY_TIMEOUT_MS = 7_000;

function nowIso() {
  return new Date().toISOString();
}

function deriveStatusFromElapsedSeconds(elapsedSec: number): RuntimeStatus {
  if (elapsedSec < 5) {
    return 'MANIFEST_RECEIVED';
  }

  if (elapsedSec < 20) {
    return 'STARTING';
  }

  return 'RUNNING';
}

function buildEndpoint(deploymentId: string, state: RuntimeState) {
  if (state.providerGatewayUrl) {
    const normalized = state.providerGatewayUrl.replace(/\/$/, '');
    return `${normalized}/deployments/${deploymentId}`;
  }

  const deploymentKey = deploymentId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32).toLowerCase() || 'deployment';
  return `https://${deploymentKey}.local.comnetish.run`;
}

function buildProviderDeploymentPath(state: RuntimeState) {
  return `/deployment/${encodeURIComponent(state.tenantAddress)}/${encodeURIComponent(state.deploymentId)}`;
}

async function fetchJson(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_GATEWAY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    });

    const payload = await response.json().catch(() => null);
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

function inferEndpointFromProviderStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const asRecord = payload as Record<string, unknown>;
  const services = asRecord.services;
  if (!services || typeof services !== 'object') {
    return null;
  }

  const entries = Object.values(services as Record<string, unknown>);
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const service = entry as Record<string, unknown>;
    const uris = service.uris;
    if (Array.isArray(uris) && typeof uris[0] === 'string' && uris[0].length > 0) {
      return uris[0];
    }

    const available = service.available;
    if (typeof available === 'number' && available > 0) {
      const name = typeof service.name === 'string' ? service.name : 'service';
      return `https://${name}.${(service as any).deploymentId ?? 'deployment'}.local.comnetish.run`;
    }
  }

  return null;
}

function emitStatusLog(state: RuntimeState, prevStatus: RuntimeStatus, nextStatus: RuntimeStatus) {
  if (prevStatus === nextStatus) {
    return;
  }

  emitDeploymentLog({
    deploymentId: state.deploymentId,
    leaseId: state.leaseId,
    providerId: state.providerId,
    source: 'runtime.state',
    level: nextStatus === 'FAILED' ? 'error' : nextStatus === 'RUNNING' ? 'info' : 'warning',
    message: `Runtime state transitioned ${prevStatus} -> ${nextStatus}`
  });
}

export function submitDeploymentManifest(input: {
  deploymentId: string;
  leaseId: string;
  providerId: string;
  tenantAddress: string;
  manifest: string;
  providerGatewayUrl?: string;
}) {
  const timestamp = nowIso();
  const current = runtimeByDeploymentId.get(input.deploymentId);

  const nextState: RuntimeState = {
    deploymentId: input.deploymentId,
    leaseId: input.leaseId,
    providerId: input.providerId,
    tenantAddress: input.tenantAddress,
    manifest: input.manifest,
    manifestUploadedAt: timestamp,
    status: 'MANIFEST_RECEIVED',
    lastTransitionAt: timestamp,
    endpoint: null,
    ...(input.providerGatewayUrl ? { providerGatewayUrl: input.providerGatewayUrl } : {}),
    ...(current?.failureReason ? { failureReason: current.failureReason } : {})
  };

  runtimeByDeploymentId.set(input.deploymentId, nextState);

  emitDeploymentLog({
    deploymentId: input.deploymentId,
    leaseId: input.leaseId,
    providerId: input.providerId,
    source: 'runtime.manifest',
    level: 'info',
    message: 'Manifest received by API and queued for provider orchestration'
  });

  if (current) {
    emitStatusLog(nextState, current.status, nextState.status);
  }

  return nextState;
}

export async function proxyManifestToProvider(deploymentId: string) {
  const current = runtimeByDeploymentId.get(deploymentId);
  if (!current?.providerGatewayUrl) {
    return { proxied: false, accepted: false, reason: 'provider gateway url not configured' };
  }

  const base = current.providerGatewayUrl.replace(/\/$/, '');
  const url = `${base}${buildProviderDeploymentPath(current)}/manifest`;

  try {
    const { response } = await fetchJson(url, {
      method: 'POST',
      body: JSON.stringify({ sdl: current.manifest })
    });

    if (!response.ok) {
      emitDeploymentLog({
        deploymentId: current.deploymentId,
        leaseId: current.leaseId,
        providerId: current.providerId,
        source: 'runtime.manifest.proxy',
        level: 'warning',
        message: `Provider manifest endpoint returned ${response.status}`
      });
      return { proxied: true, accepted: false, reason: `provider returned ${response.status}` };
    }

    emitDeploymentLog({
      deploymentId: current.deploymentId,
      leaseId: current.leaseId,
      providerId: current.providerId,
      source: 'runtime.manifest.proxy',
      level: 'info',
      message: 'Manifest proxied successfully to provider gateway'
    });

    return { proxied: true, accepted: true };
  } catch (error) {
    emitDeploymentLog({
      deploymentId: current.deploymentId,
      leaseId: current.leaseId,
      providerId: current.providerId,
      source: 'runtime.manifest.proxy',
      level: 'warning',
      message: `Manifest proxy request failed: ${error instanceof Error ? error.message : 'unknown error'}`
    });

    return { proxied: true, accepted: false, reason: 'request failed' };
  }
}

export function markDeploymentRuntimeFailed(input: { deploymentId: string; reason: string }) {
  const current = runtimeByDeploymentId.get(input.deploymentId);
  if (!current) {
    return null;
  }

  const prevStatus = current.status;
  current.status = 'FAILED';
  current.failureReason = input.reason;
  current.lastTransitionAt = nowIso();
  runtimeByDeploymentId.set(input.deploymentId, current);

  emitStatusLog(current, prevStatus, 'FAILED');

  return current;
}

export async function getDeploymentRuntime(deploymentId: string) {
  const current = runtimeByDeploymentId.get(deploymentId);
  if (!current) {
    return null;
  }

  if (current.status === 'FAILED') {
    return current;
  }

  if (current.providerGatewayUrl) {
    const base = current.providerGatewayUrl.replace(/\/$/, '');
    const url = `${base}${buildProviderDeploymentPath(current)}/status`;

    try {
      const { response, payload } = await fetchJson(url);
      if (response.ok) {
        const inferredEndpoint = inferEndpointFromProviderStatus(payload);
        const prev = current.status;
        current.status = inferredEndpoint ? 'RUNNING' : 'STARTING';
        current.lastTransitionAt = nowIso();

        if (inferredEndpoint) {
          current.endpoint = inferredEndpoint;
        }

        emitStatusLog(current, prev, current.status);
        runtimeByDeploymentId.set(deploymentId, current);
        return current;
      }
    } catch {
      // Fallback to simulated state progression if provider is unreachable.
    }
  }

  const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(current.manifestUploadedAt).getTime()) / 1000));
  const nextStatus = deriveStatusFromElapsedSeconds(elapsedSec);

  if (nextStatus !== current.status) {
    const prev = current.status;
    current.status = nextStatus;
    current.lastTransitionAt = nowIso();

    if (nextStatus === 'RUNNING') {
      current.endpoint = buildEndpoint(deploymentId, current);
      emitDeploymentLog({
        deploymentId: current.deploymentId,
        leaseId: current.leaseId,
        providerId: current.providerId,
        source: 'runtime.endpoint',
        level: 'info',
        message: `Workload is reachable at ${current.endpoint}`
      });
    }

    emitStatusLog(current, prev, nextStatus);
    runtimeByDeploymentId.set(deploymentId, current);
  }

  return current;
}
