import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  site: 'https://keiba-data-shared.netlify.app/',
  output: 'server',
  adapter: netlify(),
  server: {
    port: 4322
  }
});
