import { lazy, Suspense } from 'react'
import {
  ClerkLoaded,
  ClerkLoading,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
} from '@clerk/clerk-react'
import { useQuery } from 'convex/react'
import {
  ArrowRight,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Database,
  Download,
  Globe,
  Lock,
  LoaderCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { api } from '../convex/_generated/api'

import { PwaUpdateNotifier, usePwaInstallPrompt } from '@/components/pwa/pwa-status'
import { createCurrencyFormatters, safeLocale } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const FinanceDashboard = lazy(async () => {
  const module = await import('@/components/dashboard/finance-dashboard')
  return { default: module.FinanceDashboard }
})

function App() {
  const { canInstall, isInstalling, promptInstall } = usePwaInstallPrompt()

  return (
    <>
      <PwaUpdateNotifier />

      <ClerkLoading>
        <div className="flex min-h-screen items-center justify-center px-6">
          <Card className="w-full max-w-md border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
            <CardContent className="flex items-center gap-3 p-6">
              <LoaderCircle className="text-primary h-5 w-5 animate-spin" />
              <div>
                <p className="text-sm font-medium">Loading secure workspace</p>
                <p className="text-muted-foreground text-xs">
                  Initializing Clerk session and finance dashboard shell...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </ClerkLoading>

      <ClerkLoaded>
        <SignedOut>
          <SignedOutLanding
            canInstallPwa={canInstall}
            isInstallingPwa={isInstalling}
            onInstallPwa={promptInstall}
          />
        </SignedOut>

        <SignedIn>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center px-6">
                <Card className="w-full max-w-md border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
                  <CardContent className="flex items-center gap-3 p-6">
                    <LoaderCircle className="text-primary h-5 w-5 animate-spin" />
                    <div>
                      <p className="text-sm font-medium">Loading dashboard module</p>
                      <p className="text-muted-foreground text-xs">
                        Preparing charts, tables, and workspace panels...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            }
          >
            <FinanceDashboard
              canInstallPwa={canInstall}
              isInstallingPwa={isInstalling}
              onInstallPwa={promptInstall}
            />
          </Suspense>
        </SignedIn>
      </ClerkLoaded>
    </>
  )
}

