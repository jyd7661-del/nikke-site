/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        nikke: {
          bg: '#0b0e14',
          panel: '#131722',
          accent: '#5eead4',
          gold: '#f5c451',
        },
      },
    },
  },
  plugins: [],
};
