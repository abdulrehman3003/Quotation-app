/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617', // Pitch black dark slate
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6', // Primary Electric Blue
          600: '#2563eb', // Hover state
          700: '#1d4ed8',
          400: '#60a5fa',
        }
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(59, 130, 246, 0.15)',
        'glow-md': '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-lg': '0 0 30px rgba(59, 130, 246, 0.5)',
      }
    },
  },
  plugins: [],
}
