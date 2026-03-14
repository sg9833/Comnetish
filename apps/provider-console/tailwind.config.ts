import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#00FFC2',
          secondary: '#7B61FF',
          warning: '#FF6B35'
        },
        background: '#0D1117',
        surface: '#1C2128',
        text: {
          primary: '#E6EDF3',
          muted: '#8B949E'
        }
      },
      fontFamily: {
        display: ['var(--font-syne)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      boxShadow: {
        'brand-primary': '0 0 28px rgba(0, 255, 194, 0.28)',
        'brand-secondary': '0 0 24px rgba(123, 97, 255, 0.24)',
        surface: '0 10px 30px rgba(0, 0, 0, 0.35)'
      },
      backgroundImage: {
        'surface-gradient': 'linear-gradient(180deg, rgba(28,33,40,0.88), rgba(13,17,23,0.96))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))'
      }
    }
  },
  plugins: []
};

export default config;
