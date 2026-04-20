import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        background:      'hsl(var(--background))',
        foreground:      'hsl(var(--foreground))',
        card:            'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        border:          'hsl(var(--border))',
        input:           'hsl(var(--input))',
        ring:            'hsl(var(--ring))',
        muted:           'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent: {
          50:  '#f0f4f8',
          100: '#d9e6f0',
          200: '#b3cde1',
          300: '#8db4d2',
          400: '#6B8CAE',
          500: '#4d6f8f',
          600: '#3d5a75',
          700: '#2e445a',
          800: '#1f2f40',
          900: '#101a26',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config
