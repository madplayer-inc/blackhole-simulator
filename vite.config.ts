import { defineConfig } from 'vite';

// relative base so the build works at any sub-path (e.g. GitHub Pages /<repo>/)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
