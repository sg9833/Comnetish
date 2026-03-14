'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, useEffect, useState, type ReactNode } from 'react';

// Suppress WalletConnect async errors globally (they're non-fatal for demo)
function useWalletConnectErrorSuppressor() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (
        event.message?.includes('Connection interrupted') ||
        event.message?.includes('walletconnect') ||
        event.message?.includes('subscribe')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message ?? String(event.reason ?? '');
      if (
        msg.includes('Connection interrupted') ||
        msg.includes('walletconnect') ||
        msg.includes('subscribe')
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
}

// Error boundary to catch render-time errors
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    if (
      error.message?.includes('Connection interrupted') ||
      error.message?.includes('walletconnect') ||
      error.message?.includes('subscribe')
    ) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (
      error.message?.includes('Connection interrupted') ||
      error.message?.includes('walletconnect') ||
      error.message?.includes('subscribe')
    ) {
      return;
    }
    console.error('App error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="max-w-md rounded-lg border border-red-500/20 bg-background/80 p-8 text-center">
            <p className="font-display text-lg text-text-primary">Something went wrong</p>
            <p className="mt-2 text-sm text-text-muted">{this.state.error?.message}</p>
            <button
              className="mt-4 rounded-md bg-brand-primary px-4 py-2 text-sm text-background"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProvidersInner({ children }: { children: ReactNode }) {
  useWalletConnectErrorSuppressor();
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ProvidersInner>{children}</ProvidersInner>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
