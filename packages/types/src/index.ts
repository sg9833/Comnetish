export type HealthResponse = {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
};

export type AgentStatus = {
  service: 'ai-agent';
  model: string;
  ready: boolean;
};

export type DeploymentOrder = {
  owner: string;
  cpu: number;
  memoryMb: number;
  storageGb: number;
  region: string;
};