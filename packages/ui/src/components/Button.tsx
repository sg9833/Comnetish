'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-primary text-background hover:shadow-[0_0_20px_rgba(0,255,194,0.4)] focus-visible:ring-brand-primary/60 active:brightness-95',
  secondary:
    'bg-brand-secondary text-text-primary hover:shadow-[0_0_20px_rgba(0,255,194,0.4)] focus-visible:ring-brand-secondary/60 active:brightness-95',
  ghost:
    'border border-text-muted/30 bg-transparent text-text-primary hover:bg-surface focus-visible:ring-text-muted/50',
  danger:
    'bg-brand-warning text-background hover:shadow-[0_0_20px_rgba(255,107,53,0.35)] focus-visible:ring-brand-warning/60 active:brightness-95'
};

export function Button({
  variant = 'primary',
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      whileHover={{ scale: isDisabled ? 1 : 1.01 }}
      whileTap={{ scale: isDisabled ? 1 : 0.98 }}
      transition={{ duration: 0.15 }}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {leftIcon}
      {loading ? 'Loading…' : children}
      {rightIcon}
    </motion.button>
  );
}