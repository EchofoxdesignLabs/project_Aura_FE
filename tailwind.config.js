/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Project Aura Pastel Palette (Example)
        aura: {
          bg: '#FDF6E3',
          primary: '#268BD2',
          accent: '#D33682',
        }
      }
    },
  },
  plugins: [],
}