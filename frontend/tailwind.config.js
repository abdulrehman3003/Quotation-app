/** @type {import('tailwindcss').Config} */

// One accent. `brand`, `indigo` and `blue` all resolve to the same scale so the
// interface never shows two competing blues.
const accent = {
  50: '#eef1fd',
  100: '#dfe4fb',
  200: '#c2cbf7',
  300: '#9ba8f0',
  400: '#8090ec',
  500: '#5b6ee1',
  600: '#4a5bd0',
  700: '#3d4bb0',
  800: '#333e8c',
  900: '#2a3270',
  950: '#1a1f45',
}

// One positive colour, shared by `emerald` and `green`.
const positive = {
  50: '#edf8f1',
  100: '#d5efdf',
  200: '#aedfc2',
  300: '#84cfa4',
  400: '#56b783',
  500: '#339c67',
  600: '#288054',
  700: '#216645',
  800: '#1c5139',
  900: '#173f2e',
  950: '#0d241a',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Neutral graphite ramp (replaces the blue-tinted default slate).
        slate: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d9dce3',
          300: '#b4b9c4',
          400: '#8d93a0',
          500: '#727885',
          600: '#4a4f5a',
          700: '#33373f',
          750: '#2b2e35',
          800: '#24272d',
          850: '#1c1e23',
          900: '#16181c',
          950: '#0f1013',
        },
        brand: accent,
        indigo: accent,
        blue: accent,
        emerald: positive,
        green: positive,
      },
      boxShadow: {
        popover: '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)',
      },
    },
  },
  plugins: [],
}
