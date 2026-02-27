import {
  lazy,
  Suspense,
  startTransition,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { useClerk, useUser } from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  ArrowRightLeft,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Command,
  CreditCard,
  DollarSign,
  Download,
  Globe,
  Landmark,
  LayoutGrid,
  LogOut,
  Menu,
  MoonStar,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sun,
  Target,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import { appEnv } from '@/env'
import { createCurrencyFormatters, safeLocale } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { usePwaReliability } from '@/components/pwa/pwa-reliability-provider'
import {
  type CoreEntityType,
  type CoreFinanceEditorData,
  type CoreTabKey,
  type DashboardData,
  type FinanceUserMode,
  type PhaseZeroDiagnostics,
  type RangeKey,
  type TransactionFilter,
  type WorkspaceTabKey,
} from '@/components/dashboard/dashboard-types'
import { DashboardOverviewTab } from '@/components/dashboard/workspace-tabs/dashboard-overview-tab'
import {
  CORE_FINANCE_ACCOUNT_SCOPE_ALL,
  type CoreFinanceAccountScope,
} from '@/components/dashboard/workspace-tabs/core-finance-coordination'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type FinanceDashboardProps = {
  canInstallPwa: boolean
  isInstallingPwa: boolean
  onInstallPwa: () => Promise<boolean>
}

const workspaceSections: Array<{
  id: WorkspaceTabKey
  label: string
  icon: typeof LayoutGrid
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'planning', label: 'Planning', icon: Target },
  { id: 'accounts', label: 'Accounts', icon: Landmark },
  { id: 'income', label: 'Income', icon: DollarSign },
  { id: 'bills', label: 'Bills', icon: CalendarClock },
  { id: 'cards', label: 'Cards', icon: CreditCard },
  { id: 'loans', label: 'Loans', icon: BriefcaseBusiness },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
  { id: 'reliability', label: 'Reliability', icon: Wifi },
  { id: 'governance', label: 'Governance', icon: ShieldCheck },
  { id: 'automation', label: 'Automation', icon: Bell },
]

type WorkspaceCommandGroup = 'Navigate' | 'Finance Ops' | 'Workspace'

const workspaceCommandGroups: WorkspaceCommandGroup[] = [
  'Navigate',
  'Finance Ops',
  'Workspace',
]

function isWorkspaceTabKey(value: string): value is WorkspaceTabKey {
  return workspaceSections.some((section) => section.id === value)
}

function parseStoredRecentWorkspaceTabs(raw: string | null): WorkspaceTabKey[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .filter(isWorkspaceTabKey)
      .slice(0, 6)
  } catch {
    return []
  }
}

type PwaUpdateStatus = {
  ready: boolean
  version: number
  buildId?: string
  releaseName?: string
  summary?: string
  highlights?: string[]
  publishedAt?: string
}

const PWA_UPDATE_STATUS_STORAGE_KEY = 'finance-pwa-update-status'
const PWA_UPDATE_STATUS_EVENT = 'finance:pwa-update-status'
const NOTIFICATION_READ_IDS_STORAGE_KEY = 'finance-notification-read-ids-v2'
const REFERENCE_DATA_BOOTSTRAP_STORAGE_KEY = 'finance-reference-data-bootstrap-v2'

function parseStoredPwaUpdateStatus(raw: string | null): PwaUpdateStatus {
  if (!raw) return { ready: false, version: 0, highlights: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { ready: false, version: 0, highlights: [] }
    }
    const ready = parsed && 'ready' in parsed ? Boolean(parsed.ready) : false
    const version =
      parsed && 'version' in parsed && Number.isFinite(Number(parsed.version))
        ? Number(parsed.version)
        : 0
    const buildId =
      parsed && 'buildId' in parsed && typeof parsed.buildId === 'string'
        ? parsed.buildId.trim()
        : undefined
    const releaseName =
      parsed && 'releaseName' in parsed && typeof parsed.releaseName === 'string'
        ? parsed.releaseName.trim()
        : undefined
    const summary =
      parsed && 'summary' in parsed && typeof parsed.summary === 'string'
        ? parsed.summary.trim()
        : undefined
    const highlights =
      parsed && 'highlights' in parsed && Array.isArray(parsed.highlights)
        ? parsed.highlights
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
    const publishedAt =
      parsed && 'publishedAt' in parsed && typeof parsed.publishedAt === 'string'
        ? parsed.publishedAt.trim()
        : undefined
    return { ready, version, buildId, releaseName, summary, highlights, publishedAt }
  } catch {
    return { ready: false, version: 0, highlights: [] }
  }
}

function parseStoredNotificationReadIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(-256)
  } catch {
    return []
  }
}

function normalizePwaUpdateStatusPayload(payload: unknown): PwaUpdateStatus | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as {
    ready?: unknown
    version?: unknown
    buildId?: unknown
    releaseName?: unknown
    summary?: unknown
    highlights?: unknown
    publishedAt?: unknown
  }
  if (typeof candidate.ready !== 'boolean') return null
  const parsedVersion = Number(candidate.version)
  if (!Number.isFinite(parsedVersion) || parsedVersion < 0) return null
  return {
    ready: candidate.ready,
    version: parsedVersion,
    buildId:
      typeof candidate.buildId === 'string' && candidate.buildId.trim()
        ? candidate.buildId.trim()
        : undefined,
    releaseName:
      typeof candidate.releaseName === 'string' && candidate.releaseName.trim()
        ? candidate.releaseName.trim()
        : undefined,
    summary:
      typeof candidate.summary === 'string' && candidate.summary.trim()
        ? candidate.summary.trim()
        : undefined,
    highlights: Array.isArray(candidate.highlights)
      ? candidate.highlights
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [],
    publishedAt:
      typeof candidate.publishedAt === 'string' && candidate.publishedAt.trim()
        ? candidate.publishedAt.trim()
        : undefined,
  }
}

function mergeNotificationReadIds(current: string[], ids: string[]) {
  const merged = Array.from(new Set([...current, ...ids]))
  return merged.slice(-256)
}

function buildFallbackCurrencyOptions() {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  const supported =
    intlWithSupportedValues.supportedValuesOf?.('currency') ?? [
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CAD',
      'AUD',
      'CHF',
      'CNY',
      'INR',
      'MXN',
      'BRL',
      'AED',
      'SGD',
      'HKD',
      'ZAR',
    ]
  const displayNames =
    typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'currency' })
      : null

  return Array.from(
    new Set(
      supported
        .map((currencyCode) => currencyCode.trim().toUpperCase())
        .filter((currencyCode) => /^[A-Z]{3}$/.test(currencyCode)),
    ),
  )
    .sort((left, right) => left.localeCompare(right))
    .map((currencyCode) => ({
      code: currencyCode,
      name: displayNames?.of(currencyCode) ?? currencyCode,
    }))
}

const FALLBACK_CURRENCY_OPTIONS = buildFallbackCurrencyOptions()

const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: {
    totalAssets: 0,
    liabilities: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    liquidCash: 0,
  },
  accounts: [] as Array<{
    id: string
    name: string
    type: string
    provider: string
    balance: number
    changePct: number
    currency?: string
    originalBalance?: number
    originalCurrency?: string
  }>,
  portfolioSeries: [] as Array<{
    label: string
    netWorth: number
    invested: number
    cash: number
  }>,
  cashflowSeries: [] as Array<{
    label: string
    income: number
    expenses: number
  }>,
  allocations: [] as Array<{
    name: string
    amount: number
    pct: number
    deltaPct: number
    risk: 'Low' | 'Medium' | 'High'
  }>,
  budgets: [] as Array<{
    category: string
    limit: number
    spent: number
    cadence: 'Monthly'
    status: 'Healthy' | 'Tight' | 'Exceeded'
  }>,
  goals: [] as Array<{
    id: string
    title: string
    target: number
    current: number
    dueLabel: string
    contribution: number
  }>,
  insights: [] as Array<{
    id: string
    title: string
    tone: 'positive' | 'neutral' | 'warning'
    detail: string
  }>,
  watchlist: [] as Array<{
    symbol: string
    price: number
    changePct: number
    priceCurrency?: string
    originalPrice?: number
    originalCurrency?: string
  }>,
  upcomingBills: [] as Array<{
    id: string
    name: string
    due: string
    amount: number
    currency?: string
    originalAmount?: number
    originalCurrency?: string
  }>,
  transactions: [],
}

const AccountsWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/accounts-workspace-tab').then(
    (module) => ({ default: module.AccountsWorkspaceTab }),
  ),
)
const BillsWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/bills-workspace-tab').then((module) => ({
    default: module.BillsWorkspaceTab,
  })),
)
const CardsWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/cards-workspace-tab').then((module) => ({
    default: module.CardsWorkspaceTab,
  })),
)
const GovernanceWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/governance-workspace-tab').then(
    (module) => ({ default: module.GovernanceWorkspaceTab }),
  ),
)
const IncomeWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/income-workspace-tab').then((module) => ({
    default: module.IncomeWorkspaceTab,
  })),
)
const LoansWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/loans-workspace-tab').then((module) => ({
    default: module.LoansWorkspaceTab,
  })),
)
const PlanningWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/planning-workspace-tab').then(
    (module) => ({ default: module.PlanningWorkspaceTab }),
  ),
)
const PrintReportDialog = lazy(() =>
  import('@/components/dashboard/reporting/print-report-dialog').then((module) => ({
    default: module.PrintReportDialog,
  })),
)
const ReliabilityWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/reliability-workspace-tab').then(
    (module) => ({ default: module.ReliabilityWorkspaceTab }),
  ),
)
const RulesAutomationWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/rules-automation-workspace-tab').then(
    (module) => ({ default: module.RulesAutomationWorkspaceTab }),
  ),
)
const ShoppingWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/shopping-workspace-tab').then(
    (module) => ({ default: module.ShoppingWorkspaceTab }),
  ),
)
const TransactionsWorkspaceTab = lazy(() =>
  import('@/components/dashboard/workspace-tabs/transactions-workspace-tab').then(
    (module) => ({ default: module.TransactionsWorkspaceTab }),
  ),
)

