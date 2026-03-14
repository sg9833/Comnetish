'use client';

import { motion } from 'framer-motion';
import type { HTMLAttributes } from 'react';
import { cn } from './utils';

type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  lines: string[];
};

export function Terminal({ title = 'terminal', lines, className, ...props }: TerminalProps) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-text-primary/15 bg-background', className)} {...props}>
      <div className="flex items-center justify-between border-b border-text-primary/10 bg-surface px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-warning/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-secondary/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-brand-primary/90" />
        </div>
        <p className="font-mono text-xs uppercase tracking-wider text-text-muted">{title}</p>
      </div>
      <pre className="m-0 max-h-80 overflow-auto p-4 font-mono text-sm leading-6 text-text-primary">
        {lines.map((line, index) => (
          <motion.code
            key={`${line}-${index}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.16, delay: Math.min(index * 0.03, 0.25) }}
            className="block"
          >
            {line}
          </motion.code>
        ))}
      </pre>
    </div>
  );
}