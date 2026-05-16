/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // This covers all your React components
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Figtree"', 'sans-serif'],
        serif: ['"DM Serif Text"', 'serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#607196',
          dark: '#4a5a7a',
          light: '#7d8fad',
        },
        'brand-secondary': '#e8e9ed',
        'brand-accent': '#ffc759',
      },
      keyframes: {
        'snap-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 199, 89, 0.6)' },
          '50%': { boxShadow: '0 0 0 6px rgba(255, 199, 89, 0)' },
        },
      },
      animation: {
        'snap-pulse': 'snap-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}