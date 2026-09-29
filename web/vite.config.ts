import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/; the Pages workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'Yoto Local',
        short_name: 'Yoto Local',
        description: 'Download YouTube playlists to your computer and send them to Yoto cards.',
        start_url: base,
        scope: base,
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        background_color: '#07271f',
        theme_color: '#07271f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // The companion (127.0.0.1) and Yoto APIs are cross-origin and never cached.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' }
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ]
})
