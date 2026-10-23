/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
          bg: '#121212',
          surface: '#202124',
          subtle: '#28292C',
          btn: '#3C4043',
          'btn-hover': '#474B4F',
          active: '#8AB4F8',
          danger: '#EA4335',
          'danger-hover': '#D93025',
        },
        dash: {
          pill: '#E9EEF6',
          submit: '#0B57D0',
          'submit-hover': '#0842A0',
        },
        dark: {
          bg: '#0B0F19',
          card: '#111827',
          surface: '#1E293B',
          border: '#334155'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0.0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.5), 0 0 20px rgba(59, 130, 246, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(99, 102, 241, 0.8), 0 0 40px rgba(99, 102, 241, 0.4)' },
        }
      }
    },
  },
  plugins: [],
}
