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
    },
  },
  plugins: [],
}