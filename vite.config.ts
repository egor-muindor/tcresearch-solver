import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: '/tcresearch-solver/',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  worker: { format: 'es' },
});
