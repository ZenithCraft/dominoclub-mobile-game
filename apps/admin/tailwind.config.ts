import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#4ade80',
        gold: '#facc15',
        'bg-dark': '#0a1f0a',
        'bg-card': '#0f2e0f',
      },
    },
  },
  plugins: [],
};

export default config;
