/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0d0d1f',
          800: '#12122a',
          700: '#1a1a35',
          600: '#22223f',
        },
        purple: {
          tile: '#4a2d7a',
          'tile-hover': '#5c3a94',
          'tile-safe': '#1a6b3c',
          'tile-bomb': '#7a1a1a',
          accent: '#7c3aed',
        },
      },
      animation: {
        'tile-flip': 'tileFlip 0.3s ease-out',
        'shake': 'shake 0.4s ease-in-out',
        'pulse-green': 'pulseGreen 0.5s ease-out',
      },
      keyframes: {
        tileFlip: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.85)' },
          '100%': { transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        pulseGreen: {
          '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.7)' },
          '100%': { boxShadow: '0 0 0 12px rgba(34, 197, 94, 0)' },
        },
      },
    },
  },
  plugins: [],
}
