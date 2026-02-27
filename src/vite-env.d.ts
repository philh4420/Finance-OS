/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_CLERK_FRONTEND_API_URL?: string
  readonly VITE_CONVEX_URL?: string
  readonly VITE_CONVEX_SITE_URL?: string
  readonly VITE_CLIENT_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
