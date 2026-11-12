// Tokens live in src/styles/tokens.css as CSS variables; Tailwind exposes them as utilities.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        paper: 'var(--paper)',
        acid: 'var(--acid)',
        cobalt: 'var(--cobalt)',
        steel: 'var(--steel)',
        signal: 'var(--signal)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};
