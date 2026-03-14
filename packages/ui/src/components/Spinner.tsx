'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from './utils';

type SpinnerProps = HTMLMotionProps<'span'> & {
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]'
} as const;

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return (
    <motion.span
      aria-label="Loading"
      role="status"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
      className={cn(
        'inline-block rounded-full border-brand-primary/25 border-t-brand-primary',
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}