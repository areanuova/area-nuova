// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Cambia questo indirizzo con il tuo dominio definitivo (serve per SEO e sitemap).
  site: 'https://area-nuova.vercel.app',
  integrations: [tailwind(), sitemap()],
});
