'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type ConsoleShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/deployments', label: 'Deployments' },
  { href: '/map', label: 'Provider Map' },
  { href: '/deploy', label: 'Deploy' }
];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard' || pathname === '/';
  }
  if (href === '/deploy') {
    return pathname === '/deploy' || pathname.startsWith('/deploy/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleShell({ children }: ConsoleShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-40 border-b border-[rgba(0,255,194,0.14)] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link href="/dashboard" className="font-display text-lg font-semibold tracking-tight">
            Comnetish Console
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? 'text-brand-primary' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <span>{item.label}</span>
                  {active ? (
                    <motion.span
                      layoutId="console-nav-underline"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-primary shadow-[0_0_12px_rgba(0,255,194,0.7)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.5 }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div>{children}</div>
    </div>
  );
}
