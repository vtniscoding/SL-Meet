/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../packages/shared/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5CA0F2',
          primary: '#5CA0F2',
          hover: '#4A8FE0',
          active: '#3B7ECE',
          subtle: '#EBF3FD',
        },
        room: {
          bg: '#000000',
          surface: '#202124',
          subtle: '#28292C',
          btn: '#3C4043',
          'btn-hover': '#474B4F',
          active: '#8AB4F8',
          danger: '#EA4335',
          'danger-hover': '#D93025',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

