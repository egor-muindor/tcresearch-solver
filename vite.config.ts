import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: '/tcresearch-solver/v2/',
  publicDir: 'public',
  build: {
    outDir: '../v2',
    emptyOutDir: true,
    target: 'es2022',
  },
  worker: { format: 'es' },
});
