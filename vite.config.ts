import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { NAV_FALLBACK_DENYLIST } from './pwa-denylist.ts'
import { defineConfig } from 'vitest/config'

const network = { host: '127.0.0.1', port: 8888, strictPort: true }

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      manifest: {
        name: 'Spotifier',
        short_name: 'Spotifier',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        start_url: '/',
        lang: 'fr',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell uniquement ; aucun runtimeCaching : api.spotify.com,
        // accounts.spotify.com et ws.audioscrobbler.com passent toujours au réseau.
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',
        // Denylist ancrée sur le pathname (workbox teste pathname + search) : sw.js, manifest et icônes sont exclus, /callback?code=abc.def reçoit l'app shell.
        navigateFallbackDenylist: [NAV_FALLBACK_DENYLIST],
      },
    }),
  ],
  server: network,
  preview: network,
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
})
