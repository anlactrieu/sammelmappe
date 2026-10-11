import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { execFile } from 'node:child_process'
import type { Plugin } from 'vite'

/** Dev-/Preview-Server: POST /api/refresh-catalog startet scripts/build-catalog.mjs (höchstens 1× pro Tag aktualisiert, siehe Skript). */
const catalogRefresh = (): Plugin => {
  let running = false
  const handler = (req: { method?: string }, res: import('node:http').ServerResponse) => {
    res.setHeader('content-type', 'application/json')
    if (req.method !== 'POST') { res.statusCode = 405; return res.end('{}') }
    if (running) return res.end(JSON.stringify({ ok: false, out: 'läuft bereits' }))
    running = true
    execFile('node', ['scripts/build-catalog.mjs'], { cwd: process.cwd(), timeout: 5 * 60e3 }, (err, stdout, stderr) => {
      running = false
      res.end(JSON.stringify({ ok: !err, out: (stdout || stderr).trim() }))
    })
  }
  return { name: 'catalog-refresh', configureServer: (s) => { s.middlewares.use('/api/refresh-catalog', handler) }, configurePreviewServer: (s) => { s.middlewares.use('/api/refresh-catalog', handler) } }
}
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    catalogRefresh(),
    ...(process.env.HTTPS ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sammelmappe – Pokémon Sammlung',
        short_name: 'Sammelmappe',
        description: 'Deutsche Pokémon-Karten und Produkte scannen, sammeln und den Marktwert tracken.',
        lang: 'de', theme_color: '#2b2d6e', background_color: '#fbf6ee', display: 'standalone',
        start_url: './', scope: './', icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,json,png}'],
        globIgnores: ['**/catalog.json', '**/custom-products.json', '**/catalog-emb.*', '**/cards-emb.*', '**/ort-wasm*'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /ort-wasm.*\.(wasm|mjs)$/, handler: 'CacheFirst', options: { cacheName: 'imagesearch', expiration: { maxEntries: 4 }, cacheableResponse: { statuses: [200] } } },
          // Karten-Index (groß): zuerst aus dem Cache, im Hintergrund prüfen
          { urlPattern: /cards-emb\.(bin|json)$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'cards-index', cacheableResponse: { statuses: [200] } } },
          // Index und eigene Produktliste ändern sich täglich: Netz zuerst, Cache nur offline
          { urlPattern: /(catalog-emb\.(bin|json)|custom-products\.json|\/custom\/.*)$/, handler: 'NetworkFirst', options: { cacheName: 'catalog-data', networkTimeoutSeconds: 6, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs[\w.-]*\.(hf|huggingface)\.co|[\w-]+\.hf\.co)\/.*/, handler: 'CacheFirst', options: { cacheName: 'models', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /\/catalog\.json$/, handler: 'NetworkFirst', options: { cacheName: 'catalog', networkTimeoutSeconds: 5 } },
          { urlPattern: /^https:\/\/assets\.tcgdex\.net\/.*/, handler: 'CacheFirst',
            options: { cacheName: 'card-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com)\/.*/, handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 180 }, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } } },
          { urlPattern: /^https:\/\/api\.tcgdex\.net\/.*/, handler: 'NetworkFirst',
            options: { cacheName: 'tcgdex-api', networkTimeoutSeconds: 6, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 } } },
        ],
      },
    }),
  ],
  test: { environment: 'node', setupFiles: ['./src/test-setup.ts'] },
})
