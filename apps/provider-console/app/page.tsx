'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { LeaseTable, type LeaseTableItem } from './components/lease-table';
import { MetricCard } from './components/metric-card';
import { ResourceCard } from './components/resource-card';
import { SidebarNav } from './components/sidebar-nav';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Lease {
  id: string;
  deploymentId: string;
  providerId: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED';
  startedAt: string;
  pricePerBlock: number;
  deployment: { id: string; status: string };
  provider: { id: string; address: string };
}

interface ProviderStats {
  activeLeases: number;
  totalEarnings: number;
  monthlyEarnings: number;
  cpu: number;
  memory: number;
  storage: number;
}

interface ProviderSession {
  token: string;
  expiresAt: string;
}

async function fetchProviderData<T>(path: string, token?: string | null) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`
        }
      : undefined
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export default function ProviderConsolePage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [authSession, setAuthSession] = useState<ProviderSession | null>(null);
  const [authAddress, setAuthAddress] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setAuthSession(null);
      setAuthAddress(null);
      setAuthError(null);
      setAuthenticating(false);
      return;
    }

    const normalizedAddress = address.toLowerCase();
    if (authSession && authAddress === normalizedAddress) {
      return;
    }

    let cancelled = false;

    async function authenticateProvider() {
      setAuthenticating(true);
      setAuthError(null);

      try {
        const challengeResponse = await fetch(`${API_BASE}/api/providers/auth/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: normalizedAddress })
        });

        if (!challengeResponse.ok) {
          throw new Error('This wallet is not registered as a provider yet. Complete onboarding first.');
        }

        const challengePayload = (await challengeResponse.json()) as {
          data: { message: string };
        };

        const signature = await signMessageAsync({
          message: challengePayload.data.message
        });

        const verifyResponse = await fetch(`${API_BASE}/api/providers/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: normalizedAddress,
            signature
          })
        });

        if (!verifyResponse.ok) {
          throw new Error('Provider authentication failed.');
        }

        const verifyPayload = (await verifyResponse.json()) as {
          data: {
            session: ProviderSession;
          };
        };

        if (!cancelled) {
          setAuthSession(verifyPayload.data.session);
          setAuthAddress(normalizedAddress);
        }
      } catch (error) {
        if (!cancelled) {
          setAuthSession(null);
          setAuthAddress(null);
          setAuthError(error instanceof Error ? error.message : 'Provider authentication failed.');
        }
      } finally {
        if (!cancelled) {
          setAuthenticating(false);
        }
      }
    }

    void authenticateProvider();

    return () => {
      cancelled = true;
    };
  }, [address, authAddress, authSession, isConnected, signMessageAsync]);

  const queriesEnabled = !isConnected || Boolean(authSession?.token);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['provider-stats', authAddress ?? address ?? 'demo'],
    queryFn: async () => fetchProviderData<ProviderStats>('/api/providers/me/stats', authSession?.token),
    enabled: queriesEnabled,
    refetchInterval: 30_000
  });

  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['provider-leases', authAddress ?? address ?? 'demo'],
    queryFn: async () => fetchProviderData<Lease[]>('/api/providers/me/leases', authSession?.token),
    enabled: queriesEnabled,
    refetchInterval: 20_000
  });

  const isLoading = statsLoading || leasesLoading || authenticating;

  const activeLeasesData = leases?.filter((l) => l.status === 'ACTIVE') ?? [];

  const cpuTotal = Math.max(stats?.cpu ?? 1, 1);
  const memTotal = Math.max(stats?.memory ?? 1, 1);
  const storTotal = Math.max(stats?.storage ?? 1, 1);
  const activeCount = stats?.activeLeases ?? 0;
  const cpuUsagePct = Math.round(Math.min((activeCount * 4 / cpuTotal) * 100, 100));
  const memUsagePct = Math.round(Math.min((activeCount * 8 / memTotal) * 100, 100));
  const storUsagePct = Math.round(Math.min((activeCount * 10 / storTotal) * 100, 100));

  const leaseRows: LeaseTableItem[] = (leases ?? [])
    .slice()
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map((lease) => ({
      id: lease.id,
      status: lease.status,
      pricePerBlock: lease.pricePerBlock,
      startedAt: lease.startedAt,
      resourceUsage: lease.status === 'ACTIVE' ? '4 vCPU / 8 GB RAM / 10 GB SSD' : '0 vCPU / 0 GB RAM / 0 GB SSD'
    }));

  const metricCards = [
    {
      title: 'Active Leases',
      value: String(stats?.activeLeases ?? 0),
      subtitle: `${activeLeasesData.length} currently serving workloads`
    },
    {
      title: 'Monthly Earnings (CNT)',
      value: formatCNT(stats?.monthlyEarnings ?? 0),
      subtitle: 'Current billing cycle'
    },
    {
      title: 'Total Earnings',
      value: formatCNT(stats?.totalEarnings ?? 0),
      subtitle: 'Lifetime provider rewards'
    },
    {
      title: 'CPU Available',
      value: `${stats?.cpu ?? 0} cores`,
      subtitle: 'Total registered compute capacity'
    }
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B0F14] px-4 py-8 md:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-[-120px] h-80 w-80 rounded-full bg-[#3B82F6]/20 blur-3xl" />
        <div className="absolute bottom-[-140px] left-[-120px] h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_45%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1440px]">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3 xl:col-span-2">
            <SidebarNav />
          </div>

          <div className="col-span-12 space-y-8 lg:col-span-9 xl:col-span-10">
            <header id="dashboard" className="rounded-2xl border border-white/10 bg-[#111827] p-8 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Provider Dashboard</h1>
                  <p className="mt-2 text-sm text-slate-400 md:text-base">
                    Monitor node health, active lease workload, and real-time provider earnings across your infrastructure.
                  </p>
                </div>
                <ConnectButton />
              </div>
            </header>

            {!isConnected ? (
              <section className="rounded-2xl border border-white/10 bg-[#111827] p-8 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                <div className="flex min-h-[360px] items-center justify-center">
                  <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0B1220] p-8 text-center">
                    <h2 className="text-2xl font-semibold text-slate-100">Connect your wallet to start providing compute</h2>
                    <p className="mt-3 text-sm text-slate-400">
                      Securely connect your provider wallet to load leases, earnings, and capacity metrics.
                    </p>
                    <div className="mt-6 flex justify-center">
                      <ConnectButton label="Connect Wallet" />
                    </div>
                  </div>
                </div>
              </section>
            ) : isLoading && !stats ? (
              <DashboardSkeleton />
            ) : (
              <>
                {authError ? (
                  <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                    {authError}
                  </section>
                ) : null}

                <section id="earnings" className="grid grid-cols-12 gap-4 md:gap-6">
                  {metricCards.map((metric) => (
                    <div key={metric.title} className="col-span-12 sm:col-span-6 xl:col-span-3">
                      <MetricCard title={metric.title} value={metric.value} subtitle={metric.subtitle} />
                    </div>
                  ))}
                </section>

                <section id="resources" className="grid grid-cols-12 gap-4 md:gap-6">
                  <div className="col-span-12 md:col-span-4">
                    <ResourceCard
                      title="CPU Usage"
                      usagePercent={cpuUsagePct}
                      detail={`${Math.round((cpuUsagePct / 100) * cpuTotal)} of ${cpuTotal} cores in use`}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <ResourceCard
                      title="Memory Usage"
                      usagePercent={memUsagePct}
                      detail={`${Math.round((memUsagePct / 100) * memTotal)} of ${memTotal} GB in use`}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <ResourceCard
                      title="Storage Usage"
                      usagePercent={storUsagePct}
                      detail={`${Math.round((storUsagePct / 100) * storTotal)} of ${storTotal} GB in use`}
                    />
                  </div>
                </section>

                <section id="active-leases">
                  <LeaseTable leases={leaseRows} />
                </section>

                <section id="settings" className="rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                  <h3 className="text-lg font-semibold text-slate-100">Settings</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Provider-level network settings and payout configurations will appear here.
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function formatCNT(value: number) {
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)} CNT`;
}

function DashboardSkeleton() {
  return (
    <section className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 sm:col-span-6 xl:col-span-3 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 sm:col-span-6 xl:col-span-3 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 sm:col-span-6 xl:col-span-3 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 sm:col-span-6 xl:col-span-3 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 md:col-span-4 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 md:col-span-4 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 md:col-span-4 cn-skeleton-shimmer h-32 rounded-2xl" />
      <div className="col-span-12 cn-skeleton-shimmer h-72 rounded-2xl" />
    </section>
  );
}