function SignedOutLanding({
  canInstallPwa,
  isInstallingPwa,
  onInstallPwa,
}: {
  canInstallPwa: boolean
  isInstallingPwa: boolean
  onInstallPwa: () => Promise<boolean>
}) {
  const browserLocale =
    typeof navigator !== 'undefined' ? safeLocale(navigator.language) : 'en-US'
  const landingPreview = useQuery(api.dashboard.getDashboard, {
    locale: browserLocale,
  })
  const previewMeta = landingPreview?.meta
  const previewData = landingPreview?.data
  const previewUnavailable = landingPreview === null
  const previewCurrency = previewMeta?.displayCurrency ?? 'USD'
  const previewLocale = previewMeta?.locale ?? browserLocale
  const previewNetWorthRaw = previewData
    ? previewData.summary.totalAssets - previewData.summary.liabilities
    : undefined
  const previewRunwayMonths = previewData?.summary.monthlyExpenses
    ? previewData.summary.liquidCash / previewData.summary.monthlyExpenses
    : undefined
  const previewCurrencyCount = previewMeta?.availableCurrencies.length
  const previewFormatters = createCurrencyFormatters(previewLocale, previewCurrency)
  const previewCompact = previewNetWorthRaw
    ? previewFormatters.compactCurrency.format(previewNetWorthRaw)
    : previewUnavailable
      ? 'Sign in'
      : 'Loading'
  const previewWhole = previewNetWorthRaw
    ? previewFormatters.wholeCurrency.format(previewNetWorthRaw)
    : previewUnavailable
      ? 'Sign in'
      : 'Loading'
  const previewRunwayLabel =
    previewRunwayMonths !== undefined
      ? `${previewRunwayMonths.toFixed(1)} mo`
      : previewUnavailable
        ? 'Sign in'
        : 'Loading'
  const previewRunwayDelta =
    previewRunwayMonths !== undefined
      ? `${previewRunwayMonths >= 6 ? 'Healthy' : 'Watch'} buffer`
      : previewUnavailable
        ? 'Sign in to load live data'
        : 'Waiting for Convex'
  const displayExamples = [
    ['USD', 'en-US'],
    ['JPY', 'ja-JP'],
    ['EUR', 'de-DE'],
  ].map(([currency, locale]) => ({
    currency,
    locale,
      formatted:
      previewNetWorthRaw !== undefined
        ? createCurrencyFormatters(locale, currency).wholeCurrency.format(previewNetWorthRaw)
        : previewUnavailable
          ? 'Sign in'
          : 'Loading',
  }))

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_8%,rgba(76,190,255,0.24),transparent_48%),radial-gradient(circle_at_88%_6%,rgba(83,255,206,0.18),transparent_54%),radial-gradient(circle_at_55%_28%,rgba(255,255,255,0.06),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
        <div className="finance-grid absolute inset-0 opacity-70" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="finance-panel sticky top-4 z-30 flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="from-primary via-chart-2 to-chart-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br shadow-[0_10px_30px_rgba(17,164,255,0.25)]">
              <BriefcaseBusiness className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="finance-display text-sm text-foreground">Finance OS</p>
              <p className="text-muted-foreground text-xs">Modern finance command center PWA</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <a href="#features" className="text-sm text-muted-foreground transition hover:text-foreground">
              Features
            </a>
            <a href="#security" className="text-sm text-muted-foreground transition hover:text-foreground">
              Security
            </a>
            <a href="#free-access" className="text-sm text-muted-foreground transition hover:text-foreground">
              Free access
            </a>
          </div>

          <div className="flex items-center gap-2">
            {canInstallPwa ? (
              <Button size="sm" variant="outline" onClick={() => void onInstallPwa()}>
                <Download className="h-4 w-4" />
                {isInstallingPwa ? 'Installing...' : 'Install'}
              </Button>
            ) : null}
            <SignInButton mode="modal">
              <Button size="sm" variant="outline">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">
                Sign up
                <ArrowRight className="h-4 w-4" />
              </Button>
            </SignUpButton>
          </div>
        </header>

        <main className="flex-1 py-6 sm:py-8">
          <section className="grid items-start gap-6 lg:grid-cols-[1.03fr_0.97fr]">
            <div className="space-y-5">
              <Badge variant="outline" className="border-border/70 bg-card/45 px-3 py-1">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Start here before entering the app
              </Badge>

              <div className="space-y-4">
                <h1 className="finance-display text-4xl leading-[0.95] text-white sm:text-5xl lg:text-6xl">
                  Personal Finance OS with real-time control, planning, and governance.
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                  Sign up or sign in to access a secure, installable finance dashboard built for
                  2026+ money operations. Multi-currency ready, Convex-backed, and designed for
                  daily decisions, payday windows, and month-close confidence.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <SignUpButton mode="modal">
                  <Button size="lg" className="shadow-[0_14px_48px_rgba(17,164,255,0.28)]">
                    Create account
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <Button size="lg" variant="outline">
                    Sign in to workspace
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </SignInButton>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FeatureMini
                  icon={ShieldCheck}
                  title="Trust + security"
                  subtitle="Security Trust Pack, governance controls, and auditability"
                />
                <FeatureMini
                  icon={ChartNoAxesCombined}
                  title="Realtime finance state"
                  subtitle="Live Convex workspace across dashboard, planning, and automation"
                />
                <FeatureMini
                  icon={Globe}
                  title="Global currency"
                  subtitle="World-currency catalog with Intl-aware display and FX snapshots"
                />
              </div>

              <div className="finance-panel grid gap-4 p-4 sm:grid-cols-3">
                <TrustItem label="Installable PWA" value="Realtime updates + offline queue" icon={Smartphone} />
                <TrustItem label="Security posture" value="TLS/AES controls + audit trails" icon={Lock} />
                <TrustItem label="Setup speed" value="< 5 min to first finance record" icon={Clock3} />
              </div>
            </div>

            <section className="grid gap-4">
              <Card className="finance-panel border-border/70 bg-card/45 shadow-none">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Live app preview</CardTitle>
                      <CardDescription>
                        Users authenticate first, then enter the finance dashboard.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-card/65">
                      Start page
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <PreviewTile
                      label="Net worth"
                      value={previewCompact}
                      delta={landingPreview ? 'Live Convex snapshot' : 'Loading from Convex'}
                    />
                    <PreviewTile
                      label="Runway"
                      value={previewRunwayLabel}
                      delta={previewRunwayDelta}
                    />
                    <PreviewTile
                      label="Currencies"
                      value={previewCurrencyCount?.toString() ?? '...'}
                      delta="Convex currency catalog"
                    />
                    <PreviewTile label="PWA" value="Installable" delta="Offline shell" />
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/65 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium">Portfolio trajectory</p>
                      <Badge variant="outline" className="border-border/70 bg-transparent">
                        Convex-backed UI
                      </Badge>
                    </div>
                    <div className="h-36 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-2">
                      <svg viewBox="0 0 420 120" className="h-full w-full">
                        <defs>
                          <linearGradient id="previewLine" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(70,197,255,0.95)" />
                            <stop offset="100%" stopColor="rgba(70,197,255,0.12)" />
                          </linearGradient>
                          <linearGradient id="previewBar" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgba(56,232,201,0.95)" />
                            <stop offset="100%" stopColor="rgba(56,232,201,0.12)" />
                          </linearGradient>
                        </defs>
                        <g opacity="0.16">
                          <path d="M0 20H420" stroke="white" />
                          <path d="M0 50H420" stroke="white" />
                          <path d="M0 80H420" stroke="white" />
                          <path d="M0 110H420" stroke="white" />
                        </g>
                        <rect x="18" y="70" width="18" height="40" rx="4" fill="url(#previewBar)" />
                        <rect x="44" y="58" width="18" height="52" rx="4" fill="url(#previewBar)" />
                        <rect x="70" y="64" width="18" height="46" rx="4" fill="url(#previewBar)" />
                        <rect x="96" y="46" width="18" height="64" rx="4" fill="url(#previewBar)" />
                        <path
                          d="M8 94 C 56 96, 60 76, 96 78 S 160 58, 196 60 S 248 44, 288 49 S 348 36, 410 18"
                          fill="none"
                          stroke="url(#previewLine)"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <path
                          d="M8 94 C 56 96, 60 76, 96 78 S 160 58, 196 60 S 248 44, 288 49 S 348 36, 410 18 L 410 118 L 8 118 Z"
                          fill="url(#previewLine)"
                          opacity="0.18"
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="finance-panel rounded-2xl border-border/60 bg-card/30 p-3">
                    <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      What happens next
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <FlowStep index="1" title="Create account" subtitle="Use Clerk sign-up modal" />
                      <FlowStep index="2" title="Secure session" subtitle="Auth initializes Convex client" />
                      <FlowStep index="3" title="Enter dashboard" subtitle="Live finance workspace loads" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </section>

          <section id="features" className="mt-8 space-y-4">
            <SectionHeading
              eyebrow="Features"
              title="Everything included in the free Finance OS"
              subtitle="A modern start page and authenticated finance workspace built as a complete product, not a template."
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FeatureCard
                icon={Wallet}
                title="Today + runway operations"
                description="Actionable due items, runway and obligations, and payday-to-payday cashflow windows."
              />
              <FeatureCard
                icon={CreditCard}
                title="Connected finance modules"
                description="Accounts, income, bills, cards, loans, shopping, and transactions stay in sync."
              />
              <FeatureCard
                icon={Globe}
                title="World-currency support"
                description="Display-currency preferences, native amounts, and currency-safe reporting."
              />
              <FeatureCard
                icon={Database}
                title="Posted ledger history"
                description="Real purchase posting pipeline with categories, split templates, and ledger lines."
              />
              <FeatureCard
                icon={ShieldCheck}
                title="Planning and scenarios"
                description="Normal/Tight/Recovery month planning, goals, forecast messaging, and fragility views."
              />
              <FeatureCard
                icon={ChartNoAxesCombined}
                title="Automation and rhythm"
                description="Daily, weekly, payday, and month-close operating rhythm with smart suggestions."
              />
              <FeatureCard
                icon={Lock}
                title="Governance and trust"
                description="Exports, privacy controls, retention/deletion jobs, audit trails, and trust pack controls."
              />
              <FeatureCard
                icon={Smartphone}
                title="PWA reliability + mobile"
                description="Thumb mode, errand flows, low-signal queueing, and in-app update notifications."
              />
              <FeatureCard
                icon={Download}
                title="Premium report output"
                description="Professional print modes, audience presets, variance commentary, and decisions section."
              />
              <FeatureCard
                icon={BriefcaseBusiness}
                title="Single source of truth"
                description="Clear Posted/Scheduled/Planned/Estimated policy with confidence indicators on KPIs."
              />
              <FeatureCard
                icon={Check}
                title="Audit-first mutations"
                description="Ownership checks, mutation auditing, and timezone-aware financial workflows."
              />
              <FeatureCard
                icon={ChevronRight}
                title="No demo data path"
                description="Fresh accounts enter the real dashboard directly with Convex-backed empty states."
              />
            </div>
          </section>

          <section id="security" className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="finance-panel border-border/70 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Security and platform confidence</CardTitle>
                <CardDescription>
                  The landing page is the default start route and keeps unauthenticated users out of
                  the main app until they sign in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ChecklistRow text="Signed-out users see the landing page and auth CTAs first" />
                <ChecklistRow text="Signed-in users go directly to the dashboard experience" />
                <ChecklistRow text="Clerk modal sign-up / sign-in flows are available in header and hero" />
                <ChecklistRow text="PWA install call-to-action remains available on supported devices" />
                <ChecklistRow text="Convex-backed app data only loads after authenticated app shell renders" />
                <ChecklistRow text="In-app updates are surfaced with release details before refresh" />
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/70 bg-card/45 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Global-ready by default</CardTitle>
                <CardDescription>
                  Currency formatting and display preferences built for international teams.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <PreviewTile
                    label="Catalog"
                    value={previewCurrencyCount?.toString() ?? '...'}
                    delta="Seeded currencies"
                  />
                  <PreviewTile label="FX mode" value="Server-side" delta="Converted snapshots" />
                  <PreviewTile label="Formatting" value="Intl" delta="Locale-aware money" />
                  <PreviewTile label="Preference" value="Per user" delta="Convex persisted" />
                </div>
                <Separator className="bg-card/65" />
                <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="text-sm font-medium">Display currency examples</p>
                  <div className="mt-2 grid gap-2 text-xs text-muted-foreground">
                    {displayExamples.map((example) => (
                      <div key={`${example.currency}-${example.locale}`} className="flex items-center justify-between">
                        <span>
                          {example.currency} ({example.locale})
                        </span>
                        <span className="finance-display">{example.formatted}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="free-access" className="mt-8 space-y-4">
            <SectionHeading
              eyebrow="Free Access"
              title="Free to use right now"
              subtitle="All workspace capabilities are currently available with no pricing tiers on the landing page."
            />
            <Card className="finance-panel border-border/70 bg-card/35 shadow-none">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Free plan currently active</p>
                  <p className="text-sm text-muted-foreground">
                    Sign up to access all current features: finance tabs, planning, governance,
                    reporting, mobile PWA, and live Convex sync.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SignUpButton mode="modal">
                    <Button>
                      Create free account
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </SignUpButton>
                  <SignInButton mode="modal">
                    <Button variant="outline">Sign in</Button>
                  </SignInButton>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-8">
            <Card className="finance-panel border-primary/20 bg-primary/8 shadow-none">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="finance-display text-xl text-white">
                    Start on the landing page. Enter the app only after authentication.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {landingPreview
                      ? `Live preview currency: ${previewCurrency} · net worth ${previewWhole}`
                      : 'Live preview loads real Convex data after sign-in. No demo data is shown on the landing page.'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This route is now your modern front door with sign-up and sign-in flows.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SignUpButton mode="modal">
                    <Button>
                      Sign up
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </SignUpButton>
                  <SignInButton mode="modal">
                    <Button variant="outline">Sign in</Button>
                  </SignInButton>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  )
}

function FeatureMini({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof ShieldCheck
  title: string
  subtitle: string
}) {
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardContent className="p-4">
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card/45">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function TrustItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card/45">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function FlowStep({
  index,
  title,
  subtitle,
}: {
  index: string
  title: string
  subtitle: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-card/45 text-xs font-semibold">
          {index}
        </span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{eyebrow}</p>
      <h2 className="finance-display text-2xl text-white sm:text-3xl">{title}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck
  title: string
  description: string
}) {
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardContent className="p-4">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/45">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function ChecklistRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-300">
        <Check className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm text-foreground/90">{text}</p>
    </div>
  )
}

function PreviewTile({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="finance-display mt-1 text-lg">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{delta}</p>
    </div>
  )
}

export default App
