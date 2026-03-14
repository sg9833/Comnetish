'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, StatCard, Badge, Button } from '@comnetish/ui';
import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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

interface Bid {
  id: string;
  deploymentId: string;
  providerId: string;
  price: number;
  status: 'OPEN' | 'WON' | 'LOST';
  deployment: { id: string };
  provider: { id: string };
}

interface ProviderStats {
  activeLeases: number;
  totalEarnings: number;
  monthlyEarnings: number;
  cpu: number;
  memory: number;
  storage: number;
}

export default function ProviderConsolePage() {
  // Fetch provider stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['provider-stats'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/providers/me/stats`);
      if (!response.ok) {
        throw new Error('Failed to load stats');
      }
      const payload = (await response.json()) as { data: ProviderStats };
      return payload.data;
    },
    refetchInterval: 30_000
  });

  // Fetch active leases
  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['provider-leases'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/leases?status=ACTIVE`);
      if (!response.ok) {
        throw new Error('Failed to load leases');
      }
      const payload = (await response.json()) as { data: Lease[] };
      return payload.data;
    },
    refetchInterval: 20_000
  });

  // Fetch pending bids
  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ['provider-bids'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/bids`);
      if (!response.ok) {
        throw new Error('Failed to load bids');
      }
      const payload = (await response.json()) as { data: Bid[] };
      // Filter for OPEN bids
      return payload.data.filter((bid) => bid.status === 'OPEN');
    },
    refetchInterval: 15_000
  });

  const isLoading = statsLoading || leasesLoading || bidsLoading;

  if (isLoading && !stats) {
    return <DashboardSkeleton />;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="font-display text-4xl font-semibold text-text-primary">Provider Dashboard</h1>
          <p className="mt-2 text-text-muted">Manage your resources, leases, and earnings</p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard label="Active Leases" value={stats?.activeLeases || 0} />
          <StatCard label="Monthly Earnings" value={`${(stats?.monthlyEarnings || 0).toFixed(2)} CNT`} />
          <StatCard label="Total Earnings" value={`${(stats?.totalEarnings || 0).toFixed(2)} CNT`} />
          <StatCard label="CPU Available" value={`${stats?.cpu || 0} cores`} />
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Active Leases Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="xl:col-span-2"
          >
            <Card title="Active Leases" subtitle={`${leases?.length || 0} active`}>
              <div className="space-y-3">
                {!leases || leases.length === 0 ? (
                  <p className="text-sm text-text-muted">No active leases yet</p>
                ) : (
                  leases.map((lease) => (
                    <motion.div
                      key={lease.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between rounded-lg border border-text-primary/10 bg-surface/40 p-3"
                    >
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold text-text-primary">{lease.deploymentId}</p>
                        <p className="text-xs text-text-muted">Price: {lease.pricePerBlock.toFixed(4)} CNT/block</p>
                      </div>
                      <Badge type={lease.status === 'ACTIVE' ? 'active' : 'pending'}>{lease.status}</Badge>
                    </motion.div>
                  ))
                )}
              </div>
            </Card>
          </motion.div>

          {/* Resources Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card title="Available Resources">
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">CPU</span>
                    <span className="font-mono text-sm text-text-muted">{stats?.cpu || 0} cores</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface/60">
                    <div className="h-2 rounded-full bg-brand-primary" style={{ width: '65%' }} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">Memory</span>
                    <span className="font-mono text-sm text-text-muted">{stats?.memory || 0} GB</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface/60">
                    <div className="h-2 rounded-full bg-brand-secondary" style={{ width: '42%' }} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">Storage</span>
                    <span className="font-mono text-sm text-text-muted">{stats?.storage || 0} GB</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface/60">
                    <div className="h-2 rounded-full bg-brand-warning" style={{ width: '28%' }} />
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Pending Bids Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card title="Pending Bids" subtitle={`${bids?.length || 0} bids awaiting response`}>
            <div className="space-y-3">
              {!bids || bids.length === 0 ? (
                <p className="text-sm text-text-muted">No pending bids</p>
              ) : (
                bids.map((bid) => (
                  <motion.div
                    key={bid.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between rounded-lg border border-text-primary/10 bg-surface/40 p-4"
                  >
                    <div className="flex-1">
                      <p className="font-mono text-sm font-semibold text-text-primary">{bid.deploymentId}</p>
                      <p className="text-xs text-text-muted">Price: {bid.price.toFixed(2)} CNT/hour</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => console.log('Accept bid', bid.id)}>
                        Accept
                      </Button>
                      <Button variant="ghost" onClick={() => console.log('Decline bid', bid.id)}>
                        Decline
                      </Button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}

function DashboardSkeleton() {
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

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="cn-skeleton-shimmer h-64 rounded-xl" />
          </div>
          <div className="cn-skeleton-shimmer h-64 rounded-xl" />
        </div>

        <div className="cn-skeleton-shimmer h-48 rounded-xl" />
      </div>
    </main>
  );
}
