/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#090a0f',
          card: 'rgba(17, 18, 25, 0.65)',
          border: 'rgba(255, 255, 255, 0.06)',
          accent: '#10b981', // green-500 (Standard CAN)
          canopen: '#f59e0b', // amber-500 (CANopen)
          j1939: '#06b6d4', // cyan-500 (J1939)
          darker: '#06070a',
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 1.5s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 8px currentColor)' },
          '50%': { opacity: '0.4', filter: 'drop-shadow(0 0 2px currentColor)' },
        }
      }
    },
  },
  plugins: [],
}
