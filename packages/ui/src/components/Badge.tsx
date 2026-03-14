'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from './utils';

export type BadgeVariant = 'active' | 'pending' | 'error' | 'success';

type BadgeProps = Omit<HTMLMotionProps<'span'>, 'children'> & {
  children?: ReactNode;
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  active: 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary',
  pending: 'border-brand-secondary/50 bg-brand-secondary/10 text-brand-secondary',
  error: 'border-brand-warning/50 bg-brand-warning/10 text-brand-warning',
  success: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
};

export function Badge({ variant = 'active', className, children, ...props }: BadgeProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.span>
  );
}