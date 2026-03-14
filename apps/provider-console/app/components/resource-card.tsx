import React from 'react';

interface ResourceCardProps {
  title: string;
  usagePercent: number;
  detail: string;
}

export function ResourceCard({ title, usagePercent, detail }: ResourceCardProps) {
  const normalizedUsage = Number.isFinite(usagePercent) ? Math.max(0, Math.min(100, usagePercent)) : 0;
  const roundedUsage = Math.round(normalizedUsage);

  return (
    <article className="rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{title}</p>
        <p className="text-sm font-semibold text-slate-100">{roundedUsage}%</p>
      </div>
      <progress
        className="mt-4 h-2 w-full overflow-hidden rounded-full [appearance:none] [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:bg-[#3B82F6] [&::-moz-progress-bar]:bg-[#3B82F6]"
        value={roundedUsage}
        max={100}
        aria-label={title}
      />
      <p className="mt-3 text-xs text-slate-500">{detail}</p>
    </article>
  );
}
