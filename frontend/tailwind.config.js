/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['"Bricolage Grotesque"', '"Inter"', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Inter"', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        coral: {
          DEFAULT: '#ED6A4A',
          dark: '#C04A2E',
          light: '#F9D9CC',
        },
        lilac: {
          DEFAULT: '#C8B0DF',
          dark: '#7A5BA0',
        },
        lime: {
          DEFAULT: '#C9EE6F',
        },
        ink: {
          DEFAULT: '#1F1A22',
          60: 'rgba(31, 26, 34, 0.6)',
          40: 'rgba(31, 26, 34, 0.4)',
          15: 'rgba(31, 26, 34, 0.15)',
          8: 'rgba(31, 26, 34, 0.08)',
        },
        cream: '#F8F4ED',
        paper: '#FCFAF5',
        // back-compat — old names point at new palette
        brand: {
          DEFAULT: '#ED6A4A',
          dark: '#C04A2E',
          light: '#F9D9CC',
        },
        'brand-secondary': '#C8B0DF',
        'brand-accent': '#C9EE6F',
      },
      keyframes: {
        'snap-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(237, 106, 74, 0.6)' },
          '50%': { boxShadow: '0 0 0 6px rgba(237, 106, 74, 0)' },
        },
      },
      animation: {
        'snap-pulse': 'snap-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
