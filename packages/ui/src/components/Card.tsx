'use client';

import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from './utils';

export type CardVariant = 'default' | 'glass';

type CardProps = Omit<HTMLMotionProps<'section'>, 'children'> & {
  children?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  variant?: CardVariant;
  footer?: ReactNode;
};

export function Card({
  title,
  description,
  variant = 'default',
  footer,
  className,
  children,
  ...props
}: CardProps) {
  const isGlass = variant === 'glass';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border p-5 text-text-primary shadow-surface transition-[border-color,box-shadow,transform] duration-200 hover:border-text-primary/25',
        isGlass
          ? 'border-text-primary/15 bg-glass-gradient backdrop-blur-lg'
          : 'border-text-primary/10 bg-surface',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <header className="mb-4">
          {title ? <h3 className="font-display text-lg font-semibold">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
        </header>
      )}
      <div>{children}</div>
      {footer ? <footer className="mt-4 border-t border-text-primary/10 pt-4">{footer}</footer> : null}
    </motion.section>
  );
}