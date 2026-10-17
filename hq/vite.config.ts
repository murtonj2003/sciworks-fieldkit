/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // The demo set-up and sample bundles are read straight from shared/fixtures (outside hq/).
  assetsInclude: ['**/*.zip'],
  server: { fs: { allow: [repoRoot] } },
  // The Field app pins its own React at the repo root; make sure HQ and its libraries share ONE copy (HQ's).
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    react(),
    // Installable, and opens with no internet at base camp once installed.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon-64.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Fieldkit HQ',
        short_name: 'Fieldkit HQ',
        description: 'Base-camp data manager: import field bundles, review, export Darwin Core.',
        theme_color: '#FBFAFA',
        background_color: '#FBFAFA',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,zip,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
})
