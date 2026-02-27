const clean = (value?: string | null) => value?.trim() || undefined

export const appEnv = {
  clerkPublishableKey: clean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY),
  clerkFrontendApiUrl: clean(import.meta.env.VITE_CLERK_FRONTEND_API_URL),
  convexUrl: clean(import.meta.env.VITE_CONVEX_URL),
  convexSiteUrl: clean(import.meta.env.VITE_CONVEX_SITE_URL),
  clientOrigin: clean(import.meta.env.VITE_CLIENT_ORIGIN),
}

export const missingClientEnv = [
  !appEnv.clerkPublishableKey && 'VITE_CLERK_PUBLISHABLE_KEY',
  !appEnv.convexUrl && 'VITE_CONVEX_URL',
].filter(Boolean) as string[]
