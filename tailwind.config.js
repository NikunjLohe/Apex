/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#FAF8F5',
          1: '#FAF8F5',
          2: '#F4EFEA',
          3: '#FFFFFF',
          4: '#EBE6DC',
        },
        gold: {
          DEFAULT: '#8D7952',
          1: '#132E22',
          2: '#1D4634',
          tan: '#8D7952',
        },
        ink: {
          DEFAULT: '#16221F',
          1: '#16221F',
          2: '#667873',
        },
        ok: '#1D4634',
        danger: '#A83B3B',
        info: '#2E5E4E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '10px',
      },
      boxShadow: {
        card: '0 8px 28px -12px rgba(0,0,0,0.6)',
        gold: '0 0 0 1px rgba(201,152,10,0.4)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
}
