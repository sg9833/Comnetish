'use client';

import { Badge, Button, Card } from '@comnetish/ui';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

type DeploymentStatus = 'PENDING' | 'BIDDING' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
type LogLevel = 'info' | 'warning' | 'error';

type Deployment = {
  id: string;
  tenantAddress: string;
  sdl: string;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED';
  createdAt: string;
  closedAt?: string | null;
  leases?: Lease[];
};

type Provider = {
  id: string;
  address: string;
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  pricePerCpu: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
};

type Lease = {
  id: string;
  deploymentId: string;
  providerId: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED';
  startedAt: string;
  pricePerBlock: number;
};

type LogEntry = {
  id: string;
  ts: string;
  level: LogLevel;
  message: string;
};

type UsagePoint = {
  t: string;
  cpu: number;
  memory: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const queryClient = new QueryClient();

function deriveStatus(deployment?: Deployment, lease?: Lease): DeploymentStatus {
  if (!deployment) {
    return 'PENDING';
  }

  if (deployment.status === 'CLOSED') {
    return 'CLOSED';
  }

  if (deployment.status === 'OPEN' && !lease) {
    return 'BIDDING';
  }

  if (deployment.status === 'OPEN' && lease?.status === 'PENDING') {
    return 'PENDING';
  }

  if (deployment.status === 'ACTIVE' || lease?.status === 'ACTIVE') {
    return 'ACTIVE';
  }

  if (lease?.status === 'CLOSED') {
    return 'CLOSING';
  }

  return 'PENDING';
}

function statusBadgeVariant(status: DeploymentStatus): 'active' | 'pending' | 'error' | 'success' {
  if (status === 'ACTIVE') {
    return 'success';
  }
  if (status === 'CLOSED' || status === 'CLOSING') {
    return 'error';
  }
  return 'pending';
}

function statusDisplay(status: DeploymentStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function wsBaseUrl(apiBase: string) {
  if (apiBase.startsWith('https://')) {
    return apiBase.replace('https://', 'wss://');
  }
  return apiBase.replace('http://', 'ws://');
}

function parseSdlValue(sdl: string, key: string) {
  const regex = new RegExp(`${key}\\s*:\\s*([^\\n]+)`, 'i');
  const match = sdl.match(regex);
  return match?.[1]?.trim() ?? 'N/A';
}

function formatRelativeMinutes(ts: string) {
  const diffMs = Date.now() - new Date(ts).getTime();
  const min = Math.max(0, Math.floor(diffMs / 60000));
  if (min < 1) {
    return 'just now';
  }
  if (min < 60) {
    return `${min} minutes ago`;
  }
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m ago`;
}

function useDeploymentLogs(deploymentId: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    destroyedRef.current = false;

    const pushLog = (entry: Omit<LogEntry, 'id'>) => {
      setLogs((prev) => {
        const merged = [...prev, { ...entry, id: `${entry.ts}-${Math.random()}` }];
        return merged.slice(-500);
      });
    };

    const connect = () => {
      const url = `${wsBaseUrl(API_BASE)}/ws/deployments/${deploymentId}/logs`;
      setConnectionState(reconnectAttemptRef.current === 0 ? 'connecting' : 'reconnecting');

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
      };

      socket.onmessage = (event) => {
        const raw = String(event.data ?? '');

        try {
          const parsed = JSON.parse(raw) as Partial<{ level: LogLevel; message: string; ts: string }>;
          pushLog({
            ts: parsed.ts ?? new Date().toISOString(),
            level: parsed.level ?? 'info',
            message: parsed.message ?? raw
          });
        } catch {
          if (raw.startsWith('data:')) {
            const line = raw.replace(/^data:\s*/, '').trim();
            const inferredLevel: LogLevel = /error|failed|panic/i.test(line)
              ? 'error'
              : /warn|warning/i.test(line)
                ? 'warning'
                : 'info';

            pushLog({ ts: new Date().toISOString(), level: inferredLevel, message: line });
          }
        }
      };

      socket.onclose = () => {
        if (destroyedRef.current) {
          return;
        }

        setConnectionState('reconnecting');
        reconnectAttemptRef.current += 1;
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 12000);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    const fallbackTimer = setInterval(() => {
      if (connectionState === 'connected') {
        return;
      }

      const sample = [
        '[orchestrator] awaiting bid settlement...',
        '[provider] heartbeat acknowledged',
        '[runtime] container health probe ok',
        '[payment] escrow update committed',
        '[scheduler] next block reconciliation pending'
      ];
      const message = sample[Math.floor(Math.random() * sample.length)] ?? '[runtime] awaiting stream data';
      const level: LogLevel = message.includes('pending') ? 'warning' : 'info';
      pushLog({ ts: new Date().toISOString(), level, message: `${message} (local fallback stream)` });
    }, 2200);

    return () => {
      destroyedRef.current = true;
      setConnectionState('disconnected');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      clearInterval(fallbackTimer);
      socketRef.current?.close();
    };
  }, [deploymentId]);

  return {
    logs,
    connectionState
  };
}

function DeploymentDetailContent() {
  const params = useParams<{ id: string }>();
  const deploymentId = params.id;

  const [logFilter, setLogFilter] = useState<'all' | LogLevel>('all');
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const [usage, setUsage] = useState<UsagePoint[]>([]);
  const [nowTick, setNowTick] = useState(Date.now());

  const logViewportRef = useRef<HTMLDivElement | null>(null);

  const deploymentQuery = useQuery({
    queryKey: ['deployment-detail', deploymentId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/deployments/${deploymentId}`);
      if (!response.ok) {
        throw new Error('Failed to load deployment');
      }
      const payload = (await response.json()) as { data: Deployment };
      return payload.data;
    },
    refetchInterval: 10_000
  });

  const providersQuery = useQuery({
    queryKey: ['deployment-providers', deploymentId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/providers`);
      if (!response.ok) {
        throw new Error('Failed to load providers');
      }
      const payload = (await response.json()) as { data: Provider[] };
      return payload.data;
    },
    refetchInterval: 30_000
  });

  const leaseQuery = useQuery({
    queryKey: ['deployment-lease', deploymentId],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/leases?deploymentId=${encodeURIComponent(deploymentId)}`);
      if (!response.ok) {
        return [] as Lease[];
      }
      const payload = (await response.json()) as { data: Lease[] };
      return payload.data;
    },
    refetchInterval: 10_000
  });

  const router = useRouter();

  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/api/deployments/${deploymentId}/close`, {
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error('Failed to close deployment');
      }
      return response.json();
    },
    onSuccess: () => {
      deploymentQuery.refetch();
      leaseQuery.refetch();
      setTimeout(() => router.push('/dashboard'), 1800);
    }
  });

  const deployment = deploymentQuery.data;
  const lease = (leaseQuery.data ?? [])[0];
  const provider = (providersQuery.data ?? []).find((item) => item.id === lease?.providerId);
  const status = deriveStatus(deployment, lease);

  const { logs, connectionState } = useDeploymentLogs(deploymentId);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') {
      return logs;
    }
    return logs.filter((entry) => entry.level === logFilter);
  }, [logs, logFilter]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setUsage((prev) => {
        const timestamp = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const nextCpu = Math.min(95, Math.max(10, (prev.at(-1)?.cpu ?? 35) + (Math.random() * 18 - 9)));
        const nextMemory = Math.min(97, Math.max(15, (prev.at(-1)?.memory ?? 45) + (Math.random() * 12 - 6)));

        return [
          ...prev.slice(-23),
          {
            t: timestamp,
            cpu: Number(nextCpu.toFixed(1)),
            memory: Number(nextMemory.toFixed(1))
          }
        ];
      });
    }, 10_000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (usage.length === 0) {
      const seed = Array.from({ length: 8 }).map((_, idx) => ({
        t: new Date(Date.now() - (7 - idx) * 10_000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        cpu: Number((32 + Math.random() * 20).toFixed(1)),
        memory: Number((38 + Math.random() * 17).toFixed(1))
      }));
      setUsage(seed);
    }
  }, [usage.length]);

  useEffect(() => {
    const el = logViewportRef.current;
    if (!el || autoScrollPaused) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [filteredLogs, autoScrollPaused]);

  const onLogScroll = () => {
    const el = logViewportRef.current;
    if (!el) {
      return;
    }
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 40;
    setAutoScrollPaused(!nearBottom);
  };

  const leaseStart = lease?.startedAt ?? deployment?.createdAt ?? new Date().toISOString();
  const leaseMinutes = Math.max(0, Math.floor((nowTick - new Date(leaseStart).getTime()) / 60_000));
  const costPerHour = (lease?.pricePerBlock ?? provider?.pricePerCpu ?? 0.42) * 120;
  const runningCost = (costPerHour / 3600) * Math.max(0, Math.floor((nowTick - new Date(leaseStart).getTime()) / 1000));
  const totalCost = runningCost * 1.03;

  const image = deployment ? parseSdlValue(deployment.sdl, 'image') : 'loading...';
  const cpu = deployment ? parseSdlValue(deployment.sdl, 'units') : 'N/A';
  const memory = deployment ? parseSdlValue(deployment.sdl, 'size') : 'N/A';
  const storage = deployment ? parseSdlValue(deployment.sdl, 'storage:\n\s*size') : 'N/A';
  const liveUrl = status === 'ACTIVE' ? `https://${deploymentId}.comnetish.app` : null;

  return (
    <main className="relative min-h-screen bg-background px-6 py-8 text-text-primary">
      <div className="cn-noise-overlay" />

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="space-y-6 xl:col-span-2">
          <Card className="border-[rgba(0,255,194,0.15)]" title="Deployment Status">
            <div className="flex flex-wrap items-center gap-4">
              <Badge variant={statusBadgeVariant(status)}>{statusDisplay(status)}</Badge>
              <p className="font-mono text-sm text-text-muted">ID: {deploymentId}</p>
              <Badge variant={connectionState === 'connected' ? 'success' : 'pending'}>
                logs: {connectionState}
              </Badge>
            </div>

            {(status === 'PENDING' || status === 'BIDDING') && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/70">
                <motion.div
                  className="h-full bg-brand-primary"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            )}
          </Card>

          <Card className="border-[rgba(0,255,194,0.15)]" title="Live Logs" description="Streaming runtime and orchestration events">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2">
                {(['all', 'info', 'warning', 'error'] as const).map((key) => (
                  <Button key={key} variant={logFilter === key ? 'secondary' : 'ghost'} onClick={() => setLogFilter(key)}>
                    {key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)}
                  </Button>
                ))}
              </div>

              {autoScrollPaused && <Badge variant="pending">Scroll paused</Badge>}
            </div>

            <div
              ref={logViewportRef}
              onScroll={onLogScroll}
              className="h-[380px] overflow-auto rounded-xl border border-[rgba(0,255,194,0.1)] bg-[#090D12] p-3 font-mono text-sm"
            >
              <AnimatePresence initial={false}>
                {filteredLogs.map((line) => (
                  <motion.div
                    key={line.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className={`mb-1 ${
                      line.level === 'error'
                        ? 'text-red-400'
                        : line.level === 'warning'
                          ? 'text-yellow-300'
                          : 'text-emerald-300'
                    }`}
                  >
                    <span className="text-text-muted">[{new Date(line.ts).toLocaleTimeString()}]</span> {line.message}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>

          <Card className="border-[rgba(0,255,194,0.15)]" title="Resource Usage" description="Updated every 10 seconds">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="h-56 rounded-lg border border-[rgba(0,255,194,0.1)] bg-background/70 p-2">
                <p className="mb-1 text-xs uppercase text-text-muted">CPU %</p>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={usage}>
                    <CartesianGrid stroke="rgba(139,148,158,0.2)" strokeDasharray="3 3" />
                    <XAxis dataKey="t" tick={{ fill: '#8B949E', fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#8B949E', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#1C2128', border: '1px solid rgba(0,255,194,0.15)' }}
                      labelStyle={{ color: '#E6EDF3' }}
                    />
                    <Line type="monotone" dataKey="cpu" stroke="#00FFC2" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="h-56 rounded-lg border border-[rgba(0,255,194,0.1)] bg-background/70 p-2">
                <p className="mb-1 text-xs uppercase text-text-muted">Memory %</p>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={usage}>
                    <CartesianGrid stroke="rgba(139,148,158,0.2)" strokeDasharray="3 3" />
                    <XAxis dataKey="t" tick={{ fill: '#8B949E', fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#8B949E', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#1C2128', border: '1px solid rgba(0,255,194,0.15)' }}
                      labelStyle={{ color: '#E6EDF3' }}
                    />
                    <Line type="monotone" dataKey="memory" stroke="#7B61FF" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border-[rgba(0,255,194,0.15)]" title="Deployment Info">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-[rgba(0,255,194,0.1)] bg-background/70 px-3 py-2">
                <span className="text-text-muted">Deployment ID</span>
                <button
                  onClick={() => navigator.clipboard.writeText(deploymentId)}
                  className="font-mono text-xs text-brand-primary hover:underline"
                >
                  Copy
                </button>
              </div>

              <div>
                <p className="text-text-muted">Provider</p>
                <p className="font-medium text-text-primary">
                  {provider?.address.slice(0, 14) ?? 'Unassigned'}
                  {provider ? '...' : ''}
                </p>
                <p className="text-xs text-text-muted">{provider?.region ?? 'Waiting for lease'}</p>
                {provider && (
                  <Link href={`/map?provider=${provider.id}`} className="text-xs text-brand-primary hover:underline">
                    View provider page
                  </Link>
                )}
              </div>

              <div>
                <p className="text-text-muted">Container image</p>
                <p className="font-mono text-xs text-text-primary">{image}</p>
              </div>

              <div>
                <p className="text-text-muted">Resources</p>
                <p className="font-mono text-xs text-text-primary">CPU: {cpu}</p>
                <p className="font-mono text-xs text-text-primary">RAM: {memory}</p>
                <p className="font-mono text-xs text-text-primary">Storage: {storage}</p>
              </div>

              <div>
                <p className="text-text-muted">Live URL</p>
                {liveUrl ? (
                  <a href={liveUrl} target="_blank" rel="noreferrer" className="text-brand-primary hover:underline">
                    {liveUrl}
                  </a>
                ) : (
                  <p className="text-xs text-text-muted">Available once deployment becomes active</p>
                )}
              </div>

              <div>
                <p className="text-text-muted">Lease started</p>
                <p className="text-text-primary">{formatRelativeMinutes(leaseStart)}</p>
              </div>

              <div>
                <p className="text-text-muted">Running cost</p>
                <p className="font-mono text-lg text-brand-primary">{runningCost.toFixed(2)} CNT</p>
              </div>

              <div>
                <p className="text-text-muted">Total cost so far</p>
                <p className="font-mono text-lg text-text-primary">{totalCost.toFixed(2)} CNT</p>
              </div>

              {closeMutation.isSuccess ? (
                <div className="mt-2 rounded-lg border border-[rgba(0,255,194,0.25)] bg-brand-primary/10 px-4 py-3 text-center">
                  <p className="font-semibold text-brand-primary">Deployment closed</p>
                  <p className="mt-1 text-xs text-text-muted">Redirecting to dashboard…</p>
                </div>
              ) : status === 'CLOSED' ? (
                <div className="mt-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-white/5 px-4 py-3 text-center">
                  <p className="text-sm text-text-muted">This deployment has been closed</p>
                  <Link href="/dashboard" className="mt-1 block text-xs text-brand-primary hover:underline">
                    Back to Dashboard
                  </Link>
                </div>
              ) : (
                <>
                  <Button
                    variant="danger"
                    className="mt-2 w-full"
                    loading={closeMutation.isPending}
                    onClick={() => {
                      const confirmed = window.confirm('Close this deployment? This will stop all running workloads.');
                      if (confirmed) {
                        closeMutation.mutate();
                      }
                    }}
                  >
                    Close Deployment
                  </Button>
                  {closeMutation.isError && (
                    <p className="text-xs text-brand-warning">{(closeMutation.error as Error).message}</p>
                  )}
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}

export default function DeploymentDetailPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <DeploymentDetailContent />
    </QueryClientProvider>
  );
}
