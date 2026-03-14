import './globals.css';
import type { ReactNode } from 'react';
import { jetBrainsMono, syne } from './fonts';
import { Providers } from './providers';

export const metadata = {
  title: 'Comnetish Provider Console',
  description: 'Provider management console for Comnetish'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${jetBrainsMono.variable} bg-background text-text-primary`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}