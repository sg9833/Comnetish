'use client';

import { Badge, Button, Card } from '@comnetish/ui';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Deployment = {
  id: string;
  tenantAddress: string;
  sdl: string;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED';
  createdAt: string;
  closedAt?: string | null;
  bids?: { id: string }[];
};

function deploymentTypeFromSDL(sdl: string): string {
  if (!sdl) return 'Unknown';
  const lower = sdl.toLowerCase();
  if (lower.includes('nginx') || lower.includes('web')) return 'Web App';
  if (lower.includes('postgres') || lower.includes('mysql') || lower.includes('database')) return 'Database';
  if (lower.includes('redis') || lower.includes('cache')) return 'Cache';
  if (lower.includes('python') || lower.includes('fastapi') || lower.includes('django')) return 'API Service';
  if (lower.includes('node') || lower.includes('express')) return 'Node Service';
  return 'Custom';
}

export default function DeploymentsPage() {
  const router = useRouter();

  const { data: deployments = [], isLoading } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/deployments`);
      const json = await res.json();
      return json.data ?? [];
    },
    refetchInterval: 30_000
  });

  const statusVariant = (status: string) => {
    if (status === 'ACTIVE') return 'success';
    if (status === 'OPEN') return 'pending';
    return 'default';
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-semibold text-text-primary">Deployments</h1>
          <p className="mt-1 text-text-muted">All deployments on the marketplace</p>
        </div>
        <Button variant="primary" onClick={() => router.push('/deploy')}>
          + New Deployment
        </Button>
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="cn-skeleton-shimmer h-20 rounded-lg" />
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <Card title="No Deployments" description="Create your first deployment to get started">
          <div className="py-8 text-center">
            <p className="mb-4 text-text-muted">No deployments found.</p>
            <Button variant="primary" onClick={() => router.push('/deploy')}>
              Create Deployment
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {deployments.map((deployment, index) => (
            <motion.div
              key={deployment.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link href={`/deployments/${deployment.id}`}>
                <div className="flex flex-col gap-4 rounded-lg border border-[rgba(0,255,194,0.1)] bg-background/70 p-4 transition-colors hover:border-[rgba(0,255,194,0.3)] hover:bg-background/90 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-brand-primary">{deployment.id}</p>
                    <p className="mt-0.5 text-sm text-text-muted">{deploymentTypeFromSDL(deployment.sdl)}</p>
                    <p className="mt-0.5 font-mono text-xs text-text-muted/60">
                      {deployment.tenantAddress}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div>
                      <p className="font-mono text-xs uppercase text-text-muted">Status</p>
                      <Badge variant={statusVariant(deployment.status)}>{deployment.status}</Badge>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase text-text-muted">Bids</p>
                      <p className="font-mono text-sm text-text-primary">{deployment.bids?.length ?? 0}</p>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase text-text-muted">Created</p>
                      <p className="text-sm text-text-muted">
                        {new Date(deployment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="secondary" className="px-3 py-2 text-sm">
                      View →
                    </Button>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </main>
  );
}
