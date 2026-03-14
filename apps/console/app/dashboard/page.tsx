'use client';

import { Badge, Button, Card, StatCard } from '@comnetish/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { animate, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Provider = {
  id: string;
  address: string;
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  pricePerCpu: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  lastSeen: string;
};

type Deployment = {
  id: string;
  tenantAddress: string;
  sdl?: string | null;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED';
  createdAt: string;
  closedAt?: string | null;
};

type Lease = {
  id: string;
  deploymentId: string;
  providerId: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED';
  startedAt: string;
  pricePerBlock: number;
};

type PlatformStats = {
  totalDeployments: number;
  activeProviders: number;
  cntVolume: number;
};

type ActivityEvent = {
  id: string;
  type: 'deployment' | 'lease' | 'payment';
  title: string;
  ts: string;
  status: 'active' | 'pending' | 'success' | 'error';
};

const REFRESH_INTERVAL = 30_000;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="cn-skeleton-shimmer h-28 rounded-xl border border-[rgba(0,255,194,0.12)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="cn-skeleton-shimmer xl:col-span-2 h-96 rounded-xl border border-[rgba(0,255,194,0.12)]" />
        <div className="cn-skeleton-shimmer h-96 rounded-xl border border-[rgba(0,255,194,0.12)]" />
      </div>
    </div>
  );
}

function useCountUp(value: number, decimals = 0, duration = 1.5) {
  const [display, setDisplay] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!hasAnimated) {
      const controls = animate(0, value, {
        duration,
        ease: 'easeOut',
        onUpdate: (latest) => setDisplay(latest),
        onComplete: () => setHasAnimated(true)
      });

      return () => controls.stop();
    }

    setDisplay(value);
  }, [value, duration, hasAnimated]);

  return Number(display.toFixed(decimals));
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  });
}

function deploymentTypeFromSDL(sdl?: string | null): string {
  const source = (sdl ?? '').toLowerCase();
  if (!source.trim()) {
    return 'Unknown';
  }
  if (source.includes('postgres') || source.includes('redis') || source.includes('db')) {
    return 'Data + Storage';
  }
  if (source.includes('worker') || source.includes('queue')) {
    return 'Batch Worker';
  }
  if (source.includes('api')) {
    return 'API Service';
  }
  return 'Web App';
}

