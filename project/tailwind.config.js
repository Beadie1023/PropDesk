/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          950: '#06090f',
          900: '#0a0e17',
          850: '#0e131f',
          800: '#121826',
          750: '#161d2e',
          700: '#1c2436',
          600: '#283046',
          500: '#39435c',
        },
        accent: {
          50: '#ecfdf8',
          100: '#d1faec',
          200: '#a6f3d9',
          300: '#6ce7c0',
          400: '#34d3a0',
          500: '#10b98a',
          600: '#0d9477',
          700: '#0c7660',
          800: '#0b5d4d',
          900: '#0a4d40',
        },
        bull: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        bear: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
        warn: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        steel: {
          400: '#7c8aa5',
          500: '#5c6b87',
          600: '#475269',
        },
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(16,185,138,0.25), 0 0 24px -6px rgba(16,185,138,0.35)',
        'glow-warn': '0 0 0 1px rgba(245,158,11,0.3), 0 0 24px -6px rgba(245,158,11,0.4)',
        'glow-bear': '0 0 0 1px rgba(244,63,94,0.35), 0 0 24px -6px rgba(244,63,94,0.5)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        pulseSoft: 'pulseSoft 2.2s ease-in-out infinite',
        slideIn: 'slideIn 0.25s ease-out',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
