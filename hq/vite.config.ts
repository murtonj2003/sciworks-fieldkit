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
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Sciworks HQ',
        short_name: 'HQ',
        description: 'Base-camp data manager: import field bundles, review, export Darwin Core.',
        theme_color: '#1f2a24',
        background_color: '#f4f2ec',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
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
