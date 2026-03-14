import { JetBrains_Mono, Syne } from 'next/font/google';

export const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  display: 'swap'
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap'
});
