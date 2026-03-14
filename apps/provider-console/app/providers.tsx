'use client';

import '@rainbow-me/rainbowkit/styles.css';

import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { useEffect, useState, type ReactNode } from 'react';

const WALLETCONNECT_INTERRUPT_MSG = 'Connection interrupted while trying to subscribe';

export function Providers({ children }: { children: ReactNode }) {
  const [wagmiConfig] = useState(() => {
    return createConfig({
      chains: [mainnet, sepolia],
      connectors: [injected({ shimDisconnect: true })],
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http()
      },
      ssr: false
    });
  });

  useEffect(() => {
    for (const key of Object.keys(localStorage)) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith('wc@2') || normalized.includes('walletconnect')) {
        localStorage.removeItem(key);
      }
    }

    for (const key of Object.keys(sessionStorage)) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith('wc@2') || normalized.includes('walletconnect')) {
        sessionStorage.removeItem(key);
      }
    }

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reasonText =
        typeof event.reason === 'string'
          ? event.reason
          : event.reason instanceof Error
            ? event.reason.message
            : '';

      if (
        reasonText.includes(WALLETCONNECT_INTERRUPT_MSG) ||
        reasonText.toLowerCase().includes('walletconnect')
      ) {
        event.preventDefault();
      }
    };

    const errorHandler = (event: ErrorEvent) => {
      const text = event.message || '';
      if (text.includes(WALLETCONNECT_INTERRUPT_MSG) || text.toLowerCase().includes('walletconnect')) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', rejectionHandler);
    window.addEventListener('error', errorHandler);
    return () => {
      window.removeEventListener('unhandledrejection', rejectionHandler);
      window.removeEventListener('error', errorHandler);
    };
  }, []);

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
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
