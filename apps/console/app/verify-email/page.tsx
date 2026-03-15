'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { authVerifyEmail } from '../../lib/auth';

function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';

  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(initialToken ? 'submitting' : 'idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialToken) {
      return;
    }

    let cancelled = false;
    void authVerifyEmail(initialToken)
      .then(() => {
        if (!cancelled) {
          setStatus('success');
          setMessage('Email verified successfully.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Verification failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialToken]);

  async function verifyManually() {
    if (!token) {
      setStatus('error');
      setMessage('Token is required');
      return;
    }

    setStatus('submitting');
    setMessage(null);
    try {
      await authVerifyEmail(token);
      setStatus('success');
      setMessage('Email verified successfully.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-text-primary">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,255,194,0.16)] bg-surface/80 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <h1 className="font-display text-3xl font-semibold">Verify Email</h1>
        <p className="mt-2 text-sm text-text-muted">Confirm your email address to unlock all account capabilities</p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="token" className="mb-1 block text-sm text-text-muted">
              Verification token
            </label>
            <input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-md border border-[rgba(0,255,194,0.18)] bg-background px-3 py-2 text-sm outline-none transition focus:border-brand-primary"
            />
          </div>

          <button
            onClick={() => void verifyManually()}
            disabled={status === 'submitting'}
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'submitting' ? 'Verifying...' : 'Verify Email'}
          </button>

          {message ? (
            <p className={`text-sm ${status === 'success' ? 'text-green-300' : 'text-red-300'}`}>{message}</p>
          ) : null}
        </div>

        <div className="mt-4 text-sm text-text-muted">
          <Link href="/login" className="text-brand-primary hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-6 py-12 text-text-primary">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,255,194,0.16)] bg-surface/80 p-8">
            <p className="text-sm text-text-muted">Loading verification...</p>
          </div>
        </main>
      }
    >
      <VerifyEmailPageContent />
    </Suspense>
  );
}
