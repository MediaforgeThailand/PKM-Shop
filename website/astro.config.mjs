import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://mira-landing.vercel.app',
  // emit /landingpage.html (not /landingpage/index.html) so Vercel cleanUrls
  // resolves /landingpage cleanly without trailing-slash redirects
  build: {
    format: 'file',
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [sitemap()],
});
