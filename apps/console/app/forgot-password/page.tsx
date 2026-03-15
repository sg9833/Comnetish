'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { authForgotPassword } from '../../lib/auth';

function tokenFromPreviewUrl(value?: string) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    return url.searchParams.get('token') ?? '';
  } catch {
    return '';
  }
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setPreviewUrl(null);

    try {
      const response = await authForgotPassword(email);
      setSuccess('If an account exists, a reset link has been sent.');
      if (response.reset?.previewUrl) {
        setPreviewUrl(response.reset.previewUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start password reset');
    } finally {
      setSubmitting(false);
    }
  }

  const resetToken = tokenFromPreviewUrl(previewUrl ?? undefined);

  return (
    <main className="min-h-screen bg-background px-6 py-12 text-text-primary">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,255,194,0.16)] bg-surface/80 p-8 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <h1 className="font-display text-3xl font-semibold">Forgot Password</h1>
        <p className="mt-2 text-sm text-text-muted">Request a password reset link for your account</p>

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

          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {success ? <p className="text-sm text-green-300">{success}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {previewUrl ? (
          <div className="mt-4 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
            <p className="font-semibold">Local development reset preview</p>
            <p className="mt-1 break-all text-amber-100/90">{previewUrl}</p>
            {resetToken ? (
              <Link
                href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                className="mt-2 inline-block font-semibold text-amber-100 underline underline-offset-4"
              >
                Continue to reset form
              </Link>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 text-sm text-text-muted">
          <Link href="/login" className="text-brand-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
