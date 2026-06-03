import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        // Blu istituzionale Area Nuova (estratto dal logo: #003c78)
        primary: {
          50: '#f0f3f7',
          100: '#dee6ed',
          200: '#bdccdc',
          300: '#8ca7c2',
          400: '#577ea6',
          500: '#295b8e',
          600: '#124a81',
          700: '#003c78',
          800: '#003060',
          900: '#002448',
          950: '#00172e',
        },
        // Verde/turchese Area Nuova (estratto dal logo: #009c78)
        accent: {
          50: '#f0f9f7',
          100: '#def2ed',
          200: '#bde5dc',
          300: '#8cd2c2',
          400: '#57bea6',
          500: '#29ac8e',
          600: '#12a381',
          700: '#009c78',
          800: '#007d60',
          900: '#005e48',
          950: '#003b2e',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      maxWidth: {
        container: '1200px',
      },
    },
  },
  plugins: [typography],
};
