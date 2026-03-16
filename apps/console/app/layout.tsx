import './globals.css';
import '@rainbow-me/rainbowkit/styles.css';
import type { ReactNode } from 'react';
import { ConsoleShell } from './console-shell';
import { jetBrainsMono, syne } from './fonts';
import { Providers } from './providers';

export const metadata = {
  title: 'Comnetish Console',
  description: 'Decentralized cloud compute marketplace console'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${jetBrainsMono.variable}`}>
        <Providers>
          <ConsoleShell>{children}</ConsoleShell>
        </Providers>
      </body>
    </html>
  );
}