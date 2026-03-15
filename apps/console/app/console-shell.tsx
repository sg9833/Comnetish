'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { authLogout, authMe, type AuthUser } from '../lib/auth';

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
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setAuthLoading(true);
    void authMe()
      .then((payload) => {
        if (!cancelled) {
          setCurrentUser(payload.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await authLogout();
      setCurrentUser(null);
      router.push('/login');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-40 border-b border-[rgba(0,255,194,0.14)] bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-2">
          <Link href="/dashboard" className="font-display text-lg font-semibold tracking-tight">
            Comnetish Console
          </Link>
          <div className="flex items-center gap-3">
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

            {authLoading ? (
              <span className="text-xs text-text-muted">Checking session...</span>
            ) : currentUser ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-text-muted md:inline">
                  {currentUser.email ?? currentUser.displayName ?? 'Signed in'}
                </span>
                <button
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="rounded-md border border-[rgba(0,255,194,0.22)] px-3 py-1.5 text-xs font-semibold text-brand-primary transition hover:bg-[rgba(0,255,194,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingOut ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="rounded-md border border-[rgba(0,255,194,0.2)] px-3 py-1.5 text-xs font-semibold text-brand-primary transition hover:bg-[rgba(0,255,194,0.12)]"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-background"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <div>{children}</div>
    </div>
  );
}
