/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./docs/index.html",
    "./docs/new_ux.html",
    "./src/viewer/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: 'var(--t-bg)',
          surface: 'var(--t-surface)',
          'surface-hover': 'var(--t-surface-hover)',
          border: 'var(--t-border)',
          text: 'var(--t-text)',
          sub: 'var(--t-text-sub)',
          muted: 'var(--t-text-muted)',
          accent: 'var(--t-accent)',
          'thumb-bg': 'var(--t-thumb-bg)',
        }
      }
    },
  },
  plugins: [],
}
