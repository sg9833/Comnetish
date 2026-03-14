'use client';

import { Badge, Button, Card } from '@comnetish/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

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

type Lease = {
  id: string;
  deploymentId: string;
  providerId: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED';
};

type Deployment = {
  id: string;
  tenantAddress: string;
};

type ProviderGeo = Provider & {
  lat: number;
  lng: number;
  name: string;
  uptime: number;
  leasesCount: number;
  earningsToday: number;
};

type ArcDatum = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
};

type RingDatum = ProviderGeo & {
  ringRepeatPeriod: number;
  ringPropagationSpeed: number;
  ringMaxRadius: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const REFRESH_MS = 15_000;

const REGION_GEO: Record<string, { lat: number; lng: number; flag: string; label: string }> = {
  'US-West': { lat: 37.7749, lng: -122.4194, flag: '🇺🇸', label: 'US West' },
  'US-East': { lat: 40.7128, lng: -74.006, flag: '🇺🇸', label: 'US East' },
  'EU-Central': { lat: 50.1109, lng: 8.6821, flag: '🇪🇺', label: 'EU Central' },
  'EU-West': { lat: 53.3498, lng: -6.2603, flag: '🇪🇺', label: 'EU West' },
  'Asia-Singapore': { lat: 1.3521, lng: 103.8198, flag: '🇸🇬', label: 'Singapore' },
  'Asia-Tokyo': { lat: 35.6762, lng: 139.6503, flag: '🇯🇵', label: 'Tokyo' }
};

function hashToCoord(input: string) {
  const hash = hashInt(input);
  const lat = (hash % 140) - 70;
  const lng = (Math.floor(hash / 7) % 320) - 160;
  return { lat, lng };
}

function hashInt(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getProviderColor(status: Provider['status']) {
  if (status === 'ACTIVE') {
    return '#00FFC2';
  }
  if (status === 'MAINTENANCE') {
    return '#FF6B35';
  }
  return '#8B949E';
}

function getStatusBadgeVariant(status: Provider['status']): 'active' | 'pending' | 'error' | 'success' {
  if (status === 'ACTIVE') {
    return 'success';
  }
  if (status === 'MAINTENANCE') {
    return 'pending';
  }
  return 'error';
}

async function fetchData<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

function formatMemory(memoryMb: number) {
  return `${(memoryMb / 1024).toFixed(0)} GB`;
}

function formatStorage(storageGb: number) {
  return `${storageGb.toFixed(0)} GB`;
}

function ProviderMapPageContent() {
  const searchParams = useSearchParams();
  const providerFromUrl = searchParams.get('provider');
  const globeRef = useRef<any>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [viewport, setViewport] = useState({
    width: 1200,
    height: 900
  });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls?.();
    if (controls) {
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.28;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
    }
  }, [autoRotate]);

  const providersQuery = useQuery({
    queryKey: ['map-providers'],
    queryFn: () => fetchData<Provider[]>('/api/providers'),
    refetchInterval: REFRESH_MS
  });

  const leasesQuery = useQuery({
    queryKey: ['map-leases'],
    queryFn: () => fetchData<Lease[]>('/api/leases'),
    refetchInterval: REFRESH_MS
  });

  const deploymentsQuery = useQuery({
    queryKey: ['map-deployments'],
    queryFn: () => fetchData<Deployment[]>('/api/deployments'),
    refetchInterval: REFRESH_MS
  });

  const providers = providersQuery.data ?? [];
  const leases = leasesQuery.data ?? [];
  const deployments = deploymentsQuery.data ?? [];

  const providersGeo = useMemo<ProviderGeo[]>(() => {
    return providers.map((provider) => {
      const mapped = REGION_GEO[provider.region] ?? hashToCoord(provider.region);
      const providerLeases = leases.filter((item) => item.providerId === provider.id && item.status === 'ACTIVE').length;
      const variability = (hashInt(provider.id) % 100) / 100;
      const uptime = provider.status === 'ACTIVE' ? 98.0 + variability * 1.6 : 92.0 + variability * 2.8;
      return {
        ...provider,
        lat: mapped.lat,
        lng: mapped.lng,
        name: `Provider ${provider.address.slice(0, 8)}`,
        uptime: Number(uptime.toFixed(2)),
        leasesCount: providerLeases,
        earningsToday: Number((providerLeases * provider.pricePerCpu * 6.4).toFixed(2))
      };
    });
  }, [providers, leases]);

  const providerById = useMemo(
    () => Object.fromEntries(providersGeo.map((provider) => [provider.id, provider])),
    [providersGeo]
  );

  const selectedProvider = selectedProviderId ? providerById[selectedProviderId] : providersGeo[0];

  useEffect(() => {
    if (!providerFromUrl || providersGeo.length === 0) {
      return;
    }

    const requested = providersGeo.find((provider) => provider.id === providerFromUrl);
    if (!requested) {
      return;
    }

    setSelectedProviderId(requested.id);
    globeRef.current?.pointOfView?.({ lat: requested.lat, lng: requested.lng, altitude: 1.5 }, 1200);
  }, [providerFromUrl, providersGeo]);

  const arcs = useMemo<ArcDatum[]>(() => {
    const deploymentMap = Object.fromEntries(deployments.map((item) => [item.id, item]));
    return leases
      .filter((item) => item.status === 'ACTIVE')
      .map((lease) => {
        const provider = providerById[lease.providerId];
        if (!provider) {
          return null;
        }
        const tenantAddress = deploymentMap[lease.deploymentId]?.tenantAddress ?? lease.deploymentId;
        const tenantCoord = hashToCoord(tenantAddress);
        return {
          startLat: tenantCoord.lat,
          startLng: tenantCoord.lng,
          endLat: provider.lat,
          endLng: provider.lng
        };
      })
      .filter((item): item is ArcDatum => Boolean(item));
  }, [leases, deployments, providerById]);

  const ringsData = useMemo<RingDatum[]>(
    () =>
      providersGeo
        .filter((provider) => provider.status === 'ACTIVE')
        .map((provider) => {
          const hash = hashInt(provider.id);
          return {
            ...provider,
            ringRepeatPeriod: 2_000 + (hash % 420),
            ringPropagationSpeed: 1.7 + (hash % 4) * 0.12,
            ringMaxRadius: 2 + (hash % 3) * 0.45
          };
        }),
    [providersGeo]
  );
  const onlineCount = providersGeo.filter((provider) => provider.status === 'ACTIVE').length;

  const uptimeHistory = useMemo(() => {
    const base = selectedProvider?.uptime ?? 96;
    return Array.from({ length: 12 }, (_, idx) => ({
      slot: `${idx * 2}h`,
      uptime: Number((base - ((idx % 4) * 0.22 - 0.33)).toFixed(2))
    }));
  }, [selectedProvider?.id, selectedProvider?.uptime]);

  const handleSelectProvider = (provider: ProviderGeo) => {
    setSelectedProviderId(provider.id);
    globeRef.current?.pointOfView?.({ lat: provider.lat, lng: provider.lng, altitude: 1.5 }, 1200);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-text-primary">
      <div className="cn-noise-overlay" />

      <div className="relative z-10 flex min-h-screen">
        <div className="relative flex-1" onMouseEnter={() => setAutoRotate(false)} onMouseLeave={() => setAutoRotate(true)}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(123,97,255,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(0,255,194,0.1),transparent_28%),radial-gradient(circle_at_50%_90%,rgba(0,255,194,0.08),transparent_30%)]" />
          <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(2px_2px_at_20px_30px,#fff,transparent),radial-gradient(2px_2px_at_40px_70px,#fff,transparent),radial-gradient(1px_1px_at_90px_40px,#fff,transparent)] [background-size:200px_200px]" />

          <div className="absolute left-6 top-6 z-20">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Provider Map · <span className="text-brand-primary">{onlineCount} providers online</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-text-muted">
              Real-time Comnetish infrastructure topology with active lease flow and live provider status.
            </p>
          </div>

          {!providersQuery.isLoading && (
            <Globe
              ref={globeRef}
              width={Math.max(960, viewport.width - 320)}
              height={viewport.height}
              globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
              bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
              backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
              pointsData={providersGeo}
              pointLat="lat"
              pointLng="lng"
              pointAltitude={0.02}
              pointRadius={0.3}
              pointColor={(point: object) => getProviderColor((point as ProviderGeo).status)}
              pointLabel={(point: object) => {
                const provider = point as ProviderGeo;
                return `<b>${provider.name}</b><br/>${provider.region}<br/>${provider.status}`;
              }}
              onPointClick={(point: object) => {
                const provider = point as ProviderGeo;
                handleSelectProvider(provider);
                setIsModalOpen(true);
              }}
              ringsData={ringsData}
              ringLat="lat"
              ringLng="lng"
              ringColor={() => ['rgba(0,255,194,0.34)', 'rgba(0,255,194,0.0)']}
              ringMaxRadius={(point: object) => (point as RingDatum).ringMaxRadius}
              ringPropagationSpeed={(point: object) => (point as RingDatum).ringPropagationSpeed}
              ringRepeatPeriod={(point: object) => (point as RingDatum).ringRepeatPeriod}
              arcsData={arcs}
              arcColor={() => '#7B61FF'}
              arcDashLength={0.45}
              arcDashGap={1}
              arcDashAnimateTime={2500}
              arcStroke={0.8}
              arcAltitude={0.16}
              onGlobeReady={() => {
                const controls = globeRef.current?.controls?.();
                if (controls) {
                  controls.autoRotate = autoRotate;
                  controls.autoRotateSpeed = 0.28;
                  controls.enableDamping = true;
                  controls.dampingFactor = 0.08;
                }
              }}
              onGlobeClick={() => setAutoRotate(false)}
            />
          )}

          {providersQuery.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="cn-skeleton-shimmer h-96 w-96 rounded-full border border-[rgba(0,255,194,0.15)]" />
            </div>
          )}
        </div>

        <aside className="relative z-20 w-[320px] border-l border-[rgba(0,255,194,0.15)] bg-surface/90 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl">Providers</h2>
            <Badge variant="active">Live</Badge>
          </div>

          <div className="max-h-[52vh] space-y-3 overflow-auto pr-1">
            {providersGeo.map((provider) => {
              const regionInfo = REGION_GEO[provider.region];
              return (
                <motion.button
                  key={provider.id}
                  whileHover={{ y: -1 }}
                  onClick={() => handleSelectProvider(provider)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedProvider?.id === provider.id
                      ? 'border-brand-primary/40 bg-background/70'
                      : 'border-[rgba(0,255,194,0.12)] bg-background/45 hover:bg-background/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-text-primary">{provider.name}</p>
                    <Badge variant={getStatusBadgeVariant(provider.status)}>{provider.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {regionInfo?.flag ?? '🌐'} {regionInfo?.label ?? provider.region}
                  </p>
                  <p className="mt-2 font-mono text-xs text-text-muted">
                    {provider.cpu} vCPU · {formatMemory(provider.memory)} · {formatStorage(provider.storage)}
                  </p>
                  <p className="mt-1 font-mono text-sm text-brand-primary">{provider.pricePerCpu.toFixed(3)} CNT / hr</p>
                </motion.button>
              );
            })}
          </div>

          {selectedProvider && (
            <Card
              className="mt-4 border-[rgba(0,255,194,0.2)] bg-background/70"
              title={selectedProvider.name}
              description={`${selectedProvider.region} · ${selectedProvider.address.slice(0, 14)}...`}
              footer={
                <div className="flex gap-2">
                  <Button variant="primary" className="w-full" onClick={() => setIsModalOpen(true)}>
                    View Details
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-text-muted">Uptime</p>
                  <p className="font-mono text-brand-primary">{selectedProvider.uptime}%</p>
                </div>
                <div>
                  <p className="text-text-muted">Current leases</p>
                  <p className="font-mono">{selectedProvider.leasesCount}</p>
                </div>
                <div>
                  <p className="text-text-muted">Earnings today</p>
                  <p className="font-mono">{selectedProvider.earningsToday.toFixed(2)} CNT</p>
                </div>
                <div>
                  <p className="text-text-muted">Hardware</p>
                  <p className="font-mono">{selectedProvider.cpu} CPU</p>
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {isModalOpen && selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-3xl rounded-2xl border border-[rgba(0,255,194,0.2)] bg-surface p-6 shadow-brand-primary"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-2xl text-text-primary">{selectedProvider.name}</h3>
                <p className="mt-1 text-sm text-text-muted">{selectedProvider.region}</p>
              </div>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Close
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card className="border-[rgba(0,255,194,0.12)] bg-background/60" title="CPU">
                <p className="font-mono text-lg">{selectedProvider.cpu} vCPU</p>
              </Card>
              <Card className="border-[rgba(0,255,194,0.12)] bg-background/60" title="RAM">
                <p className="font-mono text-lg">{formatMemory(selectedProvider.memory)}</p>
              </Card>
              <Card className="border-[rgba(0,255,194,0.12)] bg-background/60" title="Storage">
                <p className="font-mono text-lg">{formatStorage(selectedProvider.storage)}</p>
              </Card>
              <Card className="border-[rgba(0,255,194,0.12)] bg-background/60" title="Price">
                <p className="font-mono text-lg text-brand-primary">{selectedProvider.pricePerCpu.toFixed(3)} CNT/hr</p>
              </Card>
            </div>

            <div className="mt-6 rounded-xl border border-[rgba(0,255,194,0.15)] bg-background/60 p-4">
              <p className="mb-3 font-display text-lg">Historical Uptime</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={uptimeHistory} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(139,148,158,0.2)" strokeDasharray="3 3" />
                    <XAxis dataKey="slot" stroke="#8B949E" tick={{ fill: '#8B949E', fontSize: 12 }} />
                    <YAxis stroke="#8B949E" tick={{ fill: '#8B949E', fontSize: 12 }} domain={[90, 100]} />
                    <Tooltip
                      contentStyle={{
                        background: '#1C2128',
                        border: '1px solid rgba(0,255,194,0.15)',
                        color: '#E6EDF3'
                      }}
                    />
                    <Area type="monotone" dataKey="uptime" stroke="#00FFC2" fill="rgba(0,255,194,0.18)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Current active deployments: <span className="font-mono text-text-primary">{selectedProvider.leasesCount}</span>
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  window.location.href = `/deploy?provider=${encodeURIComponent(selectedProvider.id)}`;
                }}
              >
                Deploy Here
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}

export default function ProviderMapPage() {
  return <ProviderMapPageContent />;
}
