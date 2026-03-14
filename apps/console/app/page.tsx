'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, StatCard, Badge, Button } from '@comnetish/ui';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DeploymentApiRecord {
  id: string;
  tenantAddress: string;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED';
  createdAt: string;
  closedAt?: string;
  bids?: Array<{ id: string; price: number }>;
  leases?: Array<{ id: string; status: string }>;
  _count?: {
    bids?: number;
    leases?: number;
  };
}

interface Deployment {
  id: string;
  tenantAddress: string;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED';
  createdAt: string;
  closedAt?: string;
  bidCount: number;
  leaseCount: number;
}

interface Lease {
  id: string;
  deploymentId: string;
  status: 'PENDING' | 'ACTIVE' | 'CLOSED';
  startedAt: string;
  pricePerBlock: number;
}

function normalizeDeployments(records: DeploymentApiRecord[]): Deployment[] {
  return records.map((record) => ({
    id: record.id,
    tenantAddress: record.tenantAddress,
    status: record.status,
    createdAt: record.createdAt,
    closedAt: record.closedAt,
    bidCount: record._count?.bids ?? record.bids?.length ?? 0,
    leaseCount: record._count?.leases ?? record.leases?.length ?? 0
  }));
}

export default function HomePage() {
  // Fetch deployments
  const { data: deployments = [], isLoading: deploymentsLoading } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/deployments`);
      if (!response.ok) {
        throw new Error('Failed to load deployments');
      }
      const payload = (await response.json()) as { data?: DeploymentApiRecord[] };
      return normalizeDeployments(payload.data ?? []);
    },
    refetchInterval: 30_000
  });

  // Fetch leases
  const { data: leases = [], isLoading: leasesLoading } = useQuery<Lease[]>({
    queryKey: ['leases'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/leases`);
      if (!response.ok) {
        throw new Error('Failed to load leases');
      }
      const payload = (await response.json()) as { data?: Lease[] };
      return payload.data ?? [];
    },
    refetchInterval: 30_000
  });

  const isLoading = deploymentsLoading || leasesLoading;

  if (isLoading && deployments.length === 0 && leases.length === 0) {
    return <HomeSkeleton />;
  }

  const activeDeployments = deployments.filter((d) => d.status === 'ACTIVE');
  const openDeployments = deployments.filter((d) => d.status === 'OPEN');
  const activeLeases = leases.filter((l) => l.status === 'ACTIVE');
  const activeLeaseCounts = activeLeases.reduce<Map<string, number>>((counts, lease) => {
    counts.set(lease.deploymentId, (counts.get(lease.deploymentId) ?? 0) + 1);
    return counts;
  }, new Map());
  const totalSpending = activeLeases.reduce((sum, lease) => sum + lease.pricePerBlock * 720, 0); // ~720 blocks per day

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="font-display text-4xl font-semibold text-text-primary">Comnetish Console</h1>
          <p className="mt-2 text-text-muted">Manage deployments, bids, leases, and provider activity</p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard label="Active Deployments" value={activeDeployments.length} />
          <StatCard label="Open Bids" value={openDeployments.reduce((sum, deployment) => sum + deployment.bidCount, 0)} />
          <StatCard label="Active Leases" value={activeLeases.length} />
          <StatCard label="Monthly Spending" value={`${totalSpending.toFixed(2)} CNT`} />
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Active Deployments */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card title="Active Deployments" description={`${activeDeployments.length} running`}>
              <div className="space-y-3">
                {activeDeployments.length === 0 ? (
                  <p className="text-sm text-text-muted">No active deployments</p>
                ) : (
                  activeDeployments.slice(0, 5).map((deployment) => (
                    <motion.div
                      key={deployment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between rounded-lg border border-text-primary/10 bg-surface/40 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold text-text-primary">{deployment.id}</p>
                        <p className="text-xs text-text-muted">{activeLeaseCounts.get(deployment.id) ?? deployment.leaseCount} lease(s)</p>
                      </div>
                      <Badge variant="active">Active</Badge>
                    </motion.div>
                  ))
                )}
                {activeDeployments.length > 5 && (
                  <Link href="/deployments">
                    <Button variant="ghost" className="w-full">
                      View all →
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Open Bids Waiting */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card title="Pending Bids" description={`${openDeployments.reduce((sum, deployment) => sum + deployment.bidCount, 0)} waiting`}>
              <div className="space-y-3">
                {openDeployments.length === 0 ? (
                  <p className="text-sm text-text-muted">No deployments with pending bids</p>
                ) : (
                  openDeployments.slice(0, 5).map((deployment) => (
                    <motion.div
                      key={deployment.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between rounded-lg border border-text-primary/10 bg-surface/40 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold text-text-primary">{deployment.id}</p>
                        <p className="text-xs text-text-muted">{deployment.bidCount} bid(s) received</p>
                      </div>
                      <Badge variant="pending">Pending</Badge>
                    </motion.div>
                  ))
                )}
                {openDeployments.length > 5 && (
                  <Link href="/deployments">
                    <Button variant="ghost" className="w-full">
                      View all →
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card title="Quick Actions">
            <div className="flex flex-wrap gap-3">
              <Link href="/deploy">
                <Button variant="primary">Create Deployment</Button>
              </Link>
              <Link href="/deployments">
                <Button variant="secondary">View All Deployments</Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="ghost">Go to Dashboard</Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}

function HomeSkeleton() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <div className="space-y-3">
          <div className="cn-skeleton-shimmer h-10 w-48 rounded-lg" />
          <div className="cn-skeleton-shimmer h-4 w-64 rounded-lg" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="cn-skeleton-shimmer h-24 rounded-xl" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={idx} className="cn-skeleton-shimmer h-64 rounded-xl" />
          ))}
        </div>

        <div className="cn-skeleton-shimmer h-24 rounded-xl" />
      </div>
    </main>
  );
}
