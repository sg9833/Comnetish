'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { authLogin, authMe, getAuthProviders, getGoogleStartUrl } from '../../lib/auth';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured for this environment yet.',
  google_link_requires_login: 'You need to sign in before linking a Google account.',
  google_callback_invalid: 'Google sign-in returned an invalid callback payload.',
  google_state_invalid: 'Google sign-in expired. Please try again.',
  google_oauth_failed: 'Google sign-in could not be completed. Please try again.'
};

const GOOGLE_NOT_CONFIGURED_MESSAGE = 'Google sign-in is not configured for this environment yet.';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then(() => {
        if (!cancelled) {
          router.replace('/dashboard');
        }
      })
      .catch(() => {
        // user is not authenticated; stay on login page
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    void getAuthProviders()
      .then((providers) => {
        if (!cancelled) {
          setGoogleConfigured(providers.google.configured);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGoogleConfigured(false);
        }
      });

    const params = new URLSearchParams(window.location.search);
    const authError = params.get('authError');
    if (authError && AUTH_ERROR_MESSAGES[authError]) {
      setError(AUTH_ERROR_MESSAGES[authError]);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await authLogin({ email, password });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-text-primary">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,255,194,0.16)] bg-surface/80 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <h1 className="font-display text-3xl font-semibold">Sign In</h1>
        <p className="mt-2 text-sm text-text-muted">Access your Comnetish tenant console</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[rgba(0,255,194,0.18)] bg-background px-3 py-2 text-sm outline-none transition focus:border-brand-primary"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[rgba(0,255,194,0.18)] bg-background px-3 py-2 text-sm outline-none transition focus:border-brand-primary"
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <a
          href={googleConfigured === false ? undefined : getGoogleStartUrl({ returnPath: '/dashboard', sourcePath: '/login' })}
          aria-disabled={googleConfigured === false}
          onClick={(event) => {
            if (googleConfigured === false) {
              event.preventDefault();
              setError(GOOGLE_NOT_CONFIGURED_MESSAGE);
            }
          }}
          className="mt-4 block rounded-md border border-[rgba(0,255,194,0.24)] px-4 py-2 text-center text-sm font-semibold text-brand-primary transition hover:bg-[rgba(0,255,194,0.08)] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {googleConfigured === false ? 'Google Sign-In Unavailable' : 'Continue with Google'}
        </a>

        {googleConfigured === false ? (
          <p className="mt-2 text-sm text-amber-200">Google OAuth credentials are not configured for this environment.</p>
        ) : null}

        <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
          <Link href="/forgot-password" className="hover:text-text-primary">
            Forgot password?
          </Link>
          <Link href="/signup" className="hover:text-text-primary">
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
