import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { brand } from './src/config/brand';

export default defineConfig({
  plugins: [react(), {
    name: 'market-brand-title',
    transformIndexHtml: (html) => html.replace(/<title>.*?<\/title>/, `<title>${brand.name} Operations</title>`),
  }],
  build: {
    // Never inline fonts/assets as data: URIs - the production CSP only allows font-src 'self'.
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000
  }
});
