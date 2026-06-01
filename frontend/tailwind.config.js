/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Цвета СБЕР ВариантУм (как в VariantUm/CLAUDE.md)
        brand: {
          50:  '#f0faf1',
          100: '#d5f0d9',
          200: '#aadeb1',
          500: '#22A139',
          600: '#22A139',
          700: '#1a7f2d',
          800: '#155f22',
          900: '#0e3f17',
        },
      },
      fontFamily: {
        sans: ["'Littera Plain'", 'Inter', 'system-ui', 'sans-serif'],
        littera: ["'Littera Plain'", 'sans-serif'],
      },
      keyframes: {
        fadeSlideUp: {
          '0%':   { opacity: '0', transform: 'translateX(-50%) translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
      },
      animation: {
        'fade-slide-up': 'fadeSlideUp 0.22s ease-out both',
      },
    },
  },
  plugins: [],
};
