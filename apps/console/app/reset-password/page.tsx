'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Suspense } from 'react';
import { authResetPassword } from '../../lib/auth';

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!token) {
      setError('Reset token is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authResetPassword(token, password);
      setSuccess('Password reset completed. Redirecting to dashboard...');
      setTimeout(() => router.replace('/dashboard'), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-text-primary">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,255,194,0.16)] bg-surface/80 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <h1 className="font-display text-3xl font-semibold">Reset Password</h1>
        <p className="mt-2 text-sm text-text-muted">Set a new password for your account</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="token" className="mb-1 block text-sm text-text-muted">
              Reset token
            </label>
            <input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-md border border-[rgba(0,255,194,0.18)] bg-background px-3 py-2 text-sm outline-none transition focus:border-brand-primary"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-text-muted">
              New password
            </label>
            <input
              id="password"
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[rgba(0,255,194,0.18)] bg-background px-3 py-2 text-sm outline-none transition focus:border-brand-primary"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm text-text-muted">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-[rgba(0,255,194,0.18)] bg-background px-3 py-2 text-sm outline-none transition focus:border-brand-primary"
            />
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-green-300">{success}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <p className="mt-4 text-sm text-text-muted">
          <Link href="/login" className="text-brand-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-6 py-12 text-text-primary">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,255,194,0.16)] bg-surface/80 p-8">
            <p className="text-sm text-text-muted">Loading reset form...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  );
}
