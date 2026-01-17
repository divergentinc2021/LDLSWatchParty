import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Code splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate PeerJS into its own chunk (lazy loaded anyway)
          peerjs: ['peerjs']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // We register SW manually in app.js
      manifest: false, // Use existing manifest.json
      workbox: {
        // Don't precache everything - use runtime caching
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Skip external resources
        globIgnores: ['**/node_modules/**'],
        // Runtime caching strategies
        runtimeCaching: [
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Font files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // PeerJS cloud server - network only (real-time)
            urlPattern: /^https:\/\/.*\.peerjs\.com\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            // Google Apps Script API - network first
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ]
});
