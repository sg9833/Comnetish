interface ResourceCardProps {
  title: string;
  usagePercent: number;
  detail: string;
}

export function ResourceCard({ title, usagePercent, detail }: ResourceCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{title}</p>
        <p className="text-sm font-semibold text-slate-100">{usagePercent}%</p>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-[#3B82F6] transition-all duration-300"
          style={{ width: `${usagePercent}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usagePercent}
          aria-label={title}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
