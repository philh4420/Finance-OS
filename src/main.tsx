import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient } from 'convex/react'
import { Toaster } from 'sonner'

import App from '@/App'
import { appEnv, missingClientEnv } from '@/env'
import { PwaReliabilityProvider } from '@/components/pwa/pwa-reliability-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import './index.css'

if (!document.documentElement.classList.contains('dark')) {
  document.documentElement.classList.add('dark')
}

const convex =
  appEnv.convexUrl ? new ConvexReactClient(appEnv.convexUrl) : null

function Root() {
  const clerkPublishableKey = appEnv.clerkPublishableKey

  if (missingClientEnv.length || !convex || !clerkPublishableKey) {
    return (
      <AppShell>
        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="pointer-events-none absolute inset-0">
            <div className="finance-grid absolute inset-0 opacity-80" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(78,197,255,0.16),transparent_55%),radial-gradient(circle_at_85%_15%,rgba(76,255,211,0.12),transparent_60%)]" />
          </div>
          <Card className="finance-panel relative w-full max-w-2xl border-white/10 bg-white/4 shadow-none">
            <CardHeader>
              <CardTitle>Client environment configuration required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                The app needs Clerk and Convex client env variables before it can boot the secure
                dashboard.
              </p>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-white/70 uppercase">
                  Missing variables
                </p>
                <ul className="list-inside list-disc space-y-1 font-mono text-xs">
                  {missingClientEnv.length ? (
                    missingClientEnv.map((key) => <li key={key}>{key}</li>)
                  ) : (
                    <li>VITE_CONVEX_URL</li>
                  )}
                </ul>
              </div>
              <p className="text-muted-foreground text-xs">
                A `.env.local` file is included in this workspace with the values you provided. If
                you just added it, restart the Vite dev server.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        appearance={{
          baseTheme: undefined,
          variables: {
            colorPrimary: '#11a4ff',
            colorBackground: '#050b12',
            colorInputBackground: '#0a1420',
            colorText: '#eaf4ff',
          },
          elements: {
            card: 'shadow-none border border-white/10 bg-[#08121c]/95 backdrop-blur-xl',
            navbar: 'hidden',
          },
        }}
        afterSignOutUrl="/"
      >
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <PwaReliabilityProvider>
            <App />
          </PwaReliabilityProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </AppShell>
  )
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <TooltipProvider>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </StrictMode>
  )
}

createRoot(document.getElementById('root')!).render(
  <Root />,
)
