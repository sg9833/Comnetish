'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from './utils';

export type StatTrend = 'up' | 'down' | 'neutral';

type StatCardProps = HTMLMotionProps<'div'> & {
  label: string;
  value: string | number;
  trend?: StatTrend;
  trendLabel?: string;
};

const trendClasses: Record<StatTrend, string> = {
  up: 'text-brand-primary',
  down: 'text-brand-warning',
  neutral: 'text-text-muted'
};

const trendGlyph: Record<StatTrend, string> = {
  up: '▲',
  down: '▼',
  neutral: '•'
};

export function StatCard({
  label,
  value,
  trend = 'neutral',
  trendLabel,
  className,
  ...props
}: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.16 }}
      className={cn('rounded-xl border border-text-primary/10 bg-surface p-4 shadow-surface', className)}
      {...props}
    >
      <p className="font-mono text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-text-primary">{value}</p>
      {(trendLabel || trend !== 'neutral') && (
        <p className={cn('mt-2 flex items-center gap-1 text-sm font-medium', trendClasses[trend])}>
          <span aria-hidden>{trendGlyph[trend]}</span>
          <span>{trendLabel ?? 'No change'}</span>
        </p>
      )}
    </motion.div>
  );
}