function DashboardContent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: () => fetchJson<Provider[]>('/api/providers'),
    refetchInterval: REFRESH_INTERVAL
  });

  const deploymentsQuery = useQuery({
    queryKey: ['deployments'],
    queryFn: () => fetchJson<Deployment[]>('/api/deployments'),
    refetchInterval: REFRESH_INTERVAL
  });

  const leasesQuery = useQuery({
    queryKey: ['leases'],
    queryFn: () => fetchJson<Lease[]>('/api/leases'),
    refetchInterval: REFRESH_INTERVAL
  });

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => fetchJson<PlatformStats>('/api/stats'),
    refetchInterval: REFRESH_INTERVAL
  });

  const isLoading = providersQuery.isLoading || deploymentsQuery.isLoading || leasesQuery.isLoading || statsQuery.isLoading;

  const closeMutation = useMutation({
    mutationFn: async (deploymentId: string) => {
      const res = await fetch(`${API_BASE}/api/deployments/${deploymentId}/close`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to close deployment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    }
  });

  const providers = providersQuery.data ?? [];
  const deployments = deploymentsQuery.data ?? [];
  const leases = leasesQuery.data ?? [];
  const stats = statsQuery.data ?? { totalDeployments: 0, activeProviders: 0, cntVolume: 0 };

  const activity = useMemo<ActivityEvent[]>(() => {
    const deploymentEvents: ActivityEvent[] = deployments.map((item) => ({
      id: `deploy-${item.id}`,
      type: 'deployment',
      title: `${item.status === 'CLOSED' ? 'Closed' : 'Created'} deployment ${item.id}`,
      ts: item.closedAt ?? item.createdAt,
      status: item.status === 'CLOSED' ? 'pending' : 'active'
    }));

    const leaseEvents: ActivityEvent[] = leases.map((item) => ({
      id: `lease-${item.id}`,
      type: 'lease',
      title: `${item.status === 'ACTIVE' ? 'Lease started' : 'Lease update'} for ${item.deploymentId}`,
      ts: item.startedAt,
      status: item.status === 'ACTIVE' ? 'success' : item.status === 'PENDING' ? 'pending' : 'error'
    }));

    const paymentEvents: ActivityEvent[] = leases
      .filter((item) => item.status === 'ACTIVE')
      .map((item) => ({
        id: `pay-${item.id}`,
        type: 'payment',
        title: `Payment settled ${item.pricePerBlock.toFixed(3)} CNT/block for ${item.deploymentId}`,
        ts: item.startedAt,
        status: 'success'
      }));

    return [...deploymentEvents, ...leaseEvents, ...paymentEvents]
      .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
      .slice(0, 10);
  }, [deployments, leases]);

  const averagePrice = providers.length > 0 ? providers.reduce((sum, p) => sum + p.pricePerCpu, 0) / providers.length : 0;
  const cheapestProvider = providers.reduce<Provider | null>((best, current) => {
    if (!best) {
      return current;
    }
    return current.pricePerCpu < best.pricePerCpu ? current : best;
  }, null);

  const deploymentTypeHistogram = deployments.reduce<Record<string, number>>((acc, item) => {
    const type = deploymentTypeFromSDL(item.sdl);
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  const mostPopularType =
    Object.entries(deploymentTypeHistogram).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Web App';

  const totalProvidersAnimated = useCountUp(providers.length || stats.activeProviders || 0);
  const activeDeploymentsAnimated = useCountUp(deployments.filter((d) => d.status === 'ACTIVE' || d.status === 'OPEN').length);
  const cntPerHourAnimated = useCountUp(stats.cntVolume / 24, 2);
  const totalComputeLeasedAnimated = useCountUp(
    leases.reduce((sum, lease) => sum + lease.pricePerBlock * 120, 0),
    1
  );

  const providersOnline = providers.filter((p) => p.status === 'ACTIVE').length;
  const healthy = providersOnline > 0 && !providersQuery.isError;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-[rgba(0,255,194,0.15)] bg-surface/80 p-6 shadow-brand-secondary">
        <div className="cn-noise-overlay" />
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-brand-primary">Comnetish Command Layer</p>
            <h1 className="mt-2 font-display text-4xl font-semibold text-text-primary">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-text-muted">
              Live telemetry for decentralized compute supply, active tenant workloads, and CNT settlement flow.
            </p>
          </div>

          <div className="rounded-xl border border-[rgba(0,255,194,0.18)] bg-background/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.08, 0.95] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className={`h-2.5 w-2.5 rounded-full ${healthy ? 'bg-brand-primary' : 'bg-brand-warning'}`}
              />
              <p className="font-display text-sm uppercase tracking-wider text-text-muted">Network Health</p>
            </div>
            <p className="mt-1 font-display text-lg text-text-primary">{healthy ? 'Healthy' : 'Degraded'}</p>
            <p className="font-mono text-xs text-text-muted">{providersOnline} providers online</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          className="border-[rgba(0,255,194,0.15)]"
          label="Total Providers"
          value={totalProvidersAnimated}
          trend="up"
          trendLabel="Live counter"
        />
        <StatCard
          className="border-[rgba(0,255,194,0.15)]"
          label="Active Deployments"
          value={activeDeploymentsAnimated}
          trend="up"
          trendLabel="Realtime"
        />
        <StatCard
          className="border-[rgba(0,255,194,0.15)]"
          label="CNT / hour"
          value={cntPerHourAnimated}
          trend="up"
          trendLabel="Flowing"
        />
        <StatCard
          className="border-[rgba(0,255,194,0.15)]"
          label="Total Compute Leased"
          value={`${totalComputeLeasedAnimated} CU`}
          trend="up"
          trendLabel="Current epoch"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card
          variant="glass"
          className="xl:col-span-2 border-[rgba(0,255,194,0.15)]"
          title="Recent Activity"
          description="Last 10 deployments, lease transitions, and settlement events"
        >
          <div className="space-y-3">
            {activity.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between rounded-lg border border-[rgba(0,255,194,0.08)] bg-background/60 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-text-primary">{event.title}</p>
                  <p className="mt-1 font-mono text-xs text-text-muted">{formatTime(event.ts)}</p>
                </div>
                <Badge variant={event.status}>{event.type}</Badge>
              </motion.div>
            ))}
          </div>
        </Card>

        <Card
          className="border-[rgba(0,255,194,0.15)]"
          title="Market Overview"
          description="Spot pricing and current demand profile"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-[rgba(0,255,194,0.12)] bg-background/70 p-3">
              <p className="text-xs uppercase tracking-wider text-text-muted">Avg CNT / CPU-hour</p>
              <p className="mt-1 font-mono text-xl text-brand-primary">{averagePrice.toFixed(3)} CNT</p>
            </div>
            <div className="rounded-lg border border-[rgba(0,255,194,0.12)] bg-background/70 p-3">
              <p className="text-xs uppercase tracking-wider text-text-muted">Cheapest region</p>
              <p className="mt-1 font-display text-lg text-text-primary">{cheapestProvider?.region ?? 'N/A'}</p>
              <p className="font-mono text-xs text-text-muted">{cheapestProvider?.pricePerCpu.toFixed(3) ?? '0.000'} CNT/CPU-hour</p>
            </div>
            <div className="rounded-lg border border-[rgba(0,255,194,0.12)] bg-background/70 p-3">
              <p className="text-xs uppercase tracking-wider text-text-muted">Most popular type</p>
              <p className="mt-1 font-display text-lg text-text-primary">{mostPopularType}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card
        className="border-[rgba(0,255,194,0.15)]"
        title="Your Deployments"
        description="Active tenant workloads with quick actions"
      >
        <div className="space-y-3">
          {deployments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[rgba(0,255,194,0.2)] bg-background/60 px-4 py-8 text-center">
              <p className="text-text-muted">No active deployments for this connected wallet yet.</p>
              <Button className="mt-4" variant="primary" onClick={() => router.push('/deploy')}>
                Create First Deployment
              </Button>
            </div>
          ) : (
            deployments.map((item) => {
              const activeLease = leases.find((l) => l.deploymentId === item.id && l.status === 'ACTIVE');
              const estimatedCost = activeLease ? (activeLease.pricePerBlock * 120).toFixed(4) : null;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-4 rounded-lg border border-[rgba(0,255,194,0.1)] bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-display text-lg text-text-primary">{item.id}</p>
                    <p className="text-sm text-text-muted">{deploymentTypeFromSDL(item.sdl)}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-mono text-xs uppercase text-text-muted">Status</p>
                      <Badge variant={item.status === 'ACTIVE' ? 'success' : 'pending'}>{item.status}</Badge>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase text-text-muted">Cost / hour</p>
                      <p className="font-mono text-sm text-brand-primary">{estimatedCost ? `${estimatedCost} CNT` : '—'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => router.push(`/deployments/${item.id}`)}>
                        View Logs
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-3 py-2 text-sm"
                        onClick={() => closeMutation.mutate(item.id)}
                        disabled={closeMutation.isPending || item.status === 'CLOSED'}
                      >
                        {closeMutation.isPending ? 'Closing…' : 'Close'}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="relative min-h-screen bg-background px-6 py-8 text-text-primary">
      <div className="cn-noise-overlay" />
      <div className="relative z-10 mx-auto max-w-7xl">
        <DashboardContent />
      </div>
    </main>
  );
}
