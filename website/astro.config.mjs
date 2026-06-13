import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://mira.mediaforge.co',
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