export function FinanceDashboard({
  canInstallPwa,
  isInstallingPwa,
  onInstallPwa,
}: FinanceDashboardProps) {
  const { user } = useUser()
  const { signOut } = useClerk()
  const {
    isOnline,
    isFlushing,
    offlineIntents,
    telemetryQueueCount,
    flushQueues,
    lastFlushSummary,
  } = usePwaReliability()
  const searchRef = useRef<HTMLInputElement | null>(null)
  const hasAttemptedReferenceBootstrapRef = useRef(false)
  const browserLocale =
    typeof navigator !== 'undefined' ? safeLocale(navigator.language) : 'en-US'
  const [displayCurrencyOverride, setDisplayCurrencyOverride] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    try {
      const stored = window.localStorage.getItem('finance-display-currency')
      return stored?.trim() ? stored.trim().toUpperCase() : undefined
    } catch {
      return undefined
    }
  })
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [isClaimingLegacyData, setIsClaimingLegacyData] = useState(false)
  const [financeUserMode, setFinanceUserMode] = useState<FinanceUserMode>(() => {
    if (typeof window === 'undefined') return 'personal'
    try {
      const stored = window.localStorage.getItem('finance-user-mode')
      if (stored === 'personal' || stored === 'household' || stored === 'operator') {
        return stored
      }
    } catch {
      // Ignore storage access failures.
    }
    return 'personal'
  })
  const [showCoreDataManager, setShowCoreDataManager] = useState(false)
  const [coreDataManagerInitialTab, setCoreDataManagerInitialTab] =
    useState<CoreTabKey>('accounts')
  const [coreFinanceAccountScope, setCoreFinanceAccountScope] = useState<CoreFinanceAccountScope>(() => {
    if (typeof window === 'undefined') return CORE_FINANCE_ACCOUNT_SCOPE_ALL
    try {
      return (
        window.localStorage.getItem('finance-core-account-scope') ??
        CORE_FINANCE_ACCOUNT_SCOPE_ALL
      )
    } catch {
      return CORE_FINANCE_ACCOUNT_SCOPE_ALL
    }
  })

  const dashboardQuery = useQuery(api.dashboard.getDashboard, {
    locale: browserLocale,
    displayCurrency: displayCurrencyOverride,
  })
  const phaseZeroDiagnostics = useQuery(
    api.dashboard.getPhaseZeroDiagnostics,
    {},
  ) as PhaseZeroDiagnostics | undefined
  const coreFinanceEditorData = useQuery(
    api.dashboard.getCoreFinanceEditorData,
    {},
  ) as CoreFinanceEditorData | undefined
  const setPreferences = useMutation(api.dashboard.setPreferences)
  const repopulateReferenceData = useMutation(api.dashboard.repopulateReferenceData)
  const claimLegacyUserData = useMutation(api.dashboard.claimLegacyUserData)

  const [selectedRange, setSelectedRange] = useState<RangeKey>('90d')
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  const [purchaseComposerLaunch, setPurchaseComposerLaunch] = useState<{
    nonce: number
    templateId: string | null
  }>({
    nonce: 0,
    templateId: null,
  })
  const [planningLaunch, setPlanningLaunch] = useState<{
    nonce: number
    subTab: 'forecast' | 'plans' | 'goals' | 'envelopes' | null
  }>({
    nonce: 0,
    subTab: null,
  })
  const [showPrintReportDialog, setShowPrintReportDialog] = useState(false)
  const [showOperationsCenter, setShowOperationsCenter] = useState(false)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabKey>(() => {
    if (typeof window === 'undefined') {
      return 'dashboard'
    }

    const view = new URLSearchParams(window.location.search).get('view')
    let storedView: string | null = null
    try {
      storedView = window.localStorage.getItem('finance-active-workspace')
    } catch {
      storedView = null
    }
    const nextTab = (view ?? storedView) as WorkspaceTabKey | null
    return nextTab && workspaceSections.some((section) => section.id === nextTab)
      ? nextTab
      : 'dashboard'
  })
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandSearchQuery, setCommandSearchQuery] = useState('')
  const [pwaUpdateStatus, setPwaUpdateStatus] = useState<PwaUpdateStatus>(() => {
    if (typeof window === 'undefined') return { ready: false, version: 0, highlights: [] }
    try {
      return parseStoredPwaUpdateStatus(
        window.localStorage.getItem(PWA_UPDATE_STATUS_STORAGE_KEY),
      )
    } catch {
      return { ready: false, version: 0, highlights: [] }
    }
  })
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return parseStoredNotificationReadIds(
        window.localStorage.getItem(NOTIFICATION_READ_IDS_STORAGE_KEY),
      )
    } catch {
      return []
    }
  })
  const [recentWorkspaceTabs, setRecentWorkspaceTabs] = useState<WorkspaceTabKey[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      return parseStoredRecentWorkspaceTabs(
        window.localStorage.getItem('finance-recent-workspaces'),
      )
    } catch {
      return []
    }
  })
  const [showBalances, setShowBalances] = useState(true)
  const [auditReadyMode, setAuditReadyMode] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('finance-audit-ready-mode') === 'true'
    } catch {
      return false
    }
  })
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }

    const stored = window.localStorage.getItem('finance-theme')
    if (stored === 'light') return false
    if (stored === 'dark') return true
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  })
  const [thumbMode, setThumbMode] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('finance-thumb-mode') === 'true'
    } catch {
      return false
    }
  })
  const [lowSignalModeOverride, setLowSignalModeOverride] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('finance-low-signal-mode') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDarkMode)
    try {
      window.localStorage.setItem('finance-theme', isDarkMode ? 'dark' : 'light')
    } catch {
      // Ignore storage access failures.
    }
  }, [isDarkMode])

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-active-workspace', activeWorkspaceTab)
    } catch {
      // Ignore storage access failures.
    }
  }, [activeWorkspaceTab])

  useEffect(() => {
    setRecentWorkspaceTabs((current) => {
      const next = [activeWorkspaceTab, ...current.filter((tab) => tab !== activeWorkspaceTab)].slice(0, 6)
      return next
    })
  }, [activeWorkspaceTab])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'finance-recent-workspaces',
        JSON.stringify(recentWorkspaceTabs),
      )
    } catch {
      // Ignore storage access failures.
    }
  }, [recentWorkspaceTabs])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        NOTIFICATION_READ_IDS_STORAGE_KEY,
        JSON.stringify(readNotificationIds),
      )
    } catch {
      // Ignore storage access failures.
    }
  }, [readNotificationIds])

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-core-account-scope', coreFinanceAccountScope)
    } catch {
      // Ignore storage access failures.
    }
  }, [coreFinanceAccountScope])

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-user-mode', financeUserMode)
    } catch {
      // Ignore storage access failures.
    }
  }, [financeUserMode])

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-audit-ready-mode', auditReadyMode ? 'true' : 'false')
    } catch {
      // Ignore storage access failures.
    }
  }, [auditReadyMode])

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-thumb-mode', thumbMode ? 'true' : 'false')
    } catch {
      // Ignore storage access failures.
    }
  }, [thumbMode])

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-low-signal-mode', lowSignalModeOverride ? 'true' : 'false')
    } catch {
      // Ignore storage access failures.
    }
  }, [lowSignalModeOverride])

  useEffect(() => {
    if (!auditReadyMode) return
    setShowBalances(true)
  }, [auditReadyMode])

  useEffect(() => {
    if (!displayCurrencyOverride) return
    try {
      window.localStorage.setItem(
        'finance-display-currency',
        displayCurrencyOverride.toUpperCase(),
      )
    } catch {
      // Ignore storage access failures.
    }
  }, [displayCurrencyOverride])

  useEffect(() => {
    if (hasAttemptedReferenceBootstrapRef.current) return
    if (dashboardQuery === undefined) return
    if (dashboardQuery?.meta?.viewerAuthenticated === false) return

    hasAttemptedReferenceBootstrapRef.current = true

    try {
      const existingState = window.localStorage.getItem(
        REFERENCE_DATA_BOOTSTRAP_STORAGE_KEY,
      )
      if (existingState) {
        return
      }
    } catch {
      // Continue without storage short-circuit.
    }

    void repopulateReferenceData({})
      .then((result) => {
        try {
          window.localStorage.setItem(
            REFERENCE_DATA_BOOTSTRAP_STORAGE_KEY,
            String(result.asOfMs),
          )
        } catch {
          // Ignore storage failures.
        }
        if (result.insertedCurrencyCount > 0 || result.insertedFxCount > 0) {
          toast.success('Reference currency data refreshed', {
            description: `${result.insertedCurrencyCount} currencies and ${result.insertedFxCount} FX pairs added to Convex reference tables.`,
          })
        }
      })
      .catch((error) => {
        console.error('Failed to repopulate reference currency data', error)
      })
  }, [dashboardQuery, repopulateReferenceData])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'finance-theme' && typeof event.newValue === 'string') {
        if (event.newValue === 'dark') setIsDarkMode(true)
        if (event.newValue === 'light') setIsDarkMode(false)
      }

      if (
        event.key === 'finance-active-workspace' &&
        typeof event.newValue === 'string' &&
        workspaceSections.some((section) => section.id === event.newValue)
      ) {
        setActiveWorkspaceTab(event.newValue as WorkspaceTabKey)
      }

      if (event.key === 'finance-recent-workspaces') {
        setRecentWorkspaceTabs(parseStoredRecentWorkspaceTabs(event.newValue))
      }

      if (event.key === PWA_UPDATE_STATUS_STORAGE_KEY) {
        setPwaUpdateStatus(parseStoredPwaUpdateStatus(event.newValue))
      }

      if (event.key === NOTIFICATION_READ_IDS_STORAGE_KEY) {
        setReadNotificationIds(parseStoredNotificationReadIds(event.newValue))
      }

      if (event.key === 'finance-display-currency') {
        const next = event.newValue?.trim().toUpperCase() || undefined
        setDisplayCurrencyOverride(next)
      }

      if (event.key === 'finance-core-account-scope' && typeof event.newValue === 'string') {
        setCoreFinanceAccountScope(event.newValue || CORE_FINANCE_ACCOUNT_SCOPE_ALL)
      }

      if (event.key === 'finance-user-mode' && typeof event.newValue === 'string') {
        if (
          event.newValue === 'personal' ||
          event.newValue === 'household' ||
          event.newValue === 'operator'
        ) {
          setFinanceUserMode(event.newValue)
        }
      }

      if (event.key === 'finance-audit-ready-mode') {
        setAuditReadyMode(event.newValue === 'true')
      }

      if (event.key === 'finance-thumb-mode') {
        setThumbMode(event.newValue === 'true')
      }

      if (event.key === 'finance-low-signal-mode') {
        setLowSignalModeOverride(event.newValue === 'true')
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const onPwaUpdateStatus = (event: Event) => {
      const payload = normalizePwaUpdateStatusPayload(
        (event as CustomEvent<unknown>).detail,
      )
      if (!payload) return
      setPwaUpdateStatus(payload)
    }

    window.addEventListener(PWA_UPDATE_STATUS_EVENT, onPwaUpdateStatus)
    return () =>
      window.removeEventListener(PWA_UPDATE_STATUS_EVENT, onPwaUpdateStatus)
  }, [])

  const onGlobalShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    const typing =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setShowCommandPalette(true)
      return
    }

    if (!typing && event.key === '/') {
      event.preventDefault()
      searchRef.current?.focus()
    }
  })

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onGlobalShortcut(event)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('view', activeWorkspaceTab)
    window.history.replaceState(null, '', url)
  }, [activeWorkspaceTab])

  const dashboardMeta = dashboardQuery?.meta
  const dashboardData = dashboardQuery?.data ?? EMPTY_DASHBOARD_DATA
  const hasNoLiveFinanceData = dashboardQuery === null
  const {
    budgets,
    portfolioSeries,
    summary,
    transactions,
  } = dashboardData

  const displayCurrency =
    dashboardMeta?.displayCurrency ?? displayCurrencyOverride ?? 'USD'
  const displayLocale = dashboardMeta?.locale ?? browserLocale
  const { compactCurrency, wholeCurrency, money, formatSignedAmount } =
    createCurrencyFormatters(displayLocale, displayCurrency)

  const totalAssets = summary.totalAssets
  const liabilities = summary.liabilities
  const netWorth = totalAssets - liabilities
  const monthlyNet = summary.monthlyIncome - summary.monthlyExpenses
  const savingsRate = summary.monthlyIncome
    ? monthlyNet / summary.monthlyIncome
    : 0
  const budgetUsage =
    budgets.reduce(
      (sum: number, budget: DashboardData['budgets'][number]) => sum + budget.spent,
      0,
    ) /
    Math.max(
      budgets.reduce(
        (sum: number, budget: DashboardData['budgets'][number]) => sum + budget.limit,
        0,
      ),
      1,
    )
  const marketingBudget = budgets.find(
    (budget: DashboardData['budgets'][number]) => budget.category === 'Marketing',
  )
  const marketingOverrun = marketingBudget
    ? Math.max(marketingBudget.spent - marketingBudget.limit, 0)
    : 0
  const runwayMonths = summary.monthlyExpenses
    ? summary.liquidCash / summary.monthlyExpenses
    : 0
  const portfolioDeltaPct =
    portfolioSeries.length >= 2
      ? ((portfolioSeries.at(-1)!.netWorth - portfolioSeries[0]!.netWorth) /
          Math.max(portfolioSeries[0]!.netWorth, 1)) *
        100
      : 0

  const primaryUserName =
    user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Operator'
  const currentClerkUserId = user?.id ?? null
  const userInitials = primaryUserName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const formatInCurrency = (value: number, currencyCode?: string) =>
    createCurrencyFormatters(displayLocale, currencyCode ?? displayCurrency).money.format(
      value,
    )
  const queuedItemCount = offlineIntents.length + telemetryQueueCount
  const lowSignalMode = lowSignalModeOverride || !isOnline || queuedItemCount > 0
  const pwaUpdateReady = pwaUpdateStatus.ready
  const pwaUpdateNotificationId = pwaUpdateReady
    ? `pwa-update-${pwaUpdateStatus.version}`
    : null
  const pwaUpdateUnread = pwaUpdateNotificationId
    ? !readNotificationIds.includes(pwaUpdateNotificationId)
    : false
  const pwaReleaseLabel = pwaUpdateStatus.releaseName || pwaUpdateStatus.buildId || null
  const pwaReleaseSummary =
    pwaUpdateStatus.summary ||
    pwaUpdateStatus.highlights?.[0] ||
    'A newer version is ready. Refresh to apply updates.'
  const syncStateLabel = !isOnline
    ? 'Offline'
    : isFlushing
      ? 'Syncing'
      : queuedItemCount > 0
        ? 'Queued actions pending'
        : 'Synced'
  const commandPaletteShortcut = 'Ctrl/Cmd + K'
  const nowMs = Date.now()
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000
  const pendingTransactionRows = transactions
    .filter((row) => row.status === 'pending')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const pendingIncomeRows = pendingTransactionRows.filter((row) => row.type === 'income')
  const nextPayday = pendingIncomeRows[0]
  const dueObligations = dashboardData.upcomingBills
    .map((item) => {
      const dueMs = Date.parse(`${item.due}T09:00:00`)
      return {
        ...item,
        dueMs: Number.isFinite(dueMs) ? dueMs : null,
      }
    })
    .filter((item) => item.dueMs !== null)
    .sort((a, b) => Number(a.dueMs) - Number(b.dueMs))
  const overdueObligations = dueObligations.filter((item) => Number(item.dueMs) < nowMs)
  const dueSoonObligations = dueObligations.filter((item) => {
    const dueMs = Number(item.dueMs)
    return dueMs >= nowMs && dueMs <= nowMs + oneWeekMs
  })
  const dueSoonObligationAmount = dueSoonObligations.reduce(
    (sum, item) => sum + item.amount,
    0,
  )
  const operationNotifications = [
    ...(pwaUpdateReady
      ? [
          {
            id: `pwa-update-${pwaUpdateStatus.version}`,
            title: pwaReleaseLabel ? `New version ready: ${pwaReleaseLabel}` : 'New version ready',
            detail: pwaReleaseSummary,
            tone: 'warning' as const,
          },
        ]
      : []),
    ...(!isOnline
      ? [
          {
            id: 'connection-offline',
            title: 'Connection offline',
            detail: 'Queueing actions locally until the connection is restored.',
            tone: 'warning' as const,
          },
        ]
      : []),
    ...(offlineIntents.length > 0
      ? [
          {
            id: 'queue-offline-intents',
            title: 'Queued actions pending',
            detail: `${offlineIntents.length} action${offlineIntents.length === 1 ? '' : 's'} waiting to sync.`,
            tone: 'warning' as const,
          },
        ]
      : []),
    ...(telemetryQueueCount > 0
      ? [
          {
            id: 'queue-telemetry',
            title: 'Queued telemetry pending',
            detail: `${telemetryQueueCount} telemetry event${telemetryQueueCount === 1 ? '' : 's'} pending upload.`,
            tone: 'neutral' as const,
          },
        ]
      : []),
    ...overdueObligations.map((item) => ({
      id: `overdue-${item.id}-${item.due}`,
      title: `Overdue: ${item.name}`,
      detail: `Due date was ${item.due}.`,
      tone: 'warning' as const,
    })),
    ...dueSoonObligations.map((item) => ({
      id: `due-soon-${item.id}-${item.due}`,
      title: `Due soon: ${item.name}`,
      detail: `Due ${item.due}.`,
      tone: 'neutral' as const,
    })),
  ]
  const operationNotificationIds = operationNotifications.map((item) => item.id)
  const unreadNotificationItems = operationNotifications.filter(
    (item) => !readNotificationIds.includes(item.id),
  )
  const notificationsBadgeCount = unreadNotificationItems.length
  const recentWorkspaceChips = recentWorkspaceTabs
    .map((tab) => workspaceSections.find((section) => section.id === tab))
    .filter((section): section is (typeof workspaceSections)[number] => Boolean(section))
  const operationNotificationSignature = operationNotificationIds.join('|')

  useEffect(() => {
    if (!readNotificationIds.length) return
    const activeIds = new Set(
      operationNotificationSignature ? operationNotificationSignature.split('|') : [],
    )
    setReadNotificationIds((current) => {
      const next = current.filter((id) => activeIds.has(id))
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current
      }
      return next
    })
  }, [operationNotificationSignature, readNotificationIds.length])

  const setSearchInputValue = (nextValue: string) => {
    startTransition(() => setSearchValue(nextValue))
  }

  const runCommand = (executor: () => void) => {
    setShowCommandPalette(false)
    setCommandSearchQuery('')
    executor()
  }

  const openCoreDataManager = (initialTab: CoreTabKey = 'accounts') => {
    setCoreDataManagerInitialTab(initialTab)
    setShowCoreDataManager(true)
  }

  const openPurchaseComposerFromShopping = (templateId?: string) => {
    setActiveWorkspaceTab('transactions')
    setPurchaseComposerLaunch((value) => ({
      nonce: value.nonce + 1,
      templateId: templateId ?? null,
    }))
  }

  const openPrintReportDialog = () => {
    setShowPrintReportDialog(true)
  }

  const openOperationsCenter = () => {
    setReadNotificationIds((current) =>
      mergeNotificationReadIds(current, operationNotificationIds),
    )
    setShowOperationsCenter(true)
  }

  const openPlanningSubTab = (subTab: 'forecast' | 'plans' | 'goals' | 'envelopes') => {
    setActiveWorkspaceTab('planning')
    setPlanningLaunch((value) => ({
      nonce: value.nonce + 1,
      subTab,
    }))
  }

  const commandItems: Array<{
    id: string
    group: WorkspaceCommandGroup
    title: string
    subtitle: string
    keywords: string[]
    icon: typeof LayoutGrid
    run: () => void
  }> = [
    ...workspaceSections.map((section) => ({
      id: `workspace-${section.id}`,
      group: 'Navigate' as const,
      title: `Open ${section.label}`,
      subtitle: 'Switch active workspace tab',
      keywords: [section.id, section.label.toLowerCase(), 'tab', 'workspace'],
      icon: section.icon,
      run: () => setActiveWorkspaceTab(section.id),
    })),
    {
      id: 'ops-center',
      group: 'Finance Ops',
      title: 'Open operations center',
      subtitle: 'Today agenda, due items, and sync health',
      keywords: ['operations', 'today', 'agenda', 'due', 'alerts'],
      icon: Bell,
      run: openOperationsCenter,
    },
    {
      id: 'open-report',
      group: 'Finance Ops',
      title: 'Export professional report',
      subtitle: 'Generate print-ready multi-section report',
      keywords: ['report', 'print', 'export', 'pdf'],
      icon: Download,
      run: openPrintReportDialog,
    },
    {
      id: 'capture-purchase',
      group: 'Finance Ops',
      title: 'Quick capture purchase',
      subtitle: 'Open transaction composer and post to ledger',
      keywords: ['purchase', 'shopping', 'ledger', 'transaction'],
      icon: ReceiptText,
      run: () => {
        setActiveWorkspaceTab('transactions')
        setPurchaseComposerLaunch((value) => ({
          nonce: value.nonce + 1,
          templateId: null,
        }))
      },
    },
    {
      id: 'planning-budget-line',
      group: 'Finance Ops',
      title: 'Add planning budget line',
      subtitle: 'Jump to Planning envelopes workspace',
      keywords: ['planning', 'budget', 'envelope'],
      icon: Plus,
      run: () => openPlanningSubTab('envelopes'),
    },
    {
      id: 'manage-core-data',
      group: 'Finance Ops',
      title: 'Manage core finance data',
      subtitle: 'Edit accounts, income, bills, cards, and loans',
      keywords: ['manager', 'core', 'accounts', 'bills', 'cards', 'loans'],
      icon: CreditCard,
      run: () => openCoreDataManager('accounts'),
    },
    {
      id: 'open-automation',
      group: 'Finance Ops',
      title: 'Review automation workspace',
      subtitle: 'Manage rules, suggestions, and monthly controls',
      keywords: ['automation', 'rules', 'suggestions'],
      icon: CalendarClock,
      run: () => setActiveWorkspaceTab('automation'),
    },
    {
      id: 'toggle-audit-ready',
      group: 'Workspace',
      title: auditReadyMode ? 'Disable audit-ready mode' : 'Enable audit-ready mode',
      subtitle: 'Switch report/review-focused presentation',
      keywords: ['audit', 'mode', 'review'],
      icon: ShieldCheck,
      run: () => setAuditReadyMode((value) => !value),
    },
    {
      id: 'toggle-thumb-mode',
      group: 'Workspace',
      title: thumbMode ? 'Disable thumb mode' : 'Enable thumb mode',
      subtitle: 'Toggle compact one-hand PWA layout',
      keywords: ['thumb', 'mobile', 'compact'],
      icon: Smartphone,
      run: () => setThumbMode((value) => !value),
    },
    {
      id: 'toggle-low-signal',
      group: 'Workspace',
      title: lowSignalMode ? 'Disable low-signal mode' : 'Enable low-signal mode',
      subtitle: 'Focus queued vs synced state and actions',
      keywords: ['signal', 'offline', 'queue', 'sync'],
      icon: lowSignalMode ? WifiOff : Wifi,
      run: () => setLowSignalModeOverride((value) => !value),
    },
    {
      id: 'flush-queue',
      group: 'Workspace',
      title: 'Flush queued actions now',
      subtitle: 'Retry sync for intents and telemetry',
      keywords: ['flush', 'sync', 'queue', 'retry'],
      icon: Wifi,
      run: () => {
        void handleFlushNow()
      },
    },
  ]

  if (canInstallPwa) {
    commandItems.push({
      id: 'install-app',
      group: 'Workspace',
      title: 'Install app',
      subtitle: 'Prompt PWA installation flow',
      keywords: ['install', 'pwa', 'app'],
      icon: Download,
      run: () => {
        void onInstallPwa()
      },
    })
  }

  const normalizedCommandSearch = commandSearchQuery.trim().toLowerCase()
  const filteredCommandItems = normalizedCommandSearch
    ? commandItems.filter((item) =>
        [item.title, item.subtitle, ...item.keywords]
          .join(' ')
          .toLowerCase()
          .includes(normalizedCommandSearch),
      )
    : commandItems

  async function handleFlushNow() {
    const result = await flushQueues('shell_low_signal_flush')
    if (result.ok) {
      toast.success(
        `Sync complete (${result.intentsSucceeded} actions, ${result.telemetrySent} telemetry)`,
      )
      return
    }
    toast(
      result.reason === 'offline' ? 'Still offline' : 'Sync not complete',
      {
        description:
          result.reason === 'offline'
            ? 'Reconnect to flush queued actions.'
            : result.reason,
      },
    )
  }

  const handleDisplayCurrencyChange = async (nextCurrency: string) => {
    const normalized = nextCurrency.toUpperCase()
    setDisplayCurrencyOverride(normalized)
    setIsSavingPreferences(true)

    try {
      await setPreferences({
        displayCurrency: normalized,
        locale: browserLocale,
      })
      toast.success(`Currency set to ${normalized}`, {
        description:
          'Display and newly entered amounts now use this currency.',
      })
    } catch (error) {
      console.error('Failed to save dashboard currency preference', error)
      toast.error('Currency preference not saved', {
        description: 'The dashboard will retry on your next query refresh.',
      })
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const handleClaimLegacyData = async (fromUserId: string) => {
    setIsClaimingLegacyData(true)
    try {
      const preview = await claimLegacyUserData({
        fromUserId,
        dryRun: true,
      })

      if (!preview.matchedDocCount) {
        toast.error('No legacy records found to claim')
        return
      }

      const result = await claimLegacyUserData({
        fromUserId,
        dryRun: false,
      })

      toast.success('Legacy Convex data claimed', {
        description: `Moved ${result.patchedDocCount} records across ${result.touchedTableCount} tables.`,
      })
    } catch (error) {
      console.error('Failed to claim legacy Convex data', error)
      toast.error('Claim legacy data failed', {
        description:
          error instanceof Error
            ? error.message
            : 'Check Convex backend auth and try again.',
      })
    } finally {
      setIsClaimingLegacyData(false)
    }
  }

  if (dashboardQuery === undefined) {
    return (
      <DashboardDataState
        title="Loading Convex dashboard"
        description="Fetching live finance data, FX metadata, and user preferences from Convex."
      />
    )
  }

  const resolvedDashboardMeta =
    dashboardQuery?.meta ??
    ({
      displayCurrency: displayCurrencyOverride ?? 'USD',
      baseCurrency: displayCurrencyOverride ?? 'USD',
      locale: browserLocale,
      availableCurrencies: FALLBACK_CURRENCY_OPTIONS,
      syntheticRates: false,
      fxAsOfMs: null,
      fxSources: [] as string[],
      viewerAuthenticated: phaseZeroDiagnostics?.viewerAuthenticated ?? true,
      sourceKind: 'empty-live',
    } as const)
  const convexBackendAuthenticated = resolvedDashboardMeta.viewerAuthenticated !== false
  const dataOwnershipValue =
    phaseZeroDiagnostics === undefined
      ? 'Checking'
      : phaseZeroDiagnostics.matchedCurrentData
        ? 'Matched'
        : phaseZeroDiagnostics.viewerAuthenticated
          ? 'Needs claim'
          : 'Auth missing'
  const dataOwnershipTone: 'positive' | 'neutral' | 'warning' =
    phaseZeroDiagnostics === undefined
      ? 'neutral'
      : phaseZeroDiagnostics.matchedCurrentData
        ? 'positive'
        : 'warning'

  return (
    <>
      <div className="relative min-h-screen">
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_20%,rgba(67,187,255,0.22),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(0,255,199,0.18),transparent_50%),radial-gradient(circle_at_45%_0%,rgba(255,255,255,0.08),transparent_55%)]" />
          <div className="finance-grid absolute inset-0" />
        </div>

        <div className="relative mx-auto flex w-full max-w-[1920px] gap-4 px-3 py-3 sm:px-5 sm:py-4 lg:px-6 2xl:px-8">
          <aside className="finance-panel hidden min-h-[calc(100vh-1.5rem)] w-72 shrink-0 flex-col justify-between gap-5 p-4 lg:flex 2xl:w-80">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="from-primary via-chart-2 to-chart-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br shadow-[0_0_32px_color-mix(in_oklab,var(--color-primary)_28%,transparent)]">
                  <Landmark className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="finance-display text-sm tracking-[0.12em] text-foreground uppercase">
                    Finance OS
                  </p>
                  <p className="text-muted-foreground text-xs">
                    PWA workspace · 2026 build
                  </p>
                </div>
              </div>

              <nav className="space-y-1.5">
                {workspaceSections.map((section) => {
                  const Icon = section.icon
                  const active = activeWorkspaceTab === section.id
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveWorkspaceTab(section.id)}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                        active
                          ? 'bg-card/70 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-foreground)_10%,transparent)]'
                          : 'text-muted-foreground hover:bg-card/45 hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg',
                          active
                            ? 'bg-primary/20 text-primary'
                            : 'bg-card/45 text-muted-foreground group-hover:bg-card/70',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-medium">{section.label}</span>
                    </button>
                  )
                })}
              </nav>

              <Card className="border-border/70 bg-card/45 shadow-none backdrop-blur-xl">
                <CardHeader className="gap-1 px-4">
                  <CardTitle className="text-sm">Workspace health</CardTitle>
                  <CardDescription className="text-xs">
                    Convex, Clerk, and PWA runtime status
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-4">
                  <StatusRow
                    icon={ShieldCheck}
                    label="Clerk auth"
                    value="Configured"
                    tone="positive"
                  />
                  <StatusRow
                    icon={Wifi}
                    label="Convex cloud"
                    value={appEnv.convexUrl ? 'Connected' : 'Missing URL'}
                    tone={appEnv.convexUrl ? 'positive' : 'warning'}
                  />
                  <StatusRow
                    icon={Globe}
                    label="Convex site"
                    value={appEnv.convexSiteUrl ? 'Configured' : 'Optional'}
                    tone={appEnv.convexSiteUrl ? 'neutral' : 'neutral'}
                  />
                  <StatusRow
                    icon={ShieldCheck}
                    label="Data ownership"
                    value={dataOwnershipValue}
                    tone={dataOwnershipTone}
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="border-primary/25 bg-primary/8 shadow-none">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">Quick launch</CardTitle>
                <CardDescription>
                  Use <kbd className="rounded border px-1 py-0.5 text-[10px]">{commandPaletteShortcut}</kbd> for
                  actions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 px-4">
                <Button
                  className="h-11 w-full justify-start rounded-xl border border-border/60 bg-card/65 shadow-none"
                  variant="secondary"
                  onClick={() => setShowCommandPalette(true)}
                >
                  <Command className="h-4 w-4" />
                  Open command palette
                </Button>
                <Button
                  className="h-11 w-full justify-start rounded-xl border-border/60 bg-background/45"
                  variant="outline"
                  onClick={() => openCoreDataManager('accounts')}
                >
                  <CreditCard className="h-4 w-4" />
                  Manage core data
                </Button>
                <Button
                  className="h-11 w-full justify-start rounded-xl border-border/60 bg-background/45"
                  variant="outline"
                  onClick={openPrintReportDialog}
                >
                  <Download className="h-4 w-4" />
                  Export monthly report
                </Button>
                <Button
                  className="h-11 w-full justify-start rounded-xl border-border/60 bg-background/45"
                  variant="outline"
                  onClick={openOperationsCenter}
                >
                  <Bell className="h-4 w-4" />
                  Open operations center
                </Button>
              </CardContent>
            </Card>
          </aside>

          <main
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-4',
              thumbMode && 'finance-thumb-mode pb-24 sm:pb-4',
              lowSignalMode && 'finance-low-signal-mode',
            )}
          >
            <header className="finance-panel sticky top-4 z-30 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                  <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                    <SheetTrigger asChild>
                      <Button size="icon-sm" variant="outline" className="lg:hidden">
                        <Menu className="h-4 w-4" />
                        <span className="sr-only">Open navigation</span>
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[22rem]">
                      <SheetHeader>
                        <SheetTitle>Finance OS</SheetTitle>
                        <SheetDescription>
                          Navigate your workspace and monitoring panels.
                        </SheetDescription>
                      </SheetHeader>
                      <ScrollArea className="mt-6 h-[calc(100vh-8rem)] pr-2">
                        <div className="space-y-4 pb-4">
                          <div className="space-y-2">
                            {workspaceSections.map((section) => {
                              const Icon = section.icon
                              const active = activeWorkspaceTab === section.id
                              return (
                                <Button
                                  key={section.id}
                                  variant={active ? 'secondary' : 'ghost'}
                                  className="w-full justify-start"
                                  onClick={() => {
                                    setActiveWorkspaceTab(section.id)
                                    setIsMobileMenuOpen(false)
                                  }}
                                >
                                  <Icon className="h-4 w-4" />
                                  {section.label}
                                </Button>
                              )
                            })}
                          </div>

                          <Card className="border-border/70 bg-card/45 shadow-none backdrop-blur-xl">
                            <CardHeader className="gap-1 px-4">
                              <CardTitle className="text-sm">Workspace health</CardTitle>
                              <CardDescription className="text-xs">
                                Convex, Clerk, and PWA runtime status
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 px-4">
                              <StatusRow
                                icon={ShieldCheck}
                                label="Clerk auth"
                                value="Configured"
                                tone="positive"
                              />
                              <StatusRow
                                icon={Wifi}
                                label="Convex cloud"
                                value={appEnv.convexUrl ? 'Connected' : 'Missing URL'}
                                tone={appEnv.convexUrl ? 'positive' : 'warning'}
                              />
                              <StatusRow
                                icon={Globe}
                                label="Convex site"
                                value={appEnv.convexSiteUrl ? 'Configured' : 'Optional'}
                                tone="neutral"
                              />
                              <StatusRow
                                icon={ShieldCheck}
                                label="Data ownership"
                                value={dataOwnershipValue}
                                tone={dataOwnershipTone}
                              />
                            </CardContent>
                          </Card>

                          <Card className="border-primary/25 bg-primary/8 shadow-none">
                            <CardHeader className="px-4">
                              <CardTitle className="text-sm">Quick launch</CardTitle>
                              <CardDescription>
                                Use <kbd className="rounded border px-1 py-0.5 text-[10px]">{commandPaletteShortcut}</kbd>{' '}
                                for actions
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2.5 px-4">
                              <Button
                                className="h-11 w-full justify-start rounded-xl border border-border/60 bg-card/65 shadow-none"
                                variant="secondary"
                                onClick={() => {
                                  setShowCommandPalette(true)
                                  setIsMobileMenuOpen(false)
                                }}
                              >
                                <Command className="h-4 w-4" />
                                Open command palette
                              </Button>
                              <Button
                                className="h-11 w-full justify-start rounded-xl border-border/60 bg-background/45"
                                variant="outline"
                                onClick={() => {
                                  openCoreDataManager('accounts')
                                  setIsMobileMenuOpen(false)
                                }}
                              >
                                <CreditCard className="h-4 w-4" />
                                Manage core data
                              </Button>
                              <Button
                                className="h-11 w-full justify-start rounded-xl border-border/60 bg-background/45"
                                variant="outline"
                                onClick={() => {
                                  openPrintReportDialog()
                                  setIsMobileMenuOpen(false)
                                }}
                              >
                                <Download className="h-4 w-4" />
                                Export monthly report
                              </Button>
                              <Button
                                className="h-11 w-full justify-start rounded-xl border-border/60 bg-background/45"
                                variant="outline"
                                onClick={() => {
                                  openOperationsCenter()
                                  setIsMobileMenuOpen(false)
                                }}
                              >
                                <Bell className="h-4 w-4" />
                                Open operations center
                              </Button>
                            </CardContent>
                          </Card>
                        </div>
                      </ScrollArea>
                    </SheetContent>
                  </Sheet>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="finance-display truncate text-sm text-foreground sm:text-base">
                        Financial Command Center
                      </p>
                      <Badge
                        variant="outline"
                        className="border-border/70 bg-card/45 text-[10px] uppercase"
                      >
                        {financeUserMode} mode
                      </Badge>
                      {auditReadyMode ? (
                        <Badge
                          variant="outline"
                          className="border-primary/35 bg-primary/12 text-[10px] uppercase"
                        >
                          audit-ready
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Convex database · {displayCurrency} display ·{' '}
                      {hasNoLiveFinanceData
                        ? 'no records yet'
                        : resolvedDashboardMeta.syntheticRates
                          ? 'extended FX coverage'
                          : 'FX rates available'}
                    </p>
                    {user && !convexBackendAuthenticated ? (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                        Clerk UI is signed in, but Convex backend auth is not active. Check Clerk JWT
                        template `convex` and Convex auth config.
                      </p>
                    ) : null}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-10 gap-2 border-border/70 bg-card/45 px-2 sm:px-3"
                    >
                      <Avatar size="sm">
                        <AvatarFallback>{userInitials}</AvatarFallback>
                      </Avatar>
                      <span className="hidden max-w-28 truncate text-xs sm:inline">
                        {primaryUserName}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel className="space-y-1">
                      <p className="text-sm leading-none font-semibold">{primaryUserName}</p>
                      <p className="text-muted-foreground truncate text-xs font-normal">
                        {user?.primaryEmailAddress?.emailAddress}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowCommandPalette(true)}>
                      <Command className="h-4 w-4" />
                      Command palette
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openOperationsCenter}>
                      <Bell className="h-4 w-4" />
                      Operations center
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openCoreDataManager('accounts')}>
                      <CreditCard className="h-4 w-4" />
                      Core data manager
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        openPrintReportDialog()
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Export dashboard
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        void signOut({ redirectUrl: '/' })
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="relative">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    ref={searchRef}
                    value={searchValue}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setSearchInputValue(nextValue)
                    }}
                    placeholder="Search transactions, categories..."
                    className="h-9 w-full border-border/70 bg-card/45 pl-9 backdrop-blur-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/45 px-2.5 py-1.5 backdrop-blur-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <select
                      value={displayCurrency}
                      onChange={(event) =>
                        void handleDisplayCurrencyChange(event.target.value)
                      }
                      disabled={isSavingPreferences}
                      className="max-w-[10rem] bg-transparent text-xs text-foreground outline-none"
                      aria-label="Display currency"
                    >
                      {resolvedDashboardMeta.availableCurrencies.map(
                        (currencyOption: { code: string; name: string }) => (
                          <option
                            key={currencyOption.code}
                            value={currencyOption.code}
                            className="bg-background text-foreground"
                          >
                            {currencyOption.code} · {currencyOption.name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="border-border/70 bg-card/45"
                    onClick={() => setIsDarkMode((value) => !value)}
                  >
                    {isDarkMode ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                    <span className="sr-only">Toggle theme</span>
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="relative border-border/70 bg-card/45"
                      onClick={openOperationsCenter}
                    >
                      <Bell className="h-4 w-4" />
                      {notificationsBadgeCount > 0 ? (
                        <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
                          {Math.min(notificationsBadgeCount, 99)}
                        </span>
                      ) : null}
                      <span className="sr-only">Notifications</span>
                    </Button>
                    {pwaUpdateReady ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'hidden h-6 rounded-full px-2 text-[10px] sm:inline-flex',
                          pwaUpdateUnread
                            ? 'border-primary/35 bg-primary/12 text-primary'
                            : 'border-border/70 bg-card/45 text-muted-foreground',
                        )}
                      >
                        New version ready
                      </Badge>
                    ) : null}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="border-border/70 bg-card/45">
                        <ShieldCheck className="h-4 w-4" />
                        Workspace controls
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>Workspace Controls</DropdownMenuLabel>
                      <DropdownMenuItem
                        onSelect={() => setAuditReadyMode((value) => !value)}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Audit-ready
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {auditReadyMode ? 'On' : 'Off'}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setThumbMode((value) => !value)}
                      >
                        <Smartphone className="h-4 w-4" />
                        Thumb mode
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {thumbMode ? 'On' : 'Off'}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setLowSignalModeOverride((value) => !value)}
                      >
                        {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                        Low-signal mode
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {lowSignalMode ? 'On' : 'Off'}
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          openPrintReportDialog()
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Export monthly report
                      </DropdownMenuItem>
                      {canInstallPwa ? (
                        <DropdownMenuItem
                          onSelect={() => {
                            void onInstallPwa()
                          }}
                          disabled={isInstallingPwa}
                        >
                          <Download className="h-4 w-4" />
                          {isInstallingPwa ? 'Installing app...' : 'Install app'}
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {canInstallPwa ? (
                    <Button
                      size="sm"
                      className="hidden 2xl:inline-flex"
                      onClick={() => void onInstallPwa()}
                      disabled={isInstallingPwa}
                    >
                      <Download className="h-4 w-4" />
                      {isInstallingPwa ? 'Installing...' : 'Install App'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </header>
            <Tabs
              value={activeWorkspaceTab}
              onValueChange={(value) => setActiveWorkspaceTab(value as WorkspaceTabKey)}
              className="gap-4"
            >
              {lowSignalMode ? (
                <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                  <CardContent className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          isOnline
                            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-400/30 bg-amber-500/12 text-amber-200',
                        )}
                      >
                        {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                        {syncStateLabel}
                      </Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/50">
                        {offlineIntents.length} queued actions
                      </Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/50">
                        {telemetryQueueCount} queued telemetry
                      </Badge>
                      {lastFlushSummary ? (
                        <Badge variant="outline" className="border-border/70 bg-background/50">
                          Last sync: {lastFlushSummary.ok ? 'ok' : 'incomplete'}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!isOnline || isFlushing || queuedItemCount === 0}
                        onClick={() => void handleFlushNow()}
                      >
                        {isFlushing ? 'Syncing...' : 'Flush now'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setLowSignalModeOverride(false)}
                      >
                        Return to normal view
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardContent className="space-y-3 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <WorkspacePulseStat
                      label="Due this week"
                      value={
                        dueSoonObligations.length > 0
                          ? `${dueSoonObligations.length} item${dueSoonObligations.length === 1 ? '' : 's'}`
                          : 'All clear'
                      }
                      detail={
                        dueSoonObligations.length > 0
                          ? `${showBalances ? wholeCurrency.format(dueSoonObligationAmount) : '••••'} total obligations`
                          : 'No bill, card, or loan due in 7 days'
                      }
                      tone={dueSoonObligations.length > 0 ? 'warning' : 'positive'}
                      icon={CalendarClock}
                    />
                    <WorkspacePulseStat
                      label="Next payday"
                      value={
                        nextPayday
                          ? safeFormatIsoDate(nextPayday.date, 'EEE, MMM d')
                          : 'Not scheduled'
                      }
                      detail={
                        nextPayday
                          ? `${showBalances ? `+${wholeCurrency.format(nextPayday.amount)}` : 'Amount hidden'} · ${nextPayday.merchant}`
                          : 'Configure income cadence in the Income tab'
                      }
                      tone={nextPayday ? 'positive' : 'neutral'}
                      icon={DollarSign}
                    />
                    <WorkspacePulseStat
                      label="Sync state"
                      value={syncStateLabel}
                      detail={`${offlineIntents.length} queued actions · ${telemetryQueueCount} queued telemetry`}
                      tone={!isOnline || queuedItemCount > 0 ? 'warning' : 'positive'}
                      icon={isOnline ? Wifi : WifiOff}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={openOperationsCenter}>
                      <Bell className="h-4 w-4" />
                      Operations center
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveWorkspaceTab('dashboard')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Today focus
                    </Button>
                    {queuedItemCount > 0 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!isOnline || isFlushing}
                        onClick={() => void handleFlushNow()}
                      >
                        {isFlushing ? 'Syncing...' : 'Flush queued actions'}
                      </Button>
                    ) : null}
                  </div>

                  {recentWorkspaceChips.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] tracking-[0.1em] text-muted-foreground uppercase">
                        Recent workspaces
                      </span>
                      {recentWorkspaceChips.map((section) => {
                        const Icon = section.icon
                        return (
                          <Button
                            key={`recent-${section.id}`}
                            size="xs"
                            variant={activeWorkspaceTab === section.id ? 'default' : 'outline'}
                            className="h-7 gap-1.5 px-2.5"
                            onClick={() => setActiveWorkspaceTab(section.id)}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {section.label}
                          </Button>
                        )
                      })}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <TabsContent value="dashboard">
                {hasNoLiveFinanceData ? (
                  <div className="grid gap-4">
                    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                      <CardHeader className="gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-200">
                            Empty live workspace
                          </Badge>
                          <Badge variant="outline" className="border-border/70 bg-background/55">
                            {displayCurrency} · {displayLocale}
                          </Badge>
                        </div>
                        <CardTitle className="text-base">No finance records yet for this account</CardTitle>
                        <CardDescription>
                          You are in the real dashboard workspace. This Clerk user has no normalized Convex finance data yet. Start adding records or claim legacy data if a prior account exists.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => openCoreDataManager('accounts')}>
                            <CreditCard className="h-4 w-4" />
                            Add accounts
                          </Button>
                          <Button variant="outline" onClick={() => openCoreDataManager('incomes')}>
                            <DollarSign className="h-4 w-4" />
                            Add income
                          </Button>
                          <Button variant="outline" onClick={() => openCoreDataManager('bills')}>
                            <ReceiptText className="h-4 w-4" />
                            Add bills
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setActiveWorkspaceTab('accounts')}
                            className="border border-border/60 bg-card/60 shadow-none"
                          >
                            Open Accounts tab
                          </Button>
                        </div>
                        <PhaseZeroDiagnosticsCard
                          diagnostics={phaseZeroDiagnostics}
                          currentClerkUserId={currentClerkUserId}
                          isClaimingLegacyData={isClaimingLegacyData}
                          onClaimLegacyData={(fromUserId) => void handleClaimLegacyData(fromUserId)}
                        />
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <DashboardOverviewTab
                    data={dashboardData}
                    selectedRange={selectedRange}
                    onSelectedRangeChange={setSelectedRange}
                    showBalances={showBalances}
                    onToggleBalances={() => setShowBalances((value) => !value)}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    thumbMode={thumbMode}
                    lowSignalMode={lowSignalMode}
                    queuedItemCount={queuedItemCount}
                    userMode={financeUserMode}
                    onUserModeChange={setFinanceUserMode}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    formatters={{ compactCurrency, wholeCurrency, money }}
                    formatInCurrency={formatInCurrency}
                    metrics={{
                      netWorth,
                      portfolioDeltaPct,
                      runwayMonths,
                      monthlyNet,
                      savingsRate,
                      budgetUsage,
                      marketingOverrun,
                    }}
                    fxPolicy={{
                      baseCurrency: resolvedDashboardMeta.baseCurrency ?? displayCurrency,
                      displayCurrency,
                      fxAsOfMs:
                        typeof resolvedDashboardMeta.fxAsOfMs === 'number'
                          ? resolvedDashboardMeta.fxAsOfMs
                          : null,
                      fxSources: Array.isArray(resolvedDashboardMeta.fxSources)
                        ? resolvedDashboardMeta.fxSources
                        : [],
                      syntheticRates: Boolean(resolvedDashboardMeta.syntheticRates),
                    }}
                  />
                )}
              </TabsContent>

              <TabsContent value="planning">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <PlanningWorkspaceTab
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    thumbMode={thumbMode}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    openSubTabSignal={planningLaunch.nonce}
                    openSubTabValue={planningLaunch.subTab}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="accounts">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <AccountsWorkspaceTab
                    data={coreFinanceEditorData}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    accountScope={coreFinanceAccountScope}
                    onAccountScopeChange={setCoreFinanceAccountScope}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    onOpenManager={() => openCoreDataManager('accounts')}
                    thumbMode={thumbMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="income">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <IncomeWorkspaceTab
                    data={coreFinanceEditorData}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    accountScope={coreFinanceAccountScope}
                    onAccountScopeChange={setCoreFinanceAccountScope}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    onOpenManager={() => openCoreDataManager('incomes')}
                    thumbMode={thumbMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="bills">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <BillsWorkspaceTab
                    data={coreFinanceEditorData}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    accountScope={coreFinanceAccountScope}
                    onAccountScopeChange={setCoreFinanceAccountScope}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    onOpenManager={() => openCoreDataManager('bills')}
                    thumbMode={thumbMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="cards">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <CardsWorkspaceTab
                    data={coreFinanceEditorData}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    accountScope={coreFinanceAccountScope}
                    onAccountScopeChange={setCoreFinanceAccountScope}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    onOpenManager={() => openCoreDataManager('cards')}
                    thumbMode={thumbMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="loans">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <LoansWorkspaceTab
                    data={coreFinanceEditorData}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    accountScope={coreFinanceAccountScope}
                    onAccountScopeChange={setCoreFinanceAccountScope}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    onOpenManager={() => openCoreDataManager('loans')}
                    thumbMode={thumbMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="shopping">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <ShoppingWorkspaceTab
                    data={coreFinanceEditorData}
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    accountScope={coreFinanceAccountScope}
                    onAccountScopeChange={setCoreFinanceAccountScope}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                    onPostPurchase={openPurchaseComposerFromShopping}
                    onPostPurchaseTemplate={(templateId) =>
                      openPurchaseComposerFromShopping(templateId)
                    }
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="transactions">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <TransactionsWorkspaceTab
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    showBalances={showBalances}
                    transactions={transactions}
                    transactionFilter={transactionFilter}
                    onTransactionFilterChange={setTransactionFilter}
                    searchValue={searchValue}
                    onSearchValueChange={setSearchInputValue}
                    searchRef={searchRef}
                    formatInCurrency={formatInCurrency}
                    formatSignedAmount={formatSignedAmount}
                    openPurchaseComposerSignal={purchaseComposerLaunch.nonce}
                    openPurchaseComposerTemplateId={purchaseComposerLaunch.templateId}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="reliability">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <ReliabilityWorkspaceTab
                    displayLocale={displayLocale}
                    thumbMode={thumbMode}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="governance">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <GovernanceWorkspaceTab
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    auditReadyMode={auditReadyMode}
                    onAuditReadyModeChange={setAuditReadyMode}
                    thumbMode={thumbMode}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="automation">
                <Suspense fallback={<WorkspaceTabLoadingState />}>
                  <RulesAutomationWorkspaceTab
                    displayCurrency={displayCurrency}
                    displayLocale={displayLocale}
                    thumbMode={thumbMode}
                    onNavigateTab={(tab) => setActiveWorkspaceTab(tab)}
                  />
                </Suspense>
              </TabsContent>
            </Tabs>

            {thumbMode ? (
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:hidden">
                <div className="pointer-events-auto finance-panel border-border/70 bg-card/80 p-2 backdrop-blur-xl">
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      size="sm"
                      variant={activeWorkspaceTab === 'dashboard' ? 'default' : 'outline'}
                      onClick={() => setActiveWorkspaceTab('dashboard')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Today
                    </Button>
                    <Button
                      size="sm"
                      variant={activeWorkspaceTab === 'shopping' ? 'default' : 'outline'}
                      onClick={() => setActiveWorkspaceTab('shopping')}
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Errand
                    </Button>
                    <Button
                      size="sm"
                      variant={activeWorkspaceTab === 'transactions' ? 'default' : 'outline'}
                      onClick={() => {
                        setActiveWorkspaceTab('transactions')
                        setPurchaseComposerLaunch((value) => ({
                          nonce: value.nonce + 1,
                          templateId: null,
                        }))
                      }}
                    >
                      <ReceiptText className="h-4 w-4" />
                      Capture
                    </Button>
                    <Button
                      size="sm"
                      variant={activeWorkspaceTab === 'reliability' ? 'default' : 'outline'}
                      onClick={() => setActiveWorkspaceTab('reliability')}
                    >
                      <Wifi className="h-4 w-4" />
                      Sync
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      <Dialog
        open={showCommandPalette}
        onOpenChange={(open) => {
          setShowCommandPalette(open)
          if (!open) {
            setCommandSearchQuery('')
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Command palette</DialogTitle>
            <DialogDescription>
              Search and launch workspace actions across finance, governance, and reliability.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={commandSearchQuery}
                onChange={(event) => setCommandSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredCommandItems[0]) {
                    event.preventDefault()
                    runCommand(filteredCommandItems[0].run)
                  }
                }}
                placeholder="Search commands: export, planning, sync..."
                className="h-10 border-border/70 bg-card/45 pl-9"
              />
            </div>
            <ScrollArea className="h-[22rem] rounded-xl border border-border/70 bg-card/35 p-2">
              <div className="space-y-4 pr-1">
                {workspaceCommandGroups.map((group) => {
                  const rows = filteredCommandItems.filter((item) => item.group === group)
                  if (rows.length === 0) return null
                  return (
                    <div key={group} className="space-y-2">
                      <p className="px-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                        {group}
                      </p>
                      <div className="space-y-2">
                        {rows.map((item) => (
                          <CommandActionRow
                            key={item.id}
                            icon={item.icon}
                            title={item.title}
                            subtitle={item.subtitle}
                            onClick={() => runCommand(item.run)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
                {filteredCommandItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                    No commands matched. Try terms like <span className="font-medium text-foreground">report</span>,{' '}
                    <span className="font-medium text-foreground">planning</span>, or{' '}
                    <span className="font-medium text-foreground">sync</span>.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
            <Separator />
            <p className="text-muted-foreground text-xs">
              Tip: press <kbd className="rounded border px-1 py-0.5 text-[10px]">/</kbd> to focus
              search and{' '}
              <kbd className="rounded border px-1 py-0.5 text-[10px]">{commandPaletteShortcut}</kbd>{' '}
              to reopen this panel.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={showOperationsCenter} onOpenChange={setShowOperationsCenter}>
        <SheetContent side="right" className="w-full border-l-border/70 sm:w-[38rem] sm:max-w-[38rem]">
          <SheetHeader>
            <SheetTitle>Operations center</SheetTitle>
            <SheetDescription>
              Live workspace agenda for due obligations, paydays, and reliability controls.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-5 h-[calc(100vh-9.5rem)] pr-1">
            <div className="space-y-4">
              <Card className="border-border/70 bg-card/45 shadow-none">
                <CardHeader className="gap-1 pb-3">
                  <CardTitle className="text-sm">Signal + sync</CardTitle>
                  <CardDescription>
                    Queue health for offline intents and telemetry pipelines.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <StatusRow
                    icon={isOnline ? Wifi : WifiOff}
                    label="Connection"
                    value={syncStateLabel}
                    tone={!isOnline || queuedItemCount > 0 ? 'warning' : 'positive'}
                  />
                  <StatusRow
                    icon={ArrowRightLeft}
                    label="Queued actions"
                    value={`${offlineIntents.length} intents`}
                    tone={offlineIntents.length > 0 ? 'warning' : 'neutral'}
                  />
                  <StatusRow
                    icon={Globe}
                    label="Queued telemetry"
                    value={`${telemetryQueueCount} events`}
                    tone={telemetryQueueCount > 0 ? 'warning' : 'neutral'}
                  />
                  <StatusRow
                    icon={Download}
                    label="App version"
                    value={
                      pwaUpdateReady
                        ? pwaReleaseLabel
                          ? `New version · ${pwaReleaseLabel}`
                          : 'New version ready'
                        : 'Up to date'
                    }
                    tone={pwaUpdateReady ? 'warning' : 'positive'}
                  />
                  {pwaUpdateReady ? (
                    <div className="space-y-1 rounded-lg border border-border/60 bg-background/35 p-2.5">
                      <p className="text-xs text-muted-foreground">
                        {pwaReleaseSummary}
                      </p>
                      {pwaUpdateStatus.highlights && pwaUpdateStatus.highlights.length > 0 ? (
                        <ul className="space-y-1 pl-3 text-xs text-muted-foreground list-disc">
                          {pwaUpdateStatus.highlights.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isOnline || isFlushing || queuedItemCount === 0}
                      onClick={() => void handleFlushNow()}
                    >
                      {isFlushing ? 'Syncing...' : 'Flush now'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/45 shadow-none">
                <CardHeader className="gap-1 pb-3">
                  <CardTitle className="text-sm">Notifications</CardTitle>
                  <CardDescription>
                    Deduped inbox for current operational alerts and update messages.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {operationNotifications.length > 0 ? (
                    operationNotifications.map((item) => {
                      const unread = !readNotificationIds.includes(item.id)
                      return (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{item.title}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 rounded-full px-1.5 text-[10px]',
                                item.tone === 'warning'
                                  ? 'border-amber-400/45 bg-amber-500/12 text-amber-200'
                                  : 'border-border/65 bg-card/55 text-muted-foreground',
                              )}
                            >
                              {unread ? 'New' : 'Read'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      No active notifications right now.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/45 shadow-none">
                <CardHeader className="gap-1 pb-3">
                  <CardTitle className="text-sm">Today agenda</CardTitle>
                  <CardDescription>
                    Action list from live due dates and scheduled incomes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overdueObligations.length > 0 ? (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      {overdueObligations.length} obligation{overdueObligations.length === 1 ? '' : 's'} overdue.
                    </div>
                  ) : null}
                  {dueSoonObligations.length > 0 ? (
                    dueSoonObligations.slice(0, 6).map((item) => (
                      <div
                        key={`ops-due-${item.id}`}
                        className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{item.name}</p>
                          <span className="text-sm font-semibold">
                            {showBalances ? money.format(item.amount) : '••••'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Due {item.due} ·{' '}
                          {item.dueMs
                            ? formatDistanceToNowStrict(item.dueMs, { addSuffix: true })
                            : 'date unavailable'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      No obligations due in the next 7 days.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/45 shadow-none">
                <CardHeader className="gap-1 pb-3">
                  <CardTitle className="text-sm">Upcoming paydays</CardTitle>
                  <CardDescription>
                    Scheduled income events from your Convex income cadence.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingIncomeRows.length > 0 ? (
                    pendingIncomeRows.slice(0, 5).map((row) => (
                      <div
                        key={`ops-income-${row.id}`}
                        className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{row.merchant}</p>
                          <span className="text-sm font-semibold text-emerald-300">
                            {showBalances ? `+${money.format(row.amount)}` : '••••'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {safeFormatIsoDate(row.date, 'EEE, MMM d')} · {row.account}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      No upcoming income rows. Configure cadence in the Income tab.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/45 shadow-none">
                <CardHeader className="gap-1 pb-3">
                  <CardTitle className="text-sm">Quick actions</CardTitle>
                  <CardDescription>
                    Jump directly to the right workspace for the next task.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowOperationsCenter(false)
                      setActiveWorkspaceTab('transactions')
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Open transactions
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowOperationsCenter(false)
                      setActiveWorkspaceTab('income')
                    }}
                  >
                    <DollarSign className="h-4 w-4" />
                    Review paydays
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowOperationsCenter(false)
                      setActiveWorkspaceTab('bills')
                    }}
                  >
                    <CalendarClock className="h-4 w-4" />
                    Review due dates
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowOperationsCenter(false)
                      setActiveWorkspaceTab('reliability')
                    }}
                  >
                    <Wifi className="h-4 w-4" />
                    Open reliability
                  </Button>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {showPrintReportDialog ? (
        <Suspense fallback={null}>
          <PrintReportDialog
            displayCurrency={displayCurrency}
            displayLocale={displayLocale}
            auditReadyMode={auditReadyMode}
            open={showPrintReportDialog}
            onOpenChange={setShowPrintReportDialog}
            showTrigger={false}
          />
        </Suspense>
      ) : null}

      <CoreFinanceManagerDialog
        open={showCoreDataManager}
        onOpenChange={setShowCoreDataManager}
        initialTab={coreDataManagerInitialTab}
        data={coreFinanceEditorData}
        dashboardData={dashboardData}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
      />
    </>
  )
}

function DashboardDataState({
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="finance-grid absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(70,195,255,0.16),transparent_55%),radial-gradient(circle_at_85%_8%,rgba(54,238,195,0.12),transparent_60%)]" />
      </div>
      <Card className="finance-panel relative w-full max-w-2xl border-border/70 bg-card/45 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {actionLabel && onAction ? (
          <CardContent className="space-y-4 pt-0">
            <Button onClick={onAction}>{actionLabel}</Button>
            {children}
          </CardContent>
        ) : children ? (
          <CardContent className="pt-0">{children}</CardContent>
        ) : null}
      </Card>
    </div>
  )
}

function WorkspaceTabLoadingState() {
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/35 border-t-primary" />
        <p className="text-sm text-muted-foreground">Loading workspace module...</p>
      </CardContent>
    </Card>
  )
}

function PhaseZeroDiagnosticsCard({
  diagnostics,
  currentClerkUserId,
  isClaimingLegacyData,
  onClaimLegacyData,
}: {
  diagnostics: PhaseZeroDiagnostics | undefined
  currentClerkUserId: string | null
  isClaimingLegacyData: boolean
  onClaimLegacyData: (fromUserId: string) => void
}) {
  if (diagnostics === undefined) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/50 p-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Phase 0 Diagnostics
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Running Convex auth and data ownership checks...
        </p>
      </div>
    )
  }

  const suggestedCandidate =
    diagnostics.recommendedLegacyUserId
      ? diagnostics.legacyCandidates.find(
          (candidate) => candidate.userId === diagnostics.recommendedLegacyUserId,
        ) ?? diagnostics.legacyCandidates[0]
      : diagnostics.legacyCandidates[0]

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Phase 0 Diagnostics
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Checks Convex backend auth and whether this Clerk user owns the existing finance records.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MiniStat
          label="Clerk user"
          value={currentClerkUserId ? shortId(currentClerkUserId) : 'Not signed in'}
          tone={currentClerkUserId ? 'neutral' : 'warning'}
        />
        <MiniStat
          label="Convex backend auth"
          value={diagnostics.viewerAuthenticated ? 'Active' : 'Inactive'}
          tone={diagnostics.viewerAuthenticated ? 'positive' : 'warning'}
        />
        <MiniStat
          label="Convex viewer"
          value={diagnostics.viewerUserId ? shortId(diagnostics.viewerUserId) : 'None'}
          tone={diagnostics.viewerUserId ? 'neutral' : 'warning'}
        />
        <MiniStat
          label="Matched records"
          value={`${diagnostics.currentUserDocCount} docs / ${diagnostics.currentUserTableCount} tables`}
          tone={diagnostics.matchedCurrentData ? 'positive' : 'warning'}
        />
      </div>

      {suggestedCandidate ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-3">
          <p className="text-sm font-medium text-foreground">
            Legacy data candidate detected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {shortId(suggestedCandidate.userId)} · {suggestedCandidate.docCount} docs across{' '}
            {suggestedCandidate.tableCount} tables
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {suggestedCandidate.tables.slice(0, 4).join(', ')}
            {suggestedCandidate.tables.length > 4
              ? ` +${suggestedCandidate.tables.length - 4} more`
              : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onClaimLegacyData(suggestedCandidate.userId)}
              disabled={isClaimingLegacyData || !diagnostics.viewerAuthenticated}
            >
              {isClaimingLegacyData ? 'Claiming...' : 'Claim legacy data'}
            </Button>
          </div>
        </div>
      ) : diagnostics.viewerAuthenticated ? (
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
          No legacy candidate was detected in the scanned tables. You can continue with a fresh
          account and start adding real finance records.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-3 text-xs text-muted-foreground">
          Convex backend auth is inactive. Sign out and sign back in after confirming the Clerk JWT
          template `convex` is configured.
        </div>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-xs font-medium',
          tone === 'positive' && 'text-emerald-300',
          tone === 'warning' && 'text-amber-200',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function shortId(value: string) {
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function safeFormatIsoDate(value: string, formatPattern: string): string {
  const parsed = parseISO(value)
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable'
  return format(parsed, formatPattern)
}

function StatusRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
  tone: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="text-muted-foreground h-4 w-4" />
        <span className="truncate">{label}</span>
      </div>
      <span
        title={value}
        className={cn(
          'inline-flex max-w-[8.5rem] shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] leading-none font-medium whitespace-nowrap',
          tone === 'positive' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
          tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-200',
          tone === 'neutral' && 'border-border/60 bg-card/55 text-foreground/90',
        )}
      >
        <span className="truncate">{value}</span>
      </span>
    </div>
  )
}

type CoreDraft = Record<string, string | boolean>

const coreTabOptions: Array<{
  key: CoreTabKey
  label: string
  entityType: CoreEntityType
}> = [
  { key: 'accounts', label: 'Accounts', entityType: 'account' },
  { key: 'incomes', label: 'Income', entityType: 'income' },
  { key: 'bills', label: 'Bills', entityType: 'bill' },
  { key: 'cards', label: 'Cards', entityType: 'card' },
  { key: 'loans', label: 'Loans', entityType: 'loan' },
]

function CoreFinanceManagerDialog({
  open,
  onOpenChange,
  initialTab,
  data,
  dashboardData,
  displayCurrency,
  displayLocale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: CoreTabKey
  data: CoreFinanceEditorData | undefined
  dashboardData: DashboardData
  displayCurrency: string
  displayLocale: string
}) {
  const upsertCoreFinanceEntity = useMutation(api.dashboard.upsertCoreFinanceEntity)
  const deleteCoreFinanceEntity = useMutation(api.dashboard.deleteCoreFinanceEntity)
  const { isOnline, enqueueIntent, trackEvent } = usePwaReliability()
  const [activeTab, setActiveTab] = useState<CoreTabKey>(initialTab ?? 'accounts')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const [draft, setDraft] = useState<CoreDraft>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const money = createCurrencyFormatters(displayLocale, displayCurrency).money
  const activeTabMeta = coreTabOptions.find((tab) => tab.key === activeTab) ?? coreTabOptions[0]!
  const activeItems = getCoreItemsForTab(data, activeTab)
  const linkedImpactPreview = buildLinkedImpactPreview({
    tab: activeTab,
    draft,
    mode,
    selectedId,
    activeItems,
    dashboardData,
    money,
  })

  const resetDraftForTab = (tab: CoreTabKey) => {
    setMode('create')
    setSelectedId(null)
    setDraft(defaultDraftForTab(tab, data))
  }

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab ?? 'accounts')
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    setMode('create')
    setSelectedId(null)
    setDraft(defaultDraftForTab(activeTab, data))
  }, [open, activeTab, data])

  const save = async () => {
    const payload = {
      entityType: activeTabMeta.entityType,
      id: mode === 'edit' && selectedId ? selectedId : undefined,
      values: draftToMutationValues(activeTab, draft),
    }

    if (!isOnline) {
      enqueueIntent('dashboard.upsertCoreFinanceEntity', payload, {
        label: `${activeTabMeta.label} save`,
      })
      trackEvent({
        category: 'offline_queue',
        eventType: 'core_finance_save_queued_offline',
        feature: 'core_finance_manager',
        status: 'queued',
        message: activeTabMeta.entityType,
      })
      toast.success(`${activeTabMeta.label} change queued for reconnect sync`)
      if (mode === 'create') {
        resetDraftForTab(activeTab)
      }
      return
    }

    setIsSaving(true)
    try {
      const result = await upsertCoreFinanceEntity(payload)

      setMode('edit')
      setSelectedId(result.id)
      toast.success(
        `${activeTabMeta.label.slice(0, -1)} ${result.mode === 'created' ? 'created' : 'updated'}`,
      )
    } catch (error) {
      console.error(error)
      toast.error('Save failed', {
        description: error instanceof Error ? error.message : 'Unable to save record.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async () => {
    if (!selectedId || mode !== 'edit') return

    if (!isOnline) {
      enqueueIntent(
        'dashboard.deleteCoreFinanceEntity',
        {
          entityType: activeTabMeta.entityType,
          id: selectedId,
        },
        { label: `${activeTabMeta.label} delete` },
      )
      trackEvent({
        category: 'offline_queue',
        eventType: 'core_finance_delete_queued_offline',
        feature: 'core_finance_manager',
        status: 'queued',
        message: activeTabMeta.entityType,
      })
      toast.success(`${activeTabMeta.label} delete queued for reconnect sync`)
      resetDraftForTab(activeTab)
      return
    }

    setIsDeleting(true)
    try {
      await deleteCoreFinanceEntity({
        entityType: activeTabMeta.entityType,
        id: selectedId,
      })
      toast.success(`${activeTabMeta.label.slice(0, -1)} deleted`)
      resetDraftForTab(activeTab)
    } catch (error) {
      console.error(error)
      toast.error('Delete failed', {
        description: error instanceof Error ? error.message : 'Unable to delete record.',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const accountOptions = data?.accountOptions ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Core Data Manager (Phase 1)</DialogTitle>
          <DialogDescription>
            Create and edit live Convex records for accounts, income, bills, cards, and loans.
          </DialogDescription>
        </DialogHeader>

        {data?.viewerAuthenticated === false ? (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-4 text-sm text-muted-foreground">
            Convex backend auth is inactive. Sign in again after enabling the Clerk JWT template
            `convex`.
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CoreTabKey)}>
          <TabsList className="grid w-full grid-cols-5">
            {coreTabOptions.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-border/60 bg-card/35 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{activeTabMeta.label}</p>
                <p className="text-xs text-muted-foreground">
                  {activeItems.length} records
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => resetDraftForTab(activeTab)}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>

            <ScrollArea className="h-[24rem]">
              <div className="space-y-2 pr-2">
                {activeItems.length ? (
                  activeItems.map((item) => {
                    const selected = item.id === selectedId && mode === 'edit'
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMode('edit')
                          setSelectedId(item.id)
                          setDraft(draftFromItem(activeTab, item))
                        }}
                        className={cn(
                          'w-full rounded-xl border px-3 py-2.5 text-left transition',
                          selected
                            ? 'border-primary/40 bg-primary/8'
                            : 'border-border/60 bg-background/50 hover:border-border hover:bg-background/70',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium">{item.title}</p>
                          {item.badge ? (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {item.badge}
                            </Badge>
                          ) : null}
                        </div>
                        {item.subtitle ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">
                            {item.createdAt
                              ? format(new Date(item.createdAt), 'MMM d, yyyy')
                              : 'Unknown date'}
                          </span>
                          <span className="font-medium">
                            {item.amountLabel ?? ''}
                          </span>
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                    No records yet in this table.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/35 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {mode === 'edit' ? `Edit ${activeTabMeta.label.slice(0, -1)}` : `New ${activeTabMeta.label.slice(0, -1)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Changes write directly to your Convex database and trigger dashboard refreshes.
                </p>
              </div>
              {!isOnline ? (
                <Badge variant="outline" className="border-amber-400/25 bg-amber-500/10 text-amber-200">
                  Offline: changes will be queued
                </Badge>
              ) : null}
              <div className="flex gap-2">
                {mode === 'edit' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={remove}
                    disabled={isDeleting || isSaving}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </Button>
                ) : null}
                <Button size="sm" onClick={save} disabled={isSaving || isDeleting}>
                  {isSaving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create record'}
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[24rem] pr-2">
              <div className="space-y-3">
                {renderCoreForm({
                  tab: activeTab,
                  draft,
                  setDraft,
                  accountOptions,
                })}
                {linkedImpactPreview ? (
                  <LinkedImpactPreviewCard preview={linkedImpactPreview} />
                ) : null}
                <Separator />
                <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
                  Phase 1 note: this manager is intentionally direct and backend-native to unblock
                  CRUD quickly. We can replace it with polished domain screens after the core flows
                  are stable.
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  function getCoreItemsForTab(
    payload: CoreFinanceEditorData | undefined,
    tab: CoreTabKey,
  ): Array<{
    id: string
    title: string
    subtitle?: string
    amountLabel?: string
    badge?: string
    createdAt?: number
    raw: Record<string, unknown>
  }> {
    if (!payload) return []

    if (tab === 'accounts') {
      return payload.accounts.map((row) => ({
        id: row.id,
        title: row.name,
        subtitle: `${row.type} · ${
          String(row.type).toLowerCase() === 'debt'
            ? 'Non-liquid (liability)'
            : row.liquid
              ? 'Liquid'
              : 'Non-liquid'
        }`,
        amountLabel: money.format(row.balance),
        createdAt: row.createdAt,
        raw: row as unknown as Record<string, unknown>,
      }))
    }

    if (tab === 'incomes') {
      const accountMap = new Map(payload.accountOptions.map((a) => [a.id, a.name]))
      return payload.incomes.map((row) => ({
        id: row.id,
        title: row.source,
        subtitle: `${row.cadence} · Day ${row.receivedDay}${
          row.destinationAccountId ? ` · ${accountMap.get(row.destinationAccountId) ?? 'Account'}` : ''
        }`,
        amountLabel: money.format(row.amount),
        badge: 'Income',
        createdAt: row.createdAt,
        raw: row as unknown as Record<string, unknown>,
      }))
    }

    if (tab === 'bills') {
      const accountMap = new Map(payload.accountOptions.map((a) => [a.id, a.name]))
      return payload.bills.map((row) => ({
        id: row.id,
        title: row.name,
        subtitle: `${row.cadence} · Due ${row.dueDay}${
          row.linkedAccountId ? ` · ${accountMap.get(row.linkedAccountId) ?? 'Account'}` : ''
        }`,
        amountLabel: money.format(row.amount),
        badge: row.isSubscription ? 'Sub' : row.autopay ? 'Autopay' : undefined,
        createdAt: row.createdAt,
        raw: row as unknown as Record<string, unknown>,
      }))
    }

    if (tab === 'cards') {
      return payload.cards.map((row) => ({
        id: row.id,
        title: row.name,
        subtitle: `Due ${row.dueDay} · ${row.interestRate}% APR · Min ${money.format(row.minimumPayment)}`,
        amountLabel: `${money.format(row.usedLimit)} / ${money.format(row.creditLimit)}`,
        createdAt: row.createdAt,
        raw: row as unknown as Record<string, unknown>,
      }))
    }

    return payload.loans.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: `${row.cadence} · Due ${row.dueDay} · ${row.minimumPaymentType}`,
      amountLabel: money.format(row.balance),
      createdAt: row.createdAt,
      raw: row as unknown as Record<string, unknown>,
    }))
  }
}

function renderCoreForm({
  tab,
  draft,
  setDraft,
  accountOptions,
}: {
  tab: CoreTabKey
  draft: CoreDraft
  setDraft: (value: CoreDraft | ((prev: CoreDraft) => CoreDraft)) => void
  accountOptions: CoreFinanceEditorData['accountOptions']
}) {
  const setField = (key: string, value: string | boolean) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const textInput = (
    key: string,
    label: string,
    type: 'text' | 'number' = 'text',
    placeholder?: string,
  ) => (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={String(draft[key] ?? '')}
        onChange={(event) => setField(key, event.target.value)}
        placeholder={placeholder}
        inputMode={type === 'number' ? 'decimal' : undefined}
      />
    </label>
  )

  const selectInput = (
    key: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    includeBlank = false,
  ) => (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={String(draft[key] ?? '')}
        onChange={(event) => setField(key, event.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        {includeBlank ? <option value="">Not set</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  const checkboxInput = (key: string, label: string) => (
    <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <input
        type="checkbox"
        checked={Boolean(draft[key])}
        onChange={(event) => setField(key, event.target.checked)}
        className="h-4 w-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  )

  const accountTypeValue = String(draft.type ?? 'checking').toLowerCase()
  const accountTypeIsDebt = tab === 'accounts' && accountTypeValue === 'debt'

  if (tab === 'accounts') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {textInput('name', 'Name')}
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <select
            value={String(draft.type ?? 'checking')}
            onChange={(event) =>
              setDraft((prev) => {
                const nextType = event.target.value
                return {
                  ...prev,
                  type: nextType,
                  liquid: nextType === 'debt' ? false : Boolean(prev.liquid ?? true),
                }
              })
            }
            className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
            <option value="investment">Investment / Brokerage</option>
            <option value="debt">Debt (liability)</option>
          </select>
        </label>
        {textInput('balance', 'Balance', 'number')}
        <div className="flex items-end">
          <label
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5',
              accountTypeIsDebt && 'opacity-70',
            )}
          >
            <input
              type="checkbox"
              checked={!accountTypeIsDebt && Boolean(draft.liquid)}
              disabled={accountTypeIsDebt}
              onChange={(event) => setField('liquid', event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Liquid account</span>
          </label>
        </div>
        <div className="sm:col-span-2">
          <p className="rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
            Checking, savings, and investment accounts increase assets. Debt accounts reduce net
            worth and are treated as liabilities.
          </p>
        </div>
        {accountTypeIsDebt ? (
          <div className="sm:col-span-2">
            <p className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              Debt accounts are always stored as non-liquid and will appear in liabilities / debt
              allocation on the dashboard.
            </p>
          </div>
        ) : null}
      </div>
    )
  }

  if (tab === 'incomes') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {textInput('source', 'Income source')}
        {textInput('amount', 'Amount', 'number')}
        {selectInput('cadence', 'Cadence', [
          { value: 'monthly', label: 'Monthly' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Biweekly' },
          { value: 'custom', label: 'Custom' },
        ])}
        {textInput('receivedDay', 'Received day', 'number')}
        {selectInput(
          'destinationAccountId',
          'Destination account',
          accountOptions.map((account) => ({ value: account.id, label: account.name })),
          true,
        )}
        {textInput('customInterval', 'Custom interval', 'number')}
        {selectInput('customUnit', 'Custom unit', [
          { value: 'days', label: 'Days' },
          { value: 'weeks', label: 'Weeks' },
          { value: 'months', label: 'Months' },
          { value: 'years', label: 'Years' },
        ])}
      </div>
    )
  }

  if (tab === 'bills') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {textInput('name', 'Bill name')}
        {textInput('amount', 'Amount', 'number')}
        {selectInput('cadence', 'Cadence', [
          { value: 'monthly', label: 'Monthly' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Biweekly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'yearly', label: 'Yearly' },
        ])}
        {textInput('dueDay', 'Due day', 'number')}
        {textInput('category', 'Category')}
        {selectInput('scope', 'Scope', [
          { value: 'personal', label: 'Personal' },
          { value: 'shared', label: 'Shared' },
        ], true)}
        {selectInput(
          'linkedAccountId',
          'Linked account',
          accountOptions.map((account) => ({ value: account.id, label: account.name })),
          true,
        )}
        {textInput('cancelReminderDays', 'Cancel reminder days', 'number')}
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
          {checkboxInput('autopay', 'Autopay')}
          {checkboxInput('isSubscription', 'Subscription')}
          {checkboxInput('deductible', 'Deductible')}
        </div>
      </div>
    )
  }

  if (tab === 'cards') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {textInput('name', 'Card name')}
        {textInput('creditLimit', 'Credit limit', 'number')}
        {textInput('usedLimit', 'Used limit', 'number')}
        {textInput('interestRate', 'Interest rate (APR %)', 'number')}
        {textInput('dueDay', 'Due day', 'number')}
        {textInput('minimumPayment', 'Minimum payment', 'number')}
        {textInput('spendPerMonth', 'Spend per month', 'number')}
        <div className="sm:col-span-2">
          <p className="rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
            Used for dashboard schedule timing, reminders, and upcoming card payment projections.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {textInput('name', 'Loan name')}
      {textInput('balance', 'Balance', 'number')}
      {textInput('principalBalance', 'Principal balance', 'number')}
      {textInput('accruedInterest', 'Accrued interest', 'number')}
      {selectInput('cadence', 'Cadence', [
        { value: 'monthly', label: 'Monthly' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'biweekly', label: 'Biweekly' },
      ])}
      {textInput('dueDay', 'Due day', 'number')}
      {textInput('minimumPayment', 'Minimum payment', 'number')}
      {selectInput('minimumPaymentType', 'Minimum payment type', [
        { value: 'fixed', label: 'Fixed' },
        { value: 'percentage', label: 'Percentage' },
      ])}
      {textInput('extraPayment', 'Extra payment', 'number')}
      {textInput('subscriptionCost', 'Subscription cost', 'number')}
      {textInput('subscriptionOutstanding', 'Subscription outstanding', 'number')}
      {textInput('subscriptionPaymentCount', 'Subscription payment count', 'number')}
    </div>
  )
}

function defaultDraftForTab(
  tab: CoreTabKey,
  data: CoreFinanceEditorData | undefined,
): CoreDraft {
  const firstAccountId = data?.accountOptions?.[0]?.id ?? ''
  if (tab === 'accounts') {
    return {
      name: '',
      type: 'checking',
      balance: '0',
      liquid: true,
    }
  }
  if (tab === 'incomes') {
    return {
      source: '',
      amount: '0',
      cadence: 'monthly',
      receivedDay: '1',
      destinationAccountId: firstAccountId,
      customInterval: '1',
      customUnit: 'weeks',
    }
  }
  if (tab === 'bills') {
    return {
      name: '',
      amount: '0',
      cadence: 'monthly',
      dueDay: '1',
      category: '',
      scope: 'personal',
      linkedAccountId: firstAccountId,
      cancelReminderDays: '',
      autopay: false,
      isSubscription: false,
      deductible: false,
    }
  }
  if (tab === 'cards') {
    return {
      name: '',
      creditLimit: '0',
      usedLimit: '0',
      interestRate: '0',
      dueDay: '20',
      minimumPayment: '0',
      spendPerMonth: '0',
    }
  }
  return {
    name: '',
    balance: '0',
    principalBalance: '0',
    accruedInterest: '0',
    cadence: 'monthly',
    dueDay: '1',
    minimumPayment: '0',
    minimumPaymentType: 'fixed',
    extraPayment: '0',
    subscriptionCost: '0',
    subscriptionOutstanding: '0',
    subscriptionPaymentCount: '0',
  }
}

function draftFromItem(
  tab: CoreTabKey,
  item: {
    raw: Record<string, unknown>
  },
): CoreDraft {
  const raw = item.raw
  if (tab === 'accounts') {
    return {
      name: String(raw.name ?? ''),
      type: String(raw.type ?? 'checking'),
      balance: String(raw.balance ?? '0'),
      liquid: Boolean(raw.liquid),
    }
  }
  if (tab === 'incomes') {
    return {
      source: String(raw.source ?? ''),
      amount: String(raw.amount ?? '0'),
      cadence: String(raw.cadence ?? 'monthly'),
      receivedDay: String(raw.receivedDay ?? '1'),
      destinationAccountId: String(raw.destinationAccountId ?? ''),
      customInterval: String(raw.customInterval ?? ''),
      customUnit: String(raw.customUnit ?? 'weeks'),
    }
  }
  if (tab === 'bills') {
    return {
      name: String(raw.name ?? ''),
      amount: String(raw.amount ?? '0'),
      cadence: String(raw.cadence ?? 'monthly'),
      dueDay: String(raw.dueDay ?? '1'),
      category: String(raw.category ?? ''),
      scope: String(raw.scope ?? ''),
      linkedAccountId: String(raw.linkedAccountId ?? ''),
      cancelReminderDays:
        raw.cancelReminderDays == null ? '' : String(raw.cancelReminderDays),
      autopay: Boolean(raw.autopay),
      isSubscription: Boolean(raw.isSubscription),
      deductible: Boolean(raw.deductible),
    }
  }
  if (tab === 'cards') {
    return {
      name: String(raw.name ?? ''),
      creditLimit: String(raw.creditLimit ?? '0'),
      usedLimit: String(raw.usedLimit ?? '0'),
      interestRate: String(raw.interestRate ?? '0'),
      dueDay: String(raw.dueDay ?? '20'),
      minimumPayment: String(raw.minimumPayment ?? '0'),
      spendPerMonth: String(raw.spendPerMonth ?? '0'),
    }
  }
  return {
    name: String(raw.name ?? ''),
    balance: String(raw.balance ?? '0'),
    principalBalance: String(raw.principalBalance ?? '0'),
    accruedInterest: String(raw.accruedInterest ?? '0'),
    cadence: String(raw.cadence ?? 'monthly'),
    dueDay: String(raw.dueDay ?? '1'),
    minimumPayment: String(raw.minimumPayment ?? '0'),
    minimumPaymentType: String(raw.minimumPaymentType ?? 'fixed'),
    extraPayment: String(raw.extraPayment ?? '0'),
    subscriptionCost: String(raw.subscriptionCost ?? '0'),
    subscriptionOutstanding: String(raw.subscriptionOutstanding ?? '0'),
    subscriptionPaymentCount: String(raw.subscriptionPaymentCount ?? '0'),
  }
}

function draftToMutationValues(tab: CoreTabKey, draft: CoreDraft) {
  if (tab === 'accounts') {
    const normalizedType = String(draft.type ?? 'checking').toLowerCase()
    return {
      name: draft.name,
      type: normalizedType,
      balance: draft.balance,
      liquid: normalizedType === 'debt' ? false : Boolean(draft.liquid),
    }
  }
  if (tab === 'incomes') {
    return {
      source: draft.source,
      amount: draft.amount,
      cadence: draft.cadence,
      receivedDay: draft.receivedDay,
      destinationAccountId: draft.destinationAccountId,
      customInterval: draft.customInterval,
      customUnit: draft.customUnit,
    }
  }
  if (tab === 'bills') {
    return {
      name: draft.name,
      amount: draft.amount,
      cadence: draft.cadence,
      dueDay: draft.dueDay,
      category: draft.category,
      scope: draft.scope,
      linkedAccountId: draft.linkedAccountId,
      cancelReminderDays: draft.cancelReminderDays,
      autopay: Boolean(draft.autopay),
      isSubscription: Boolean(draft.isSubscription),
      deductible: Boolean(draft.deductible),
    }
  }
  if (tab === 'cards') {
    return {
      name: draft.name,
      creditLimit: draft.creditLimit,
      usedLimit: draft.usedLimit,
      interestRate: draft.interestRate,
      dueDay: draft.dueDay,
      minimumPayment: draft.minimumPayment,
      spendPerMonth: draft.spendPerMonth,
    }
  }
  return {
    name: draft.name,
    balance: draft.balance,
    principalBalance: draft.principalBalance,
    accruedInterest: draft.accruedInterest,
    cadence: draft.cadence,
    dueDay: draft.dueDay,
    minimumPayment: draft.minimumPayment,
    minimumPaymentType: draft.minimumPaymentType,
    extraPayment: draft.extraPayment,
    subscriptionCost: draft.subscriptionCost,
    subscriptionOutstanding: draft.subscriptionOutstanding,
    subscriptionPaymentCount: draft.subscriptionPaymentCount,
  }
}

type LinkedImpactPreview = {
  title: string
  description: string
  rows: Array<{
    label: string
    before: string
    after: string
    delta?: string
    tone?: 'positive' | 'neutral' | 'warning'
  }>
  notes: string[]
}

function buildLinkedImpactPreview({
  tab,
  draft,
  mode,
  selectedId,
  activeItems,
  dashboardData,
  money,
}: {
  tab: CoreTabKey
  draft: CoreDraft
  mode: 'create' | 'edit'
  selectedId: string | null
  activeItems: Array<{
    id: string
    raw: Record<string, unknown>
  }>
  dashboardData: DashboardData
  money: Intl.NumberFormat
}): LinkedImpactPreview | null {
  if (!['accounts', 'bills', 'cards'].includes(tab)) return null

  const selectedRaw =
    mode === 'edit' && selectedId
      ? activeItems.find((item) => item.id === selectedId)?.raw ?? null
      : null

  const summary = dashboardData.summary
  const baselineNetWorth = summary.totalAssets - summary.liabilities
  const baselineMonthlyNet = summary.monthlyIncome - summary.monthlyExpenses
  const baselineRunwayMonths =
    summary.monthlyExpenses > 0 ? summary.liquidCash / summary.monthlyExpenses : null

  const signedMoney = (value: number) =>
    `${value >= 0 ? '+' : ''}${money.format(value)}`
  const signedNumber = (value: number, suffix = '') =>
    `${value >= 0 ? '+' : ''}${value}${suffix}`
  const asNumber = (value: unknown, fallback = 0) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }
  const asString = (value: unknown, fallback = '') => {
    if (value == null) return fallback
    return String(value)
  }

  if (tab === 'accounts') {
    const previousType = asString(selectedRaw?.type, 'checking').toLowerCase()
    const previousBalance = asNumber(selectedRaw?.balance, 0)
    const previousLiquid = previousType === 'debt' ? false : Boolean(selectedRaw?.liquid ?? true)
    const nextType = asString(draft.type, previousType || 'checking').toLowerCase()
    const nextBalance = asNumber(draft.balance, previousBalance)
    const nextLiquid = nextType === 'debt' ? false : Boolean(draft.liquid ?? previousLiquid)

    const accountContribution = (type: string, balance: number, liquid: boolean) => {
      if (type === 'debt') {
        return { assets: 0, liabilities: Math.max(0, balance), liquidCash: 0 }
      }
      return {
        assets: balance,
        liabilities: 0,
        liquidCash: liquid ? balance : 0,
      }
    }

    const prev = accountContribution(previousType, previousBalance, previousLiquid)
    const next = accountContribution(nextType, nextBalance, nextLiquid)
    const deltaAssets = next.assets - prev.assets
    const deltaLiabilities = next.liabilities - prev.liabilities
    const deltaLiquidCash = next.liquidCash - prev.liquidCash
    const nextNetWorth = baselineNetWorth + deltaAssets - deltaLiabilities
    const nextRunwayMonths =
      summary.monthlyExpenses > 0
        ? (summary.liquidCash + deltaLiquidCash) / summary.monthlyExpenses
        : null

    return {
      title: 'Linked impact preview',
      description:
        'Preview how this account draft would affect dashboard net worth, liquid cash, and runway before saving.',
      rows: [
        {
          label: 'Net worth',
          before: money.format(baselineNetWorth),
          after: money.format(nextNetWorth),
          delta: signedMoney(deltaAssets - deltaLiabilities),
          tone: deltaAssets - deltaLiabilities >= 0 ? 'positive' : 'warning',
        },
        {
          label: 'Liquid cash',
          before: money.format(summary.liquidCash),
          after: money.format(summary.liquidCash + deltaLiquidCash),
          delta: signedMoney(deltaLiquidCash),
          tone: deltaLiquidCash >= 0 ? 'positive' : 'warning',
        },
        {
          label: 'Runway',
          before: baselineRunwayMonths == null ? 'N/A' : `${baselineRunwayMonths.toFixed(1)}m`,
          after: nextRunwayMonths == null ? 'N/A' : `${nextRunwayMonths.toFixed(1)}m`,
          delta:
            baselineRunwayMonths == null || nextRunwayMonths == null
              ? undefined
              : signedNumber(Number((nextRunwayMonths - baselineRunwayMonths).toFixed(1)), 'm'),
          tone:
            baselineRunwayMonths == null || nextRunwayMonths == null
              ? 'neutral'
              : nextRunwayMonths - baselineRunwayMonths >= 0
                ? 'positive'
                : 'warning',
        },
      ],
      notes: [
        nextType === 'debt'
          ? 'Debt account balances increase liabilities and reduce net worth.'
          : `This account is treated as an asset${nextLiquid ? ' and liquid cash' : ''}.`,
      ],
    }
  }

  if (tab === 'bills') {
    const previousAmount = asNumber(selectedRaw?.amount, 0)
    const nextAmount = asNumber(draft.amount, previousAmount)
    const deltaMonthlyExpenses = nextAmount - previousAmount
    const nextMonthlyExpenses = summary.monthlyExpenses + deltaMonthlyExpenses
    const nextMonthlyNet = baselineMonthlyNet - deltaMonthlyExpenses
    const nextRunwayMonths =
      nextMonthlyExpenses > 0 ? summary.liquidCash / nextMonthlyExpenses : null
    const previousDueDay = asNumber(selectedRaw?.dueDay, 1)
    const nextDueDay = asNumber(draft.dueDay, previousDueDay)
    const previousAutopay = Boolean(selectedRaw?.autopay ?? false)
    const nextAutopay = Boolean(draft.autopay ?? previousAutopay)
    const previousLinkedAccount = asString(selectedRaw?.linkedAccountId, '')
    const nextLinkedAccount = asString(draft.linkedAccountId, previousLinkedAccount)

    return {
      title: 'Linked impact preview',
      description:
        'Preview how this bill draft would change recurring obligations, monthly net, runway, and scheduling behavior.',
      rows: [
        {
          label: 'Monthly obligations',
          before: money.format(summary.monthlyExpenses),
          after: money.format(nextMonthlyExpenses),
          delta: signedMoney(deltaMonthlyExpenses),
          tone: deltaMonthlyExpenses <= 0 ? 'positive' : 'warning',
        },
        {
          label: 'Monthly net',
          before: money.format(baselineMonthlyNet),
          after: money.format(nextMonthlyNet),
          delta: signedMoney(-deltaMonthlyExpenses),
          tone: -deltaMonthlyExpenses >= 0 ? 'positive' : 'warning',
        },
        {
          label: 'Runway',
          before: baselineRunwayMonths == null ? 'N/A' : `${baselineRunwayMonths.toFixed(1)}m`,
          after: nextRunwayMonths == null ? 'N/A' : `${nextRunwayMonths.toFixed(1)}m`,
          delta:
            baselineRunwayMonths == null || nextRunwayMonths == null
              ? undefined
              : signedNumber(Number((nextRunwayMonths - baselineRunwayMonths).toFixed(1)), 'm'),
          tone:
            baselineRunwayMonths == null || nextRunwayMonths == null
              ? 'neutral'
              : nextRunwayMonths - baselineRunwayMonths >= 0
                ? 'positive'
                : 'warning',
        },
      ],
      notes: [
        `Due day changes from ${previousDueDay} to ${nextDueDay} affect upcoming schedule timing.`,
        `Autopay ${previousAutopay ? 'on' : 'off'} → ${nextAutopay ? 'on' : 'off'}.`,
        previousLinkedAccount !== nextLinkedAccount
          ? 'Linked funding account changed, which can affect account-scoped views and payment routing context.'
          : 'Linked funding account is unchanged.',
      ],
    }
  }

  const previousUsedLimit = asNumber(selectedRaw?.usedLimit, 0)
  const nextUsedLimit = asNumber(draft.usedLimit, previousUsedLimit)
  const previousSpendPerMonth = asNumber(selectedRaw?.spendPerMonth, 0)
  const nextSpendPerMonth = asNumber(draft.spendPerMonth, previousSpendPerMonth)
  const previousMinimumPayment = asNumber(selectedRaw?.minimumPayment, 0)
  const nextMinimumPayment = asNumber(draft.minimumPayment, previousMinimumPayment)
  const previousDueDay = asNumber(selectedRaw?.dueDay, 20)
  const nextDueDay = asNumber(draft.dueDay, previousDueDay)
  const deltaLiabilities = nextUsedLimit - previousUsedLimit
  const deltaMonthlyExpenses = nextSpendPerMonth - previousSpendPerMonth
  const nextNetWorth = baselineNetWorth - deltaLiabilities
  const nextMonthlyExpenses = summary.monthlyExpenses + deltaMonthlyExpenses
  const nextMonthlyNet = baselineMonthlyNet - deltaMonthlyExpenses

  return {
    title: 'Linked impact preview',
    description:
      'Preview how this card draft would change liabilities, monthly spend assumptions, and dashboard payment timing.',
    rows: [
      {
        label: 'Liabilities / debt',
        before: money.format(summary.liabilities),
        after: money.format(summary.liabilities + deltaLiabilities),
        delta: signedMoney(deltaLiabilities),
        tone: deltaLiabilities <= 0 ? 'positive' : 'warning',
      },
      {
        label: 'Net worth',
        before: money.format(baselineNetWorth),
        after: money.format(nextNetWorth),
        delta: signedMoney(-deltaLiabilities),
        tone: -deltaLiabilities >= 0 ? 'positive' : 'warning',
      },
      {
        label: 'Monthly spending model',
        before: money.format(summary.monthlyExpenses),
        after: money.format(nextMonthlyExpenses),
        delta: signedMoney(deltaMonthlyExpenses),
        tone: deltaMonthlyExpenses <= 0 ? 'positive' : 'warning',
      },
      {
        label: 'Monthly net',
        before: money.format(baselineMonthlyNet),
        after: money.format(nextMonthlyNet),
        delta: signedMoney(-deltaMonthlyExpenses),
        tone: -deltaMonthlyExpenses >= 0 ? 'positive' : 'warning',
      },
    ],
    notes: [
      `Card due day changes from ${previousDueDay} to ${nextDueDay} affect schedule timing and reminders.`,
      `Minimum payment ${money.format(previousMinimumPayment)} → ${money.format(nextMinimumPayment)} impacts payment-floor planning.`,
    ],
  }
}

function LinkedImpactPreviewCard({ preview }: { preview: LinkedImpactPreview }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/6 p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{preview.title}</p>
          <p className="text-xs text-muted-foreground">{preview.description}</p>
        </div>
        <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
          Before you save
        </Badge>
      </div>

      <div className="space-y-2">
        {preview.rows.map((row) => (
          <div
            key={row.label}
            className="rounded-lg border border-border/60 bg-background/45 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{row.label}</p>
              {row.delta ? (
                <Badge
                  variant="outline"
                  className={cn(
                    row.tone === 'positive' &&
                      'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
                    row.tone === 'warning' &&
                      'border-amber-400/25 bg-amber-500/10 text-amber-200',
                    (!row.tone || row.tone === 'neutral') && 'border-border/70 bg-transparent',
                  )}
                >
                  {row.delta}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.before} → <span className="text-foreground font-medium">{row.after}</span>
            </p>
          </div>
        ))}
      </div>

      {preview.notes.length > 0 ? (
        <div className="mt-3 space-y-1">
          {preview.notes.map((note, index) => (
            <p key={`${note}-${index}`} className="text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CommandActionRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof LayoutGrid
  title: string
  subtitle: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border/70 bg-muted/35 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs">{subtitle}</p>
    </button>
  )
}

function WorkspacePulseStat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof LayoutGrid
  label: string
  value: string
  detail: string
  tone: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            tone === 'positive' && 'text-emerald-300',
            tone === 'warning' && 'text-amber-200',
            tone === 'neutral' && 'text-muted-foreground',
          )}
        />
      </div>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'positive' && 'text-emerald-200',
          tone === 'warning' && 'text-amber-100',
          tone === 'neutral' && 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
