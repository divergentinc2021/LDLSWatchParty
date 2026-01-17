import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  publicDir: '../static',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      '/src': '../src'
    }
  }
});
