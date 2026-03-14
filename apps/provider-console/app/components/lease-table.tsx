type LeaseStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';

export interface LeaseTableItem {
  id: string;
  status: LeaseStatus;
  pricePerBlock: number;
  startedAt: string;
  resourceUsage: string;
}

interface LeaseTableProps {
  leases: LeaseTableItem[];
}

function formatLeaseDate(dateLike: string) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function getStatusView(status: LeaseStatus) {
  if (status === 'ACTIVE') {
    return { label: 'ACTIVE', classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' };
  }

  return { label: 'ENDED', classes: 'bg-slate-500/15 text-slate-300 border-slate-500/40' };
}

function shortLeaseId(id: string) {
  if (id.length <= 14) {
    return id;
  }

  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

export function LeaseTable({ leases }: LeaseTableProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <h3 className="text-lg font-semibold text-slate-100">Active Lease Overview</h3>
      <p className="mt-1 text-sm text-slate-400">Live and historical lease performance for your provider.</p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-3">Lease ID</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Price (CNT/block)</th>
              <th className="px-3 py-3">Started Time</th>
              <th className="px-3 py-3">Resource Usage</th>
            </tr>
          </thead>
          <tbody>
            {leases.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-slate-400" colSpan={5}>
                  No lease records yet.
                </td>
              </tr>
            ) : (
              leases.map((lease) => {
                const statusView = getStatusView(lease.status);
                return (
                  <tr key={lease.id} className="border-b border-white/5 text-slate-200">
                    <td className="px-3 py-4 font-mono text-xs text-slate-300">{shortLeaseId(lease.id)}</td>
                    <td className="px-3 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusView.classes}`}
                      >
                        {statusView.label}
                      </span>
                    </td>
                    <td className="px-3 py-4 font-mono">{lease.pricePerBlock.toFixed(6)}</td>
                    <td className="px-3 py-4 text-slate-400">{formatLeaseDate(lease.startedAt)}</td>
                    <td className="px-3 py-4 text-slate-300">{lease.resourceUsage}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
