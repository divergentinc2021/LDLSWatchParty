import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'public',
  publicDir: false,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          peerjs: ['peerjs']
        }
      }
    },
    assetsInlineLimit: 0
  },
  server: {
    port: 3000,
    open: true
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/node_modules/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.peerjs\.com\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    }),
    // Copy static files that need fixed paths (not hashed)
    {
      name: 'copy-static-files',
      closeBundle() {
        const publicDir = resolve(__dirname, 'public');
        const distDir = resolve(__dirname, 'dist');
        
        // Root files
        ['_redirects', '_headers', 'manifest.json', 'robots.txt'].forEach(file => {
          const src = resolve(publicDir, file);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distDir, file));
            console.log(`✓ Copied: ${file}`);
          }
        });
        
        // Icons directory
        const iconsDistDir = resolve(distDir, 'icons');
        if (!existsSync(iconsDistDir)) mkdirSync(iconsDistDir, { recursive: true });
        
        const icons = [
          'icon.svg', 'icon-72.png', 'icon-96.png', 'icon-128.png',
          'icon-144.png', 'icon-152.png', 'icon-192.png', 'icon-384.png',
          'icon-512.png', 'favicon-32.png', 'apple-touch-icon.png', 'favicon.png'
        ];
        
        icons.forEach(file => {
          const src = resolve(publicDir, 'icons', file);
          if (existsSync(src)) {
            copyFileSync(src, resolve(iconsDistDir, file));
            console.log(`✓ Copied: icons/${file}`);
          }
        });
      }
    }
  ]
});
