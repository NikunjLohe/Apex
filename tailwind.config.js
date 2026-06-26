/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0A0F1E',
          1: '#0A0F1E',
          2: '#111827',
          3: '#1A2235',
          4: '#232D42',
        },
        gold: {
          DEFAULT: '#C9980A',
          1: '#C9980A',
          2: '#E8B84B',
        },
        ink: {
          DEFAULT: '#F0F4FF',
          1: '#F0F4FF',
          2: '#94A3B8',
        },
        ok: '#10B981',
        danger: '#EF4444',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
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
