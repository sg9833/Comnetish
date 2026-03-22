type DeploymentLogLevel = 'debug' | 'info' | 'warning' | 'error';

export type DeploymentLogEvent = {
  type: 'log';
  ts: string;
  deploymentId: string;
  level: DeploymentLogLevel;
  source: string;
  message: string;
  leaseId?: string;
  providerId?: string;
};

type DeploymentLogListener = (event: DeploymentLogEvent) => void;

const listeners = new Map<string, Set<DeploymentLogListener>>();
const history = new Map<string, DeploymentLogEvent[]>();

const MAX_HISTORY_PER_DEPLOYMENT = 200;
const MAX_DEPLOYMENTS_WITH_HISTORY = 1_000;

function pruneHistoryMap() {
  if (history.size <= MAX_DEPLOYMENTS_WITH_HISTORY) {
    return;
  }

  const firstKey = history.keys().next().value as string | undefined;
  if (firstKey) {
    history.delete(firstKey);
  }
}

export function emitDeploymentLog(input: {
  deploymentId: string;
  level?: DeploymentLogLevel;
  source?: string;
  message: string;
  leaseId?: string;
  providerId?: string;
}) {
  const event: DeploymentLogEvent = {
    type: 'log',
    ts: new Date().toISOString(),
    deploymentId: input.deploymentId,
    level: input.level ?? 'info',
    source: input.source ?? 'api',
    message: input.message,
    ...(input.leaseId ? { leaseId: input.leaseId } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {})
  };

  const existing = history.get(input.deploymentId) ?? [];
  existing.push(event);
  if (existing.length > MAX_HISTORY_PER_DEPLOYMENT) {
    existing.splice(0, existing.length - MAX_HISTORY_PER_DEPLOYMENT);
  }
  history.set(input.deploymentId, existing);
  pruneHistoryMap();

  const deploymentListeners = listeners.get(input.deploymentId);
  if (!deploymentListeners || deploymentListeners.size === 0) {
    return;
  }

  for (const listener of deploymentListeners) {
    listener(event);
  }
}

export function getRecentDeploymentLogs(deploymentId: string, limit = 30) {
  const items = history.get(deploymentId) ?? [];
  if (items.length <= limit) {
    return items;
  }

  return items.slice(items.length - limit);
}

export function subscribeToDeploymentLogs(deploymentId: string, listener: DeploymentLogListener) {
  const current = listeners.get(deploymentId) ?? new Set<DeploymentLogListener>();
  current.add(listener);
  listeners.set(deploymentId, current);

  return () => {
    const active = listeners.get(deploymentId);
    if (!active) {
      return;
    }

    active.delete(listener);
    if (active.size === 0) {
      listeners.delete(deploymentId);
    }
  };
}
