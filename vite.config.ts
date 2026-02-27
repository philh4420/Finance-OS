import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const convexUrl = env.VITE_CONVEX_URL ? new URL(env.VITE_CONVEX_URL) : null
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL
    ? new URL(env.VITE_CONVEX_SITE_URL)
    : null

  const runtimeCaching = []

  if (convexUrl) {
    runtimeCaching.push({
      urlPattern: new RegExp(
        `^https://${escapeRegex(convexUrl.host)}/.*`,
        'i',
      ),
      handler: 'NetworkFirst' as const,
      options: {
        cacheName: 'convex-cloud',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 60 * 60 * 24,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    })
  }

  if (convexSiteUrl) {
    runtimeCaching.push({
      urlPattern: new RegExp(
        `^https://${escapeRegex(convexSiteUrl.host)}/.*`,
        'i',
      ),
      handler: 'NetworkFirst' as const,
      options: {
        cacheName: 'convex-site',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 60 * 60 * 24,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    })
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-maskable.svg'],
        manifest: {
          id: '/',
          name: 'Modern Finance Dashboard',
          short_name: 'FinanceDash',
          description:
            'A modern progressive finance dashboard for portfolio tracking, budgets, cash flow, and planning.',
          theme_color: '#08121c',
          background_color: '#050b12',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone'],
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          categories: ['finance', 'productivity', 'business'],
          lang: 'en-US',
          dir: 'ltr',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-maskable.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Portfolio',
              short_name: 'Portfolio',
              description: 'Open portfolio overview',
              url: '/?view=portfolio',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Transactions',
              short_name: 'Transactions',
              description: 'Review recent transactions',
              url: '/?view=transactions',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
          navigateFallbackDenylist: [/^\/api\//],
          importScripts: ['pwa-runtime.js'],
          runtimeCaching,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          enabled: true,
          suppressWarnings: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            clerk: ['@clerk/clerk-react'],
            convex: ['convex', 'convex/react', 'convex/react-clerk'],
            charts: ['recharts'],
            radix: ['radix-ui'],
            icons: ['lucide-react'],
            dates: ['date-fns'],
            ui: ['sonner', 'class-variance-authority', 'clsx', 'tailwind-merge'],
          },
        },
      },
    },
  }
})
