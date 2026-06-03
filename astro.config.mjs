// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  // Cambia questo indirizzo con il tuo dominio definitivo (serve per SEO e sitemap).
  site: 'https://www.areanuova.it',
  integrations: [tailwind()],
});
