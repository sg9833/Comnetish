'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { LeaseTable, type LeaseTableItem } from './components/lease-table';
import { MetricCard } from './components/metric-card';
import { NetworkMap, REGIONS } from './components/network-map';
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
  id: string;
  expiresAt: string;
  emailVerified: boolean;
}

interface AuthMePayload {
  user: {
    wallets?: Array<{ address: string }>;
  };
  session: ProviderSession;
}

interface ProviderProfile {
  id: string;
  address: string;
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  pricePerCpu: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
}

async function fetchProviderData<T>(path: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  const payload = (await response.json()) as { data: T };
  return payload.data;
}

export default function ProviderConsolePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [hasInjectedWallet, setHasInjectedWallet] = useState<boolean | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [authSession, setAuthSession] = useState<ProviderSession | null>(null);
  const [authAddress, setAuthAddress] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionBootstrapDone, setSessionBootstrapDone] = useState(false);
  const [pricePerCpu, setPricePerCpu] = useState(1);
  const [providerStatusSetting, setProviderStatusSetting] = useState<'ACTIVE' | 'MAINTENANCE'>('ACTIVE');
  const [regionSetting, setRegionSetting] = useState('us-east-1');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedAt, setSettingsSavedAt] = useState<number | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const ethereumProvider = (window as Window & { ethereum?: unknown }).ethereum;
    setHasInjectedWallet(Boolean(ethereumProvider));
  }, []);

  useEffect(() => {
    if (!isConnected || !needsOnboarding) {
      return;
    }

    router.push('/onboard');
  }, [isConnected, needsOnboarding, router]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      if (!isConnected || !address) {
        setAuthSession(null);
        setAuthAddress(null);
        setAuthError(null);
        setNeedsOnboarding(false);
        setAuthenticating(false);
        setSessionBootstrapDone(true);
        return;
      }

      setSessionBootstrapDone(false);
      setAuthSession(null);
      setAuthAddress(null);
      setAuthError(null);
      setNeedsOnboarding(false);
      const normalizedAddress = address.toLowerCase();

      const fetchAuthMe = async () => {
        return fetch(`${API_BASE}/api/auth/me`, {
          credentials: 'include'
        });
      };

      try {
        let meResponse = await fetchAuthMe();

        if (meResponse.status === 401) {
          const refreshResponse = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include'
          });

          if (refreshResponse.ok) {
            meResponse = await fetchAuthMe();
          }
        }

        if (!meResponse.ok) {
          return;
        }

        const mePayload = (await meResponse.json()) as { data: AuthMePayload };
        const walletAddresses = (mePayload.data.user.wallets ?? []).map((wallet) =>
          wallet.address.toLowerCase()
        );

        if (!walletAddresses.includes(normalizedAddress)) {
          return;
        }

        const providerCheck = await fetch(`${API_BASE}/api/providers/me`, {
          credentials: 'include'
        });

        if (providerCheck.ok) {
          if (!cancelled) {
            setAuthSession(mePayload.data.session);
            setAuthAddress(normalizedAddress);
            setAuthError(null);
            setNeedsOnboarding(false);
          }
          return;
        }

        if (providerCheck.status === 404 && !cancelled) {
          setNeedsOnboarding(true);
        }
      } finally {
        if (!cancelled) {
          setSessionBootstrapDone(true);
        }
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!sessionBootstrapDone) {
      return;
    }

    if (!isConnected || !address) {
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
        const challengeResponse = await fetch(`${API_BASE}/api/auth/wallet/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ address: normalizedAddress, intent: 'login' })
        });

        if (!challengeResponse.ok) {
          throw new Error('Could not request provider wallet challenge.');
        }

        const challengePayload = (await challengeResponse.json()) as {
          data: { message: string };
        };

        const signature = await signMessageAsync({
          message: challengePayload.data.message
        });

        const verifyResponse = await fetch(`${API_BASE}/api/auth/wallet/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            address: normalizedAddress,
            signature,
            role: 'PROVIDER'
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

        const providerCheck = await fetch(`${API_BASE}/api/providers/me`, {
          credentials: 'include'
        });

        if (providerCheck.status === 404) {
          throw new Error('This wallet is not registered as a provider yet. Complete onboarding first.');
        }

        if (!providerCheck.ok) {
          throw new Error('Provider profile check failed.');
        }

        if (!cancelled) {
          setAuthSession(verifyPayload.data.session);
          setAuthAddress(normalizedAddress);
          setNeedsOnboarding(false);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Provider authentication failed.';
          setAuthSession(null);
          setAuthAddress(null);
          setAuthError(message);
          const unregistered = message.toLowerCase().includes('not registered as a provider');
          setNeedsOnboarding(unregistered);
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
  }, [address, authAddress, authSession, isConnected, sessionBootstrapDone, signMessageAsync]);

  const isAuthenticated = Boolean(authSession?.id);
  const queriesEnabled = isAuthenticated;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['provider-stats', authAddress ?? address ?? 'demo'],
    queryFn: async () => fetchProviderData<ProviderStats>('/api/providers/me/stats'),
    enabled: queriesEnabled,
    refetchInterval: 30_000
  });

  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['provider-leases', authAddress ?? address ?? 'demo'],
    queryFn: async () => fetchProviderData<Lease[]>('/api/providers/me/leases'),
    enabled: queriesEnabled,
    refetchInterval: 20_000
  });

  const { data: providerProfile, refetch: refetchProfile } = useQuery({
    queryKey: ['provider-profile', authAddress ?? address ?? 'demo'],
    queryFn: async () => fetchProviderData<ProviderProfile>('/api/providers/me'),
    enabled: isAuthenticated,
    staleTime: 60_000
  });

  // Sync settings form from loaded profile
  useEffect(() => {
    if (providerProfile) {
      setPricePerCpu(providerProfile.pricePerCpu);
      if (providerProfile.status === 'ACTIVE' || providerProfile.status === 'MAINTENANCE') {
        setProviderStatusSetting(providerProfile.status);
      }
      if (providerProfile.region) {
        setRegionSetting(providerProfile.region);
      }
    }
  }, [providerProfile]);

  async function saveSettings() {
    if (!isAuthenticated) return;
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSavedAt(null);
    try {
      const res = await fetch(`${API_BASE}/api/providers/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ pricePerCpu, status: providerStatusSetting, region: regionSetting })
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? 'Failed to save settings');
      }
      setSettingsSavedAt(Date.now());
      void refetchProfile();
      void queryClient.invalidateQueries({ queryKey: ['provider-stats'] });
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  }

  const isLoading = statsLoading || leasesLoading || authenticating || !sessionBootstrapDone;

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
            <SidebarNav isRegistered={isAuthenticated} />
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

            {/* Network map — always visible */}
            <section className="rounded-2xl border border-white/10 bg-[#111827] shadow-[0_16px_40px_rgba(0,0,0,0.35)] overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-5 pb-0">
                <div>
                  <h3 className="text-sm font-medium text-slate-300">Global Provider Network</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Live connections between active provider nodes</p>
                </div>
                {isAuthenticated && providerProfile?.region ? (
                  <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
                    Your node: {REGIONS.find(r => r.id === regionSetting)?.label ?? regionSetting}
                  </span>
                ) : null}
              </div>
              <NetworkMap
                activeRegion={isAuthenticated ? regionSetting : undefined}
                className="h-56 w-full"
              />
            </section>

            {!isConnected ? (
              <section className="rounded-2xl border border-white/10 bg-[#111827] p-8 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                <div className="flex min-h-[360px] items-center justify-center">
                  <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#0B1220] p-8 text-center">
                    <h2 className="text-2xl font-semibold text-slate-100">Connect your wallet to start providing compute</h2>
                    <p className="mt-3 text-sm text-slate-400">
                      Securely connect your provider wallet to load leases, earnings, and capacity metrics.
                    </p>
                    {hasInjectedWallet === false ? (
                      <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-left text-sm text-amber-200">
                        <p className="font-semibold">No browser wallet detected.</p>
                        <p className="mt-1 text-amber-100/90">
                          Install or enable MetaMask in this Chrome profile, then refresh this page.
                        </p>
                        <p className="mt-1 text-amber-100/80">
                          If using Incognito, allow the extension in incognito mode first.
                        </p>
                        <a
                          href="https://metamask.io/download/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex text-xs font-semibold text-amber-100 underline underline-offset-4"
                        >
                          Install MetaMask
                        </a>
                      </div>
                    ) : null}
                    <div className="mt-6 flex justify-center">
                      <ConnectButton label="Connect Wallet" />
                    </div>
                  </div>
                </div>
              </section>
            ) : isLoading && !stats ? (
              <DashboardSkeleton />
            ) : needsOnboarding ? (
              <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-8 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                <h2 className="text-2xl font-semibold text-amber-100">Wallet Connected, Provider Not Registered</h2>
                <p className="mt-3 text-sm text-amber-50/90">
                  Complete onboarding to register this wallet as a provider and start receiving lease assignments.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => router.push('/onboard')}
                    className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2563EB]"
                  >
                    Complete Onboarding
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Retry Auth
                  </button>
                </div>
              </section>
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
                  <h3 className="text-lg font-semibold text-slate-100">Node Settings</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Configure pricing and operational status for your provider node.
                  </p>

                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    {/* Wallet address */}
                    <div className="sm:col-span-2">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Wallet Address</p>
                      <div className="break-all select-all rounded-lg border border-white/10 bg-[#0B1220] px-4 py-3 font-mono text-sm text-slate-300">
                        {address ?? '—'}
                      </div>
                    </div>

                    {/* Region */}
                    <div>
                      <label htmlFor="region" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Region
                      </label>
                      <select
                        id="region"
                        value={regionSetting}
                        onChange={(e) => setRegionSetting(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0B1220] px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      >
                        {REGIONS.map((r) => (
                          <option key={r.id} value={r.id} className="bg-[#0B1220]">{r.label} ({r.id})</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Region updates are reflected on the network map above.</p>
                    </div>

                    {/* Capacity summary */}
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Offered Capacity</p>
                      <div className="space-y-0.5 rounded-lg border border-white/10 bg-[#0B1220] px-4 py-3 text-sm text-slate-300">
                        <div>{providerProfile?.cpu ?? stats?.cpu ?? 0} vCPU cores</div>
                        <div>{((providerProfile?.memory ?? stats?.memory ?? 0) / 1024).toFixed(1)} GB RAM</div>
                        <div>{providerProfile?.storage ?? stats?.storage ?? 0} GB storage</div>
                      </div>
                    </div>

                    {/* Price per CPU */}
                    <div>
                      <label htmlFor="pricePerCpu" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                        Price per CPU Core (CNT / hr)
                      </label>
                      <input
                        id="pricePerCpu"
                        type="number"
                        min={0.001}
                        step={0.001}
                        value={pricePerCpu}
                        onChange={(e) => setPricePerCpu(Math.max(0.001, Number(e.target.value)))}
                        className="w-full rounded-lg border border-white/10 bg-[#0B1220] px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>

                    {/* Node status */}
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Node Status</p>
                      <div className="flex gap-2">
                        {(['ACTIVE', 'MAINTENANCE'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setProviderStatusSetting(s)}
                            className={[
                              'rounded-lg border px-4 py-2 text-sm font-medium transition',
                              providerStatusSetting === s
                                ? s === 'ACTIVE'
                                  ? 'border-green-500/40 bg-green-500/20 text-green-300'
                                  : 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                                : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                            ].join(' ')}
                          >
                            {s === 'ACTIVE' ? '● Active' : '⏸ Maintenance'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {settingsError ? (
                    <p className="mt-4 text-sm text-red-300">{settingsError}</p>
                  ) : settingsSavedAt ? (
                    <p className="mt-4 text-sm text-green-400">✓ Settings saved at {new Date(settingsSavedAt).toLocaleTimeString()}</p>
                  ) : null}

                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => void saveSettings()}
                      disabled={settingsSaving || !isAuthenticated}
                      className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {settingsSaving ? 'Saving…' : 'Save Settings'}
                    </button>
                  </div>
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
