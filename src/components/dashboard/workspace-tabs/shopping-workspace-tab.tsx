import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  parseISO,
} from 'date-fns'
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Calculator,
  CalendarClock,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import type {
  CoreFinanceEditorData,
  DashboardData,
  WorkspaceTabKey,
} from '@/components/dashboard/dashboard-types'
import { createCurrencyFormatters } from '@/lib/currency'
import { cn } from '@/lib/utils'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

import { CoreFinanceOrchestrationPanel } from './core-finance-orchestration-panel'
import {
  CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED,
  matchesCoreFinanceAccountScope,
  summarizeCoreFinanceScope,
  type CoreFinanceAccountScope,
} from './core-finance-coordination'

type PhaseThreeShoppingPlan = {
  enabled: boolean
  unitLabel: string
  quantityPerCycle: number
  cycleInterval: number
  cycleUnit: 'days' | 'weeks' | 'months' | string
  shopsPerCycle: number
  costPerItem: number
  preferredAccountId?: string | null
  anchorDate?: string | null
  stockOnHandUnits?: number
  lowStockThresholdDays?: number
}

type PhaseThreeTemplateSummary = {
  id: string
  name: string
  description: string
  splitCount: number
  currency: string
  defaultCategory: string
  defaultOwnership: string
  createdAt: number
  updatedAt: number
  shoppingPlan?: PhaseThreeShoppingPlan | null
}

type PhaseThreeShoppingWorkspaceData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  sourceKind: string
  purchaseCount: number
  ledgerEntryCount: number
  ledgerLineCount: number
  splitCount: number
  displayCurrency: string
  locale: string
  accountOptions: Array<{ id: string; name: string; type: string }>
  availableCurrencies: Array<{ code: string; name: string }>
  templates: PhaseThreeTemplateSummary[]
  transactions: DashboardData['transactions']
}

type ShoppingPlanDraft = {
  id: string | null
  name: string
  description: string
  currency: string
  category: string
  ownership: string
  unitLabel: string
  quantityPerCycle: string
  cycleInterval: string
  cycleUnit: 'days' | 'weeks' | 'months'
  shopsPerCycle: string
  costPerItem: string
  preferredAccountId: string
  anchorDate: string
  stockOnHandUnits: string
  lowStockThresholdDays: string
  enabled: boolean
}

type ShoppingPlanDerived = {
  quantityPerCycle: number
  cycleInterval: number
  shopsPerCycle: number
  costPerItem: number
  quantityPerShop: number
  costPerShop: number
  monthlyCost: number
  annualCost: number
  monthlyUnits: number
  cycleDaysApprox: number
  dailyUsageUnits: number
  shopIntervalDaysApprox: number
  shopFrequencyLabel: string
  nextShopLabel: string | null
  nextShopEstimated: boolean
  stockOnHandUnits: number
  lowStockThresholdDays: number
  daysLeft: number | null
  runOutLabel: string | null
  stockCoverageTone: 'neutral' | 'positive' | 'warning'
  stockCoverageLabel: string
}

type ShoppingPlanTrendSignals = {
  matchedPostedCount: number
  latestPostedDate: string | null
  previousPostedDate: string | null
  daysSinceLastPurchase: number | null
  currentUnitCost: number | null
  baselineUnitCost: number | null
  priceDriftPct: number | null
  priceDriftAmountPerItem: number | null
  priceDriftTone: 'neutral' | 'positive' | 'warning'
  priceDriftLabel: string
  timingAnomalyTone: 'neutral' | 'positive' | 'warning'
  timingAnomalyLabel: string
}

function relativeTime(value: string) {
  return formatDistanceToNowStrict(parseISO(value), { addSuffix: true })
}

function parseScopedAccountName(
  data: CoreFinanceEditorData | undefined,
  scope: CoreFinanceAccountScope,
) {
  if (!scope.startsWith('account:')) return null
  const accountId = scope.slice('account:'.length)
  if (!accountId) return null
  return data?.accounts.find((row) => row.id === accountId)?.name ?? null
}

function parseScopedAccountId(scope: CoreFinanceAccountScope) {
  if (!scope.startsWith('account:')) return null
  const accountId = scope.slice('account:'.length)
  return accountId || null
}

function matchesShoppingScope(
  row: DashboardData['transactions'][number],
  data: CoreFinanceEditorData | undefined,
  scope: CoreFinanceAccountScope,
) {
  if (scope === 'all') return true
  if (scope === CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED) {
    const normalized = row.account.trim().toLowerCase()
    return (
      normalized === '' ||
      normalized === 'unassigned' ||
      normalized === 'unlinked' ||
      normalized === 'unknown account'
    )
  }
  const scopedAccountName = parseScopedAccountName(data, scope)
  if (!scopedAccountName) return true
  return row.account === scopedAccountName
}

function safeNumber(value: string, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function safePositiveNumber(value: string, fallback = 0) {
  return Math.max(0, safeNumber(value, fallback))
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function cycleUnitLabel(unit: string, amount: number) {
  const normalized = normalizeCycleUnit(unit)
  if (amount === 1) {
    if (normalized === 'days') return 'day'
    if (normalized === 'months') return 'month'
    return 'week'
  }
  return normalized
}

function normalizeCycleUnit(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('day')) return 'days'
  if (normalized.startsWith('month')) return 'months'
  return 'weeks'
}

function monthlyFactor(interval: number, unit: string) {
  const safeInterval = Math.max(1, interval)
  const normalized = normalizeCycleUnit(unit)
  if (normalized === 'days') return 30.4375 / safeInterval
  if (normalized === 'months') return 1 / safeInterval
  return (52 / 12) / safeInterval
}

function cycleLengthDaysApprox(interval: number, unit: string) {
  const safeInterval = Math.max(1, interval)
  const normalized = normalizeCycleUnit(unit)
  if (normalized === 'days') return safeInterval
  if (normalized === 'months') return safeInterval * 30.4375
  return safeInterval * 7
}

function formatShopFrequency(cycleInterval: number, cycleUnit: string, shopsPerCycle: number) {
  const normalizedUnit = normalizeCycleUnit(cycleUnit)
  const safeShops = Math.max(1, shopsPerCycle)
  const exactUnitInterval = cycleInterval / safeShops
  if (Number.isInteger(exactUnitInterval)) {
    return `Every ${exactUnitInterval} ${cycleUnitLabel(normalizedUnit, exactUnitInterval)}`
  }

  const daysApprox =
    normalizedUnit === 'days'
      ? exactUnitInterval
      : normalizedUnit === 'weeks'
        ? exactUnitInterval * 7
        : exactUnitInterval * 30.4375

  const roundedDays = roundMoney(daysApprox)
  return `About every ${roundedDays} days`
}

function nextShopOccurrenceLabel({
  anchorDate,
  fallbackMs,
  cycleInterval,
  cycleUnit,
  shopsPerCycle,
  nowMs,
}: {
  anchorDate: string | null | undefined
  fallbackMs: number
  cycleInterval: number
  cycleUnit: string
  shopsPerCycle: number
  nowMs: number
}) {
  const normalizedUnit = normalizeCycleUnit(cycleUnit)
  const safeShops = Math.max(1, shopsPerCycle)
  const intervalInUnit = cycleInterval / safeShops
  const intervalDaysApprox =
    normalizedUnit === 'days'
      ? intervalInUnit
      : normalizedUnit === 'weeks'
        ? intervalInUnit * 7
        : intervalInUnit * 30.4375

  if (!Number.isFinite(intervalDaysApprox) || intervalDaysApprox <= 0) {
    return { label: null as string | null, estimated: false, intervalDaysApprox: 0 }
  }

  const anchorMs = anchorDate
    ? new Date(`${anchorDate}T09:00:00`).getTime()
    : fallbackMs
  const safeAnchorMs = Number.isFinite(anchorMs) ? anchorMs : fallbackMs
  const intervalMs = intervalDaysApprox * 24 * 60 * 60 * 1000
  let nextMs = safeAnchorMs
  if (nextMs < nowMs) {
    const elapsed = nowMs - nextMs
    const steps = Math.floor(elapsed / intervalMs)
    nextMs = nextMs + steps * intervalMs
    if (nextMs < nowMs) nextMs += intervalMs
  }

  const estimated = normalizedUnit === 'months' || !Number.isInteger(intervalDaysApprox)
  return {
    label: new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(nextMs)),
    estimated,
    intervalDaysApprox,
  }
}

function deriveShoppingPlanMetrics({
  plan,
  nowMs,
  fallbackMs,
}: {
  plan: PhaseThreeShoppingPlan
  nowMs: number
  fallbackMs: number
}): ShoppingPlanDerived {
  const quantityPerCycle = Math.max(0.01, plan.quantityPerCycle)
  const cycleInterval = Math.max(1, Math.trunc(plan.cycleInterval))
  const shopsPerCycle = Math.max(1, Math.trunc(plan.shopsPerCycle))
  const costPerItem = Math.max(0, plan.costPerItem)
  const quantityPerShop = quantityPerCycle / shopsPerCycle
  const costPerShop = quantityPerShop * costPerItem
  const monthlyUnits = quantityPerCycle * monthlyFactor(cycleInterval, plan.cycleUnit)
  const monthlyCost = monthlyUnits * costPerItem
  const annualCost = monthlyCost * 12
  const cycleDaysApprox = cycleLengthDaysApprox(cycleInterval, plan.cycleUnit)
  const dailyUsageUnits = cycleDaysApprox > 0 ? quantityPerCycle / cycleDaysApprox : 0
  const next = nextShopOccurrenceLabel({
    anchorDate: plan.anchorDate,
    fallbackMs,
    cycleInterval,
    cycleUnit: plan.cycleUnit,
    shopsPerCycle,
    nowMs,
  })
  const stockOnHandUnits = Math.max(0, Number(plan.stockOnHandUnits ?? 0))
  const lowStockThresholdDays = Math.max(1, Math.trunc(Number(plan.lowStockThresholdDays ?? 7)))
  const daysLeft =
    dailyUsageUnits > 0 && stockOnHandUnits > 0 ? stockOnHandUnits / dailyUsageUnits : null
  const runOutLabel =
    daysLeft && Number.isFinite(daysLeft)
      ? new Intl.DateTimeFormat(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(nowMs + daysLeft * 24 * 60 * 60 * 1000))
      : null
  const stockCoverageTone: ShoppingPlanDerived['stockCoverageTone'] =
    stockOnHandUnits <= 0
      ? 'warning'
      : daysLeft === null
        ? 'neutral'
        : daysLeft <= Math.max(1, lowStockThresholdDays * 0.5)
          ? 'warning'
          : daysLeft <= lowStockThresholdDays
            ? 'neutral'
            : 'positive'
  const stockCoverageLabel =
    stockOnHandUnits <= 0
      ? 'Out of stock'
      : daysLeft === null
        ? `${roundMoney(stockOnHandUnits)} ${plan.unitLabel} on hand`
        : `${roundMoney(stockOnHandUnits)} ${plan.unitLabel} · ~${roundMoney(daysLeft)} days left`
  return {
    quantityPerCycle,
    cycleInterval,
    shopsPerCycle,
    costPerItem,
    quantityPerShop,
    costPerShop,
    monthlyCost,
    annualCost,
    monthlyUnits,
    cycleDaysApprox,
    dailyUsageUnits,
    shopIntervalDaysApprox: next.intervalDaysApprox,
    shopFrequencyLabel: formatShopFrequency(cycleInterval, plan.cycleUnit, shopsPerCycle),
    nextShopLabel: next.label,
    nextShopEstimated: next.estimated,
    stockOnHandUnits,
    lowStockThresholdDays,
    daysLeft,
    runOutLabel,
    stockCoverageTone,
    stockCoverageLabel,
  }
}

function merchantKey(value: string) {
  return value.trim().toLowerCase()
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function deriveShoppingPlanTrendSignals({
  template,
  derived,
  scopedShoppingRows,
  nowMs,
}: {
  template: PhaseThreeTemplateSummary
  derived: ShoppingPlanDerived
  scopedShoppingRows: DashboardData['transactions']
  nowMs: number
}): ShoppingPlanTrendSignals {
  const key = merchantKey(template.name)
  const matchedPostedRows = scopedShoppingRows
    .filter((row) => row.status === 'posted' && merchantKey(row.merchant) === key)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))

  const latest = matchedPostedRows[0]
  const previous = matchedPostedRows[1]
  const quantityPerShop = Math.max(0.01, derived.quantityPerShop)
  const currentUnitCost = latest ? Math.abs(latest.amount) / quantityPerShop : null
  const baselineSamples = matchedPostedRows
    .slice(1, 7)
    .map((row) => Math.abs(row.amount) / quantityPerShop)
    .filter((value) => Number.isFinite(value) && value > 0)
  const baselineUnitCost = median(baselineSamples) ?? derived.costPerItem
  const priceDriftAmountPerItem =
    currentUnitCost !== null && baselineUnitCost > 0 ? currentUnitCost - baselineUnitCost : null
  const priceDriftPct =
    priceDriftAmountPerItem !== null && baselineUnitCost > 0
      ? priceDriftAmountPerItem / baselineUnitCost
      : null
  const priceDriftTone: ShoppingPlanTrendSignals['priceDriftTone'] =
    priceDriftPct === null
      ? 'neutral'
      : priceDriftPct >= 0.08
        ? 'warning'
        : priceDriftPct <= -0.08
          ? 'positive'
          : 'neutral'
  const priceDriftLabel =
    priceDriftPct === null
      ? 'No posted history yet'
      : `${priceDriftPct >= 0 ? '+' : ''}${(priceDriftPct * 100).toFixed(1)}% vs baseline`

  const latestMs = latest ? parseISO(latest.date).getTime() : null
  const previousMs = previous ? parseISO(previous.date).getTime() : null
  const daysSinceLastPurchase =
    latestMs && Number.isFinite(latestMs)
      ? Math.max(0, differenceInCalendarDays(new Date(nowMs), new Date(latestMs)))
      : null
  const intervalDays =
    latestMs && previousMs && Number.isFinite(latestMs) && Number.isFinite(previousMs)
      ? Math.abs(differenceInCalendarDays(new Date(latestMs), new Date(previousMs)))
      : null
  const expectedInterval = Math.max(1, derived.shopIntervalDaysApprox || 0)
  const timingRatio = intervalDays !== null ? intervalDays / expectedInterval : null
  const timingAnomalyTone: ShoppingPlanTrendSignals['timingAnomalyTone'] =
    timingRatio === null
      ? 'neutral'
      : timingRatio < 0.65 || timingRatio > 1.35
        ? 'warning'
        : 'positive'
  const timingAnomalyLabel =
    timingRatio === null
      ? 'Need at least 2 posted shops'
      : timingRatio < 0.65
        ? `Early by ~${Math.round(expectedInterval - intervalDays!)} days vs cadence`
        : timingRatio > 1.35
          ? `Late by ~${Math.round(intervalDays! - expectedInterval)} days vs cadence`
          : 'On cadence'

  return {
    matchedPostedCount: matchedPostedRows.length,
    latestPostedDate: latest?.date ?? null,
    previousPostedDate: previous?.date ?? null,
    daysSinceLastPurchase,
    currentUnitCost,
    baselineUnitCost,
    priceDriftPct,
    priceDriftAmountPerItem,
    priceDriftTone,
    priceDriftLabel,
    timingAnomalyTone,
    timingAnomalyLabel,
  }
}

function buildDefaultShoppingPlanDraft(
  workspaceCurrency: string,
  accountScope: CoreFinanceAccountScope,
): ShoppingPlanDraft {
  return {
    id: null,
    name: '',
    description: '',
    currency: workspaceCurrency,
    category: 'Shopping',
    ownership: 'personal',
    unitLabel: 'items',
    quantityPerCycle: '1',
    cycleInterval: '2',
    cycleUnit: 'weeks',
    shopsPerCycle: '1',
    costPerItem: '',
    preferredAccountId: parseScopedAccountId(accountScope) ?? '',
    anchorDate: '',
    stockOnHandUnits: '',
    lowStockThresholdDays: '7',
    enabled: true,
  }
}

function draftFromTemplate(
  template: PhaseThreeTemplateSummary,
  workspaceCurrency: string,
): ShoppingPlanDraft {
  const plan = template.shoppingPlan
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? '',
    currency: template.currency || workspaceCurrency,
    category: template.defaultCategory || 'Shopping',
    ownership: template.defaultOwnership || 'personal',
    unitLabel: plan?.unitLabel || 'items',
    quantityPerCycle: String(plan?.quantityPerCycle ?? 1),
    cycleInterval: String(plan?.cycleInterval ?? 2),
    cycleUnit: (normalizeCycleUnit(plan?.cycleUnit ?? 'weeks') as 'days' | 'weeks' | 'months'),
    shopsPerCycle: String(plan?.shopsPerCycle ?? 1),
    costPerItem: String(plan?.costPerItem ?? ''),
    preferredAccountId: plan?.preferredAccountId ?? '',
    anchorDate: plan?.anchorDate ?? '',
    stockOnHandUnits:
      plan?.stockOnHandUnits !== undefined ? String(plan.stockOnHandUnits) : '',
    lowStockThresholdDays: String(plan?.lowStockThresholdDays ?? 7),
    enabled: plan?.enabled !== false,
  }
}

function deriveShoppingPlanMetricsFromDraft(draft: ShoppingPlanDraft, nowMs: number) {
  const plan: PhaseThreeShoppingPlan = {
    enabled: draft.enabled,
    unitLabel: draft.unitLabel.trim() || 'items',
    quantityPerCycle: Math.max(0.01, safePositiveNumber(draft.quantityPerCycle, 1)),
    cycleInterval: Math.max(1, Math.trunc(safePositiveNumber(draft.cycleInterval, 1))),
    cycleUnit: normalizeCycleUnit(draft.cycleUnit),
    shopsPerCycle: Math.max(1, Math.trunc(safePositiveNumber(draft.shopsPerCycle, 1))),
    costPerItem: Math.max(0, safePositiveNumber(draft.costPerItem, 0)),
    preferredAccountId: draft.preferredAccountId || null,
    anchorDate: draft.anchorDate || null,
    stockOnHandUnits: Math.max(0, safePositiveNumber(draft.stockOnHandUnits, 0)),
    lowStockThresholdDays: Math.max(1, Math.trunc(safePositiveNumber(draft.lowStockThresholdDays, 7))),
  }

  return deriveShoppingPlanMetrics({
    plan,
    nowMs,
    fallbackMs: nowMs,
  })
}

export function ShoppingWorkspaceTab({
  data,
  displayCurrency,
  displayLocale,
  accountScope,
  onAccountScopeChange,
  onNavigateTab,
  onPostPurchase,
  onPostPurchaseTemplate,
}: {
  data: CoreFinanceEditorData | undefined
  displayCurrency: string
  displayLocale: string
  accountScope: CoreFinanceAccountScope
  onAccountScopeChange: (next: CoreFinanceAccountScope) => void
  onNavigateTab: (tab: WorkspaceTabKey) => void
  onPostPurchase: () => void
  onPostPurchaseTemplate: (templateId: string) => void
}) {
  // Phase 3 backend functions are added dynamically before local codegen refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phaseThreeWorkspace = useQuery((api as any).dashboard.getPhaseThreePurchaseWorkspace, {
    displayCurrency,
    locale: displayLocale,
    limit: 180,
  }) as PhaseThreeShoppingWorkspaceData | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertPurchaseSplitTemplate = useMutation((api as any).dashboard.upsertPurchaseSplitTemplate)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deletePurchaseSplitTemplate = useMutation((api as any).dashboard.deletePurchaseSplitTemplate)

  const workspaceCurrency = phaseThreeWorkspace?.displayCurrency ?? displayCurrency
  const money = createCurrencyFormatters(displayLocale, workspaceCurrency).money
  const scopedCashflow = summarizeCoreFinanceScope(data, accountScope)
  const [nowMs] = useState(() => Date.now())
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [isSavingPlan, setIsSavingPlan] = useState(false)
  const [planDeleteId, setPlanDeleteId] = useState<string | null>(null)
  const [planDraft, setPlanDraft] = useState<ShoppingPlanDraft>(() =>
    buildDefaultShoppingPlanDraft(workspaceCurrency, accountScope),
  )
  const [errandMode, setErrandMode] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('finance-shopping-errand-mode') === 'true'
    } catch {
      return false
    }
  })
  const [errandCounts, setErrandCounts] = useState<Record<string, number>>({})

  const ledgerRows = phaseThreeWorkspace?.transactions ?? []
  const shoppingRows = ledgerRows.filter((row) => row.type === 'expense')
  const scopedShoppingRows = shoppingRows.filter((row) =>
    matchesShoppingScope(row, data, accountScope),
  )
  const thirtyDayWindowMs = 30 * 24 * 60 * 60 * 1000
  const thirtyDaySpend = scopedShoppingRows.reduce((sum, row) => {
    const rowMs = parseISO(row.date).getTime()
    if (Number.isNaN(rowMs) || rowMs < nowMs - thirtyDayWindowMs) return sum
    return sum + Math.abs(row.amount)
  }, 0)
  const totalSpend = scopedShoppingRows.reduce((sum, row) => sum + Math.abs(row.amount), 0)
  const averagePurchase = scopedShoppingRows.length > 0 ? totalSpend / scopedShoppingRows.length : 0
  const pendingShoppingCount = scopedShoppingRows.filter((row) => row.status === 'pending').length

  const templateRows = phaseThreeWorkspace?.templates ?? []
  const recurringPlanRows = templateRows
    .filter((template) => template.shoppingPlan)
    .map((template) => ({
      template,
      plan: template.shoppingPlan!,
      derived: deriveShoppingPlanMetrics({
        plan: template.shoppingPlan!,
        nowMs,
        fallbackMs: template.updatedAt || template.createdAt || nowMs,
      }),
    }))
    .map((row) => ({
      ...row,
      signals: deriveShoppingPlanTrendSignals({
        template: row.template,
        derived: row.derived,
        scopedShoppingRows,
        nowMs,
      }),
    }))
    .sort((a, b) => b.derived.monthlyCost - a.derived.monthlyCost)

  const scopedRecurringPlans = recurringPlanRows.filter(({ plan }) =>
    matchesCoreFinanceAccountScope(accountScope, plan.preferredAccountId),
  )
  const enabledScopedRecurringPlans = scopedRecurringPlans.filter(({ plan }) => plan.enabled !== false)
  const errandPlanRows = enabledScopedRecurringPlans.map((row) => ({
    ...row,
    quantity: Math.max(0, Math.trunc(errandCounts[row.template.id] ?? 0)),
  }))
  const errandSelectedRows = errandPlanRows.filter((row) => row.quantity > 0)
  const errandItemCount = errandSelectedRows.reduce((sum, row) => sum + row.quantity, 0)
  const errandEstimatedSpend = errandSelectedRows.reduce(
    (sum, row) => sum + row.derived.costPerShop * row.quantity,
    0,
  )

  const plannedMonthlySpend = enabledScopedRecurringPlans.reduce(
    (sum, row) => sum + row.derived.monthlyCost,
    0,
  )
  const plannedAnnualSpend = enabledScopedRecurringPlans.reduce(
    (sum, row) => sum + row.derived.annualCost,
    0,
  )
  const plannedPerShopTotal = enabledScopedRecurringPlans.reduce(
    (sum, row) => sum + row.derived.costPerShop,
    0,
  )
  const plannedMonthlyVariance = thirtyDaySpend - plannedMonthlySpend
  const lowStockPlansCount = enabledScopedRecurringPlans.filter(
    (row) => row.derived.stockCoverageTone === 'warning',
  ).length
  const priceDriftAlertCount = enabledScopedRecurringPlans.filter(
    (row) => row.signals.priceDriftPct !== null && Math.abs(row.signals.priceDriftPct) >= 0.08,
  ).length
  const cadenceAnomalyCount = enabledScopedRecurringPlans.filter(
    (row) => row.signals.timingAnomalyTone === 'warning',
  ).length

  const recurringMerchantKeys = new Set(
    scopedRecurringPlans.map((row) => merchantKey(row.template.name)),
  )
  const consumableShoppingRows = scopedShoppingRows.filter((row) =>
    recurringMerchantKeys.has(merchantKey(row.merchant)),
  )
  const adHocShoppingRows = scopedShoppingRows.filter(
    (row) => !recurringMerchantKeys.has(merchantKey(row.merchant)),
  )
  const adHocCategoryTotals = Array.from(
    adHocShoppingRows.reduce((map, row) => {
      map.set(row.category, (map.get(row.category) ?? 0) + Math.abs(row.amount))
      return map
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const adHocPaymentSourceTotals = Array.from(
    adHocShoppingRows.reduce((map, row) => {
      map.set(row.account, (map.get(row.account) ?? 0) + Math.abs(row.amount))
      return map
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const adHocThirtyDaySpend = adHocShoppingRows.reduce((sum, row) => {
    const rowMs = parseISO(row.date).getTime()
    if (Number.isNaN(rowMs) || rowMs < nowMs - thirtyDayWindowMs) return sum
    return sum + Math.abs(row.amount)
  }, 0)
  const consumableThirtyDaySpend = consumableShoppingRows.reduce((sum, row) => {
    const rowMs = parseISO(row.date).getTime()
    if (Number.isNaN(rowMs) || rowMs < nowMs - thirtyDayWindowMs) return sum
    return sum + Math.abs(row.amount)
  }, 0)
  const householdConsumablePlans = scopedRecurringPlans.filter((row) =>
    ['household', 'shared'].includes((row.template.defaultOwnership || '').toLowerCase()),
  )
  const personalConsumablePlans = scopedRecurringPlans.filter(
    (row) => !householdConsumablePlans.some((householdRow) => householdRow.template.id === row.template.id),
  )

  const templateRowsWithoutPlan = templateRows.filter((row) => !row.shoppingPlan)

  const sourceKind = phaseThreeWorkspace?.sourceKind ?? 'empty'
  const usingRealLedger = sourceKind === 'real-ledger'

  const planDraftDerived = deriveShoppingPlanMetricsFromDraft(planDraft, nowMs)

  useEffect(() => {
    try {
      window.localStorage.setItem('finance-shopping-errand-mode', errandMode ? 'true' : 'false')
    } catch {
      // Ignore storage access failures.
    }
  }, [errandMode])

  useEffect(() => {
    const validTemplateIds = new Set(enabledScopedRecurringPlans.map((row) => row.template.id))
    setErrandCounts((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([templateId, qty]) => validTemplateIds.has(templateId) && qty > 0),
      )
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
    })
  }, [enabledScopedRecurringPlans])

  const openNewPlanDialog = () => {
    setPlanDraft(buildDefaultShoppingPlanDraft(workspaceCurrency, accountScope))
    setPlanDialogOpen(true)
  }

  const openEditPlanDialog = (template: PhaseThreeTemplateSummary) => {
    setPlanDraft(draftFromTemplate(template, workspaceCurrency))
    setPlanDialogOpen(true)
  }

  const handleSavePlan = async () => {
    const name = planDraft.name.trim()
    if (!name) {
      toast.error('Item name is required')
      return
    }

    if (planDraftDerived.costPerItem <= 0) {
      toast.error('Cost per item must be greater than 0')
      return
    }

    if (planDraftDerived.costPerShop <= 0) {
      toast.error('Cost per shop must be greater than 0')
      return
    }

    setIsSavingPlan(true)
    try {
      const linkedAccountId = planDraft.preferredAccountId.trim()
      const payload = {
        id: planDraft.id ?? undefined,
        name,
        description: planDraft.description.trim() || undefined,
        currency: (planDraft.currency || workspaceCurrency).toUpperCase(),
        defaultCategory: planDraft.category.trim() || 'Shopping',
        defaultOwnership: planDraft.ownership,
        splits: [
          {
            label: `${name} purchase`,
            amount: roundMoney(planDraftDerived.costPerShop),
            category: planDraft.category.trim() || 'Shopping',
            ownership: planDraft.ownership,
            ...(linkedAccountId ? { linkedAccountId } : {}),
          },
        ],
        shoppingPlan: {
          enabled: planDraft.enabled,
          unitLabel: planDraft.unitLabel.trim() || 'items',
          quantityPerCycle: roundMoney(planDraftDerived.quantityPerCycle),
          cycleInterval: Math.max(1, Math.trunc(planDraftDerived.cycleInterval)),
          cycleUnit: normalizeCycleUnit(planDraft.cycleUnit),
          shopsPerCycle: Math.max(1, Math.trunc(planDraftDerived.shopsPerCycle)),
          costPerItem: roundMoney(planDraftDerived.costPerItem),
          ...(linkedAccountId ? { preferredAccountId: linkedAccountId } : {}),
          ...(planDraft.anchorDate ? { anchorDate: planDraft.anchorDate } : {}),
          stockOnHandUnits: roundMoney(planDraftDerived.stockOnHandUnits),
          lowStockThresholdDays: Math.max(1, Math.trunc(planDraftDerived.lowStockThresholdDays)),
        },
      }

      const result = await upsertPurchaseSplitTemplate(payload)
      toast.success(planDraft.id ? 'Recurring shopping plan updated' : 'Recurring shopping plan added', {
        description: `${result.name} · ${money.format(planDraftDerived.costPerShop)} / shop · ${money.format(planDraftDerived.monthlyCost)} / month · ${money.format(planDraftDerived.annualCost)} / year`,
      })
      setPlanDialogOpen(false)
    } catch (error) {
      console.error('Failed to save recurring shopping plan', error)
      toast.error('Could not save shopping plan', {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setIsSavingPlan(false)
    }
  }

  const handleDeletePlan = async (templateId: string, templateName: string) => {
    if (!window.confirm(`Delete recurring shopping plan "${templateName}"? This removes the linked split template too.`)) {
      return
    }
    setPlanDeleteId(templateId)
    try {
      await deletePurchaseSplitTemplate({ id: templateId })
      toast.success('Recurring shopping plan deleted', {
        description: templateName,
      })
    } catch (error) {
      console.error('Failed to delete recurring shopping plan', error)
      toast.error('Could not delete shopping plan', {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPlanDeleteId(null)
    }
  }

  const incrementErrandItem = (templateId: string) => {
    setErrandCounts((prev) => ({
      ...prev,
      [templateId]: Math.max(0, (prev[templateId] ?? 0) + 1),
    }))
  }

  const decrementErrandItem = (templateId: string) => {
    setErrandCounts((prev) => {
      const next = Math.max(0, (prev[templateId] ?? 0) - 1)
      if (!next) {
        return Object.fromEntries(
          Object.entries(prev).filter(([id]) => id !== templateId),
        )
      }
      return {
        ...prev,
        [templateId]: next,
      }
    })
  }

  const clearErrandItems = () => {
    setErrandCounts({})
  }

  const handlePostErrandSelection = () => {
    if (errandSelectedRows.length === 0) {
      toast.error('Add at least one planned item to errand cart')
      return
    }
    const primary = errandSelectedRows[0]!
    onPostPurchaseTemplate(primary.template.id)
    toast.success(
      errandSelectedRows.length > 1
        ? `Opened ${primary.template.name}. ${errandSelectedRows.length - 1} more items remain in errand cart.`
        : `Opened ${primary.template.name} purchase composer.`,
    )
  }

  const renderRecurringPlanCard = (row: (typeof scopedRecurringPlans)[number]) => {
    const { template, plan, derived, signals } = row
    const quantityPerShopRounded = roundMoney(derived.quantityPerShop)
    const preferredAccountName = plan.preferredAccountId
      ? (phaseThreeWorkspace?.accountOptions ?? []).find(
          (account) => account.id === plan.preferredAccountId,
        )?.name ?? 'Linked account'
      : null
    const planMoney = createCurrencyFormatters(
      displayLocale,
      template.currency || workspaceCurrency,
    ).money
    const isHousehold = ['household', 'shared'].includes(
      (template.defaultOwnership || '').toLowerCase(),
    )

    return (
      <div
        key={template.id}
        className={cn(
          'rounded-2xl border p-4',
          plan.enabled !== false
            ? 'border-border/60 bg-background/45'
            : 'border-border/40 bg-background/25 opacity-80',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold">{template.name}</p>
              <Badge
                variant="outline"
                className={cn(
                  'h-5 px-1.5 text-[10px]',
                  plan.enabled !== false
                    ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-200'
                    : 'border-border/60 bg-transparent text-muted-foreground',
                )}
              >
                {plan.enabled !== false ? 'Mini subscription' : 'Paused'}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'h-5 px-1.5 text-[10px]',
                  isHousehold
                    ? 'border-sky-400/20 bg-sky-500/10 text-sky-200'
                    : 'border-border/70 bg-transparent',
                )}
              >
                {isHousehold ? 'Household consumable' : 'Personal consumable'}
              </Badge>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {template.currency}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {roundMoney(derived.quantityPerCycle)} {plan.unitLabel} every {derived.cycleInterval}{' '}
              {cycleUnitLabel(plan.cycleUnit, derived.cycleInterval)} · {derived.shopsPerCycle}{' '}
              shops/cycle · {derived.shopFrequencyLabel}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {quantityPerShopRounded} {plan.unitLabel} per shop · Cost/item{' '}
              {planMoney.format(derived.costPerItem)}
            </p>
            {preferredAccountName ? (
              <p className="text-muted-foreground mt-1 text-[11px]">
                Funding account: {preferredAccountName}
              </p>
            ) : null}
            {template.defaultCategory ? (
              <p className="text-muted-foreground mt-1 text-[11px]">
                <Tag className="mr-1 inline h-3 w-3" />
                {template.defaultCategory} · {template.defaultOwnership}
              </p>
            ) : null}
            {derived.nextShopLabel ? (
              <p className="text-muted-foreground mt-1 text-[11px]">
                Next shop {derived.nextShopEstimated ? '(est.) ' : ''}
                {derived.nextShopLabel}
              </p>
            ) : null}
            {signals.latestPostedDate ? (
              <p className="text-muted-foreground mt-1 text-[11px]">
                Last posted {format(parseISO(signals.latestPostedDate), 'MMM d, yyyy')}
                {signals.daysSinceLastPurchase !== null
                  ? ` · ${signals.daysSinceLastPurchase} day${
                      signals.daysSinceLastPurchase === 1 ? '' : 's'
                    } ago`
                  : ''}
              </p>
            ) : null}
          </div>
          <div className="min-w-[10rem] text-right">
            <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Cost / shop</p>
            <p className="mt-1 font-mono text-base font-semibold tabular-nums">
              {planMoney.format(derived.costPerShop)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {planMoney.format(derived.monthlyCost)} / month
            </p>
            <p className="text-muted-foreground text-xs">
              {planMoney.format(derived.annualCost)} / year
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactSignalBlock
            label="Stock coverage"
            value={derived.stockCoverageLabel}
            tone={derived.stockCoverageTone}
            detail={
              derived.runOutLabel
                ? `Run-out est. ${derived.runOutLabel} · threshold ${derived.lowStockThresholdDays}d`
                : `Set stock on hand to track days left and run-out date`
            }
          />
          <CompactSignalBlock
            label="Price drift"
            value={signals.priceDriftLabel}
            tone={signals.priceDriftTone}
            detail={
              signals.currentUnitCost !== null
                ? `Current ${planMoney.format(signals.currentUnitCost)} / ${
                    plan.unitLabel || 'item'
                  } · baseline ${planMoney.format(signals.baselineUnitCost ?? derived.costPerItem)}`
                : 'Post purchases using this plan to establish a price baseline'
            }
            icon={signals.priceDriftPct !== null && signals.priceDriftPct < 0 ? TrendingDown : TrendingUp}
          />
          <CompactSignalBlock
            label="Cadence pattern"
            value={signals.timingAnomalyLabel}
            tone={signals.timingAnomalyTone}
            detail={`Expected about every ${Math.max(1, Math.round(derived.shopIntervalDaysApprox))} days`}
            icon={CalendarClock}
          />
          <CompactSignalBlock
            label="Cost model"
            value={`${roundMoney(derived.monthlyUnits)} ${plan.unitLabel} / mo`}
            tone="neutral"
            detail={`${planMoney.format(derived.costPerItem)} / item · ${planMoney.format(
              derived.costPerShop,
            )} / shop`}
            icon={Calculator}
          />
        </div>

        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/6 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">What if I skip this purchase?</p>
            <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
              Quick impact
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <PreviewMetric
              label="Cash kept now"
              value={planMoney.format(derived.costPerShop)}
              tone="positive"
            />
            <PreviewMetric
              label="Month impact (one skip)"
              value={`-${planMoney.format(
                Math.min(derived.costPerShop, Math.max(0, derived.monthlyCost)),
              )}`}
              tone="positive"
            />
            <PreviewMetric
              label="Year if repeated"
              value={planMoney.format(
                derived.shopsPerCycle > 0 ? derived.annualCost / derived.shopsPerCycle : 0,
              )}
              tone="neutral"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            One-time skip keeps {planMoney.format(derived.costPerShop)} in this cycle. Repeating one
            skipped shop every cycle would reduce annual spend by roughly{' '}
            {planMoney.format(derived.shopsPerCycle > 0 ? derived.annualCost / derived.shopsPerCycle : 0)}.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onPostPurchaseTemplate(template.id)}>
            <ReceiptText className="h-4 w-4" />
            Post planned shop
          </Button>
          <Button size="sm" variant="outline" onClick={() => openEditPlanDialog(template)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => void handleDeletePlan(template.id, template.name)}
            disabled={planDeleteId === template.id}
          >
            <Trash2 className="h-4 w-4" />
            {planDeleteId === template.id ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4">
        <CoreFinanceOrchestrationPanel
          data={data}
          displayCurrency={displayCurrency}
          displayLocale={displayLocale}
          accountScope={accountScope}
          onAccountScopeChange={onAccountScopeChange}
          currentTab="shopping"
          onNavigateTab={onNavigateTab}
        />

        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                    <ReceiptText className="h-3.5 w-3.5" />
                    Shopping
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'bg-transparent',
                      usingRealLedger
                        ? 'border-emerald-400/25 text-emerald-300'
                        : 'border-amber-400/25 text-amber-300',
                    )}
                  >
                    {usingRealLedger ? 'Real purchase ledger' : 'No posted purchases yet'}
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-transparent">
                    {workspaceCurrency} display
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-base">
                  Shopping operations, mini subscriptions, and ledger-linked purchase execution
                </CardTitle>
                <CardDescription>
                  Treat recurring consumables like mini subscriptions (tobacco, pet food, meds,
                  staples), then track price drift, stock coverage, and cadence anomalies alongside
                  ad-hoc shopping.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setErrandMode((value) => !value)}
                  variant={errandMode ? 'default' : 'outline'}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {errandMode ? 'Errand mode on' : 'Errand mode'}
                </Button>
                <Button onClick={openNewPlanDialog} variant="outline">
                  <Calculator className="h-4 w-4" />
                  Add recurring item
                </Button>
                <Button onClick={onPostPurchase}>
                  <Plus className="h-4 w-4" />
                  Post purchase
                </Button>
                <Button variant="outline" onClick={() => onNavigateTab('transactions')}>
                  <ArrowRightLeft className="h-4 w-4" />
                  Open ledger
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-8">
              <MiniStat
                label={`Scoped spend (${scopedCashflow.scopeLabel})`}
                value={money.format(totalSpend)}
                tone={totalSpend > 0 ? 'warning' : 'neutral'}
              />
              <MiniStat
                label="Last 30 days"
                value={money.format(thirtyDaySpend)}
                tone={thirtyDaySpend > 0 ? 'warning' : 'neutral'}
              />
              <MiniStat
                label="Average purchase"
                value={scopedShoppingRows.length ? money.format(averagePurchase) : 'No purchases'}
              />
              <MiniStat
                label="Planned / shop"
                value={enabledScopedRecurringPlans.length ? money.format(plannedPerShopTotal) : 'No plans'}
                tone={enabledScopedRecurringPlans.length ? 'positive' : 'neutral'}
              />
              <MiniStat
                label="Planned / month"
                value={enabledScopedRecurringPlans.length ? money.format(plannedMonthlySpend) : 'No plans'}
                tone={enabledScopedRecurringPlans.length ? 'positive' : 'neutral'}
              />
              <MiniStat
                label="Planned / year"
                value={enabledScopedRecurringPlans.length ? money.format(plannedAnnualSpend) : 'No plans'}
                tone={enabledScopedRecurringPlans.length ? 'positive' : 'neutral'}
              />
              <MiniStat
                label="Ad-hoc (30d)"
                value={money.format(adHocThirtyDaySpend)}
                tone={adHocThirtyDaySpend > 0 ? 'warning' : 'neutral'}
              />
              <MiniStat
                label="Consumable alerts"
                value={`${lowStockPlansCount + priceDriftAlertCount + cadenceAnomalyCount}`}
                tone={
                  lowStockPlansCount + priceDriftAlertCount + cadenceAnomalyCount > 0
                    ? 'warning'
                    : 'positive'
                }
              />
              <MiniStat
                label="Recurring plans"
                value={`${enabledScopedRecurringPlans.length}/${scopedRecurringPlans.length}`}
                tone={enabledScopedRecurringPlans.length > 0 ? 'positive' : 'neutral'}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {phaseThreeWorkspace?.purchaseCount ?? 0} purchases
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {phaseThreeWorkspace?.ledgerEntryCount ?? 0} ledger entries
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {phaseThreeWorkspace?.splitCount ?? 0} purchase splits
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-border/70 bg-transparent',
                  pendingShoppingCount > 0 && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                )}
              >
                {pendingShoppingCount} pending shopping rows
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-border/70 bg-transparent',
                  enabledScopedRecurringPlans.length > 0 &&
                    'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
                )}
              >
                Plan vs 30d variance {money.format(plannedMonthlyVariance)}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-border/70 bg-transparent',
                  lowStockPlansCount > 0 && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
                )}
              >
                {lowStockPlansCount} low-stock plan{lowStockPlansCount === 1 ? '' : 's'}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-border/70 bg-transparent',
                  priceDriftAlertCount > 0 &&
                    'border-amber-500/30 bg-amber-500/10 text-amber-200',
                )}
              >
                {priceDriftAlertCount} price drift alert{priceDriftAlertCount === 1 ? '' : 's'}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-border/70 bg-transparent',
                  cadenceAnomalyCount > 0 &&
                    'border-amber-500/30 bg-amber-500/10 text-amber-200',
                )}
              >
                {cadenceAnomalyCount} cadence anomal{cadenceAnomalyCount === 1 ? 'y' : 'ies'}
              </Badge>
              {errandMode ? (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  Errand mode active
                </Badge>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        {errandMode ? (
          <Card className="finance-panel border-primary/30 bg-primary/8 shadow-none">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Errand Mode</CardTitle>
                <Badge variant="outline" className="border-primary/30 bg-primary/12 text-primary">
                  Distraction-free
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-background/50">
                  {errandItemCount} item{errandItemCount === 1 ? '' : 's'}
                </Badge>
              </div>
              <CardDescription>
                Large-touch shopping trip mode with only planned consumables, running totals, and
                quick posting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <MiniStat
                  label="Selected items"
                  value={String(errandItemCount)}
                  tone={errandItemCount > 0 ? 'positive' : 'neutral'}
                />
                <MiniStat
                  label="Estimated trip spend"
                  value={money.format(errandEstimatedSpend)}
                  tone={errandEstimatedSpend > 0 ? 'warning' : 'neutral'}
                />
                <MiniStat
                  label="Plans available"
                  value={String(enabledScopedRecurringPlans.length)}
                  tone={enabledScopedRecurringPlans.length > 0 ? 'positive' : 'neutral'}
                />
              </div>

              <div className="grid gap-2 xl:grid-cols-2">
                {errandPlanRows.length > 0 ? (
                  errandPlanRows.map((row) => (
                    <div
                      key={`errand-${row.template.id}`}
                      className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{row.template.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {money.format(row.derived.costPerShop)} / planned shop
                          </p>
                        </div>
                        <Badge variant="outline" className="border-border/70 bg-transparent tabular-nums">
                          x{row.quantity}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => decrementErrandItem(row.template.id)}
                        >
                          <Minus className="h-4 w-4" />
                          <span className="sr-only">Decrease</span>
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => incrementErrandItem(row.template.id)}
                        >
                          <Plus className="h-4 w-4" />
                          <span className="sr-only">Increase</span>
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          est. {money.format(row.derived.costPerShop * row.quantity)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-4 text-xs text-muted-foreground xl:col-span-2">
                    Add recurring consumable plans to use Errand Mode.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handlePostErrandSelection}>
                  <ReceiptText className="h-4 w-4" />
                  Post selected item
                </Button>
                <Button size="sm" variant="outline" onClick={clearErrandItems}>
                  Clear trip
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setErrandMode(false)}
                >
                  Exit errand mode
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className={cn('finance-panel border-border/60 bg-card/35 shadow-none', errandMode && 'hidden')}>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Recurring Shopping Planner
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-transparent">
                    {scopedRecurringPlans.length} scoped plans
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-base">
                  Plan item quantities and split them across your shops
                </CardTitle>
                <CardDescription>
                  Example: 4 tobaccos every 4 weeks with 2 shops per cycle becomes 2 per shop every
                  2 weeks. The planner calculates cost per shop and monthly spend automatically.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={openNewPlanDialog}>
                  <Plus className="h-4 w-4" />
                  New recurring item
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {phaseThreeWorkspace?.viewerAuthenticated === false ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-3 text-xs text-muted-foreground">
                Convex backend auth is inactive. Sign in again after confirming the Clerk JWT template
                `convex`.
              </div>
            ) : scopedRecurringPlans.length > 0 ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-background/35 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Household Consumables</p>
                      <p className="text-xs text-muted-foreground">
                        Shared/household recurring items tracked like mini subscriptions.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-border/70 bg-transparent">
                      {householdConsumablePlans.length} plan
                      {householdConsumablePlans.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  {householdConsumablePlans.length > 0 ? (
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      {householdConsumablePlans.map(renderRecurringPlanCard)}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No household/shared consumable plans in this account scope yet. Set ownership to
                      `household` or `shared` when creating a recurring item.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-background/35 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Personal & Other Consumables</p>
                      <p className="text-xs text-muted-foreground">
                        Personal or non-household recurring items kept separate from ad-hoc shopping.
                      </p>
                    </div>
                    <Badge variant="outline" className="border-border/70 bg-transparent">
                      {personalConsumablePlans.length} plan
                      {personalConsumablePlans.length === 1 ? '' : 's'}
                    </Badge>
                  </div>
                  {personalConsumablePlans.length > 0 ? (
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                      {personalConsumablePlans.map(renderRecurringPlanCard)}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No personal/other consumable plans in this scope yet.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/35">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">No recurring shopping plans yet</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add items like tobacco, groceries, or household supplies and let the app derive
                  cost per shop and monthly spend from quantity and cadence.
                </p>
                <Button className="mt-4" size="sm" onClick={openNewPlanDialog}>
                  <Plus className="h-4 w-4" />
                  Add recurring item
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className={cn('grid gap-4 xl:grid-cols-[1.35fr_1fr]', errandMode && 'hidden')}>
          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Ad-hoc shopping activity</CardTitle>
                <Badge variant="outline" className="border-border/70 bg-transparent">
                  {adHocShoppingRows.length} ad-hoc row{adHocShoppingRows.length === 1 ? '' : 's'}
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-transparent">
                  {consumableShoppingRows.length} consumable row
                  {consumableShoppingRows.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <CardDescription>
                One-off or non-plan purchases, kept separate from recurring household consumables.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {phaseThreeWorkspace?.viewerAuthenticated === false ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-3 text-xs text-muted-foreground">
                  Convex backend auth is inactive. Sign in again after confirming the Clerk JWT
                  template `convex`.
                </div>
              ) : adHocShoppingRows.length > 0 ? (
                <ScrollArea className="h-[28rem] rounded-xl border border-border/50 bg-background/55">
                  <div className="space-y-2 p-2">
                    {adHocShoppingRows.slice(0, 40).map((row) => (
                      <div
                        key={row.id}
                        className="rounded-xl border border-border/50 bg-card/35 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium">{row.merchant}</p>
                              <Badge
                                variant={row.status === 'pending' ? 'secondary' : 'outline'}
                                className={cn(
                                  'h-5 px-1.5 text-[10px]',
                                  row.status === 'pending' &&
                                    'bg-amber-500/15 text-amber-200',
                                  row.status === 'posted' &&
                                    'border-emerald-400/20 bg-emerald-500/8 text-emerald-200',
                                )}
                              >
                                {row.status}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs">
                              {row.category} · {row.account}
                            </p>
                            <p className="text-muted-foreground mt-1 text-xs break-words">
                              {row.note}
                            </p>
                            <p className="text-muted-foreground mt-1 text-[11px]">
                              {format(parseISO(row.date), 'MMM d, yyyy')} · {relativeTime(row.date)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm font-semibold text-rose-300 tabular-nums">
                              {money.format(Math.abs(row.amount))}
                            </p>
                            {row.originalCurrency &&
                            row.originalCurrency !== workspaceCurrency &&
                            row.originalAmount !== undefined ? (
                              <p className="text-muted-foreground mt-1 text-[11px]">
                                Native{' '}
                                {createCurrencyFormatters(
                                  displayLocale,
                                  row.originalCurrency,
                                ).money.format(Math.abs(row.originalAmount))}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-6 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card/35">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium">No ad-hoc shopping entries yet</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Post a one-off purchase or convert repeat items into recurring consumable plans.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={onPostPurchase}>
                      <Plus className="h-4 w-4" />
                      Post purchase
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onNavigateTab('transactions')}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Open transactions
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Consumables intelligence</CardTitle>
                  <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                    Mini subscriptions
                  </Badge>
                </div>
                <CardDescription>Top shopping categories in the selected scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniStat
                    label="Consumables (30d)"
                    value={money.format(consumableThirtyDaySpend)}
                    tone={consumableThirtyDaySpend > 0 ? 'warning' : 'neutral'}
                  />
                  <MiniStat
                    label="Posted plan matches"
                    value={String(
                      enabledScopedRecurringPlans.reduce(
                        (sum, row) => sum + row.signals.matchedPostedCount,
                        0,
                      ),
                    )}
                    tone={
                      enabledScopedRecurringPlans.some((row) => row.signals.matchedPostedCount > 0)
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                  <MiniStat
                    label="Low stock / at risk"
                    value={String(lowStockPlansCount)}
                    tone={lowStockPlansCount > 0 ? 'warning' : 'positive'}
                  />
                  <MiniStat
                    label="Cadence anomalies"
                    value={String(cadenceAnomalyCount)}
                    tone={cadenceAnomalyCount > 0 ? 'warning' : 'positive'}
                  />
                </div>
                <div className="space-y-2 pt-1">
                  {enabledScopedRecurringPlans.slice(0, 4).map((row) => (
                    <div
                      key={`signal-${row.template.id}`}
                      className="rounded-xl border border-border/50 bg-background/55 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{row.template.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill tone={row.derived.stockCoverageTone} label={row.derived.stockCoverageLabel} />
                          <StatusPill tone={row.signals.priceDriftTone} label={row.signals.priceDriftLabel} />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.signals.timingAnomalyLabel}
                        {row.derived.runOutLabel ? ` · Run-out est. ${row.derived.runOutLabel}` : ''}
                      </p>
                    </div>
                  ))}
                  {enabledScopedRecurringPlans.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Add recurring consumable plans to see stock, drift, and cadence signals.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Ad-hoc Category mix</CardTitle>
                <CardDescription>Top ad-hoc categories in the selected scope.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {adHocCategoryTotals.length > 0 ? (
                  adHocCategoryTotals.map(([category, amount]) => {
                    const adHocTotalSpend = adHocShoppingRows.reduce(
                      (sum, row) => sum + Math.abs(row.amount),
                      0,
                    )
                    const ratio = adHocTotalSpend > 0 ? (amount / adHocTotalSpend) * 100 : 0
                    return (
                      <div
                        key={category}
                        className="rounded-xl border border-border/50 bg-background/55 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{category}</p>
                            <p className="text-muted-foreground text-xs">
                              {ratio.toFixed(0)}% of ad-hoc spend
                            </p>
                          </div>
                          <p className="text-sm font-semibold">{money.format(amount)}</p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Ad-hoc categories appear after one-off purchases are posted.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Ad-hoc Payment sources</CardTitle>
                <CardDescription>Where ad-hoc shopping is being funded from.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {adHocPaymentSourceTotals.length > 0 ? (
                  adHocPaymentSourceTotals.map(([accountName, amount]) => (
                    <div
                      key={accountName}
                      className="rounded-xl border border-border/50 bg-background/55 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">{accountName}</p>
                        <p className="text-sm font-semibold">{money.format(amount)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Payment source summaries populate from posted ad-hoc purchase ledger entries.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Template Inventory</CardTitle>
                <CardDescription>
                  Split templates used for faster purchase posting. Recurring plans are highlighted.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {templateRows.length > 0 ? (
                  templateRows.slice(0, 8).map((template) => (
                    <div
                      key={template.id}
                      className="rounded-xl border border-border/50 bg-background/55 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{template.name}</p>
                            {template.shoppingPlan ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-primary/25 bg-primary/10 text-primary">
                                Recurring plan
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {template.splitCount} splits · {template.currency} · {template.defaultOwnership}
                          </p>
                          {template.defaultCategory ? (
                            <p className="text-muted-foreground mt-1 text-[11px]">
                              <Tag className="mr-1 inline h-3 w-3" />
                              {template.defaultCategory}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground shrink-0 text-[11px]">
                          {format(template.updatedAt, 'MMM d')}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Create templates from the Transactions purchase dialog to speed up shopping entry.
                  </p>
                )}
                <div className="pt-1 grid gap-2 sm:grid-cols-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => onNavigateTab('transactions')}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Manage templates
                  </Button>
                  {templateRowsWithoutPlan.length > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => openEditPlanDialog(templateRowsWithoutPlan[0]!)}
                    >
                      <Plus className="h-4 w-4" />
                      Convert template to plan
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="flex h-[92dvh] max-h-[92dvh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 pt-5 pb-4 sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              {planDraft.id ? 'Edit recurring shopping item' : 'Add recurring shopping item'}
            </DialogTitle>
            <DialogDescription>
              Define quantity, cadence, and cost per item. The app derives cost per shop and monthly
              spend, and saves a linked Phase 3 split template for fast posting.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1 overscroll-contain">
            <div className="grid gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-border/60 bg-card/35 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Recurring item setup</CardTitle>
                  <CardDescription>
                    Model how many you buy, how often, and how many shops that cycle is split across.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Item name</span>
                    <Input
                      value={planDraft.name}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="Tobacco"
                    />
                  </label>

                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Description</span>
                    <Input
                      value={planDraft.description}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Rolling tobacco routine"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Cost per item</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={planDraft.costPerItem}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, costPerItem: event.target.value }))
                      }
                      placeholder="0.00"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Currency</span>
                    <select
                      value={planDraft.currency}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, currency: event.target.value }))
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {(phaseThreeWorkspace?.availableCurrencies?.length
                        ? phaseThreeWorkspace.availableCurrencies
                        : [{ code: workspaceCurrency, name: workspaceCurrency }]
                      ).map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.code} · {currency.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Quantity per cycle</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={planDraft.quantityPerCycle}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, quantityPerCycle: event.target.value }))
                      }
                      placeholder="4"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Unit label</span>
                    <Input
                      value={planDraft.unitLabel}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, unitLabel: event.target.value }))
                      }
                      placeholder="items"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Cycle interval</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="1"
                      value={planDraft.cycleInterval}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, cycleInterval: event.target.value }))
                      }
                      placeholder="4"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Cycle unit</span>
                    <select
                      value={planDraft.cycleUnit}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({
                          ...prev,
                          cycleUnit: normalizeCycleUnit(event.target.value) as 'days' | 'weeks' | 'months',
                        }))
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Shops per cycle</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="1"
                      value={planDraft.shopsPerCycle}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, shopsPerCycle: event.target.value }))
                      }
                      placeholder="2"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Cycle anchor date</span>
                    <Input
                      type="date"
                      value={planDraft.anchorDate}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, anchorDate: event.target.value }))
                      }
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Stock on hand ({planDraft.unitLabel || 'items'})
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={planDraft.stockOnHandUnits}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, stockOnHandUnits: event.target.value }))
                      }
                      placeholder="0"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Low-stock threshold (days)
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="1"
                      value={planDraft.lowStockThresholdDays}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({
                          ...prev,
                          lowStockThresholdDays: event.target.value,
                        }))
                      }
                      placeholder="7"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Category</span>
                    <Input
                      value={planDraft.category}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, category: event.target.value }))
                      }
                      placeholder="Tobacco"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Ownership</span>
                    <select
                      value={planDraft.ownership}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, ownership: event.target.value }))
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="personal">personal</option>
                      <option value="shared">shared</option>
                      <option value="household">household</option>
                      <option value="business">business</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Funding account (optional)</span>
                    <select
                      value={planDraft.preferredAccountId}
                      onChange={(event) =>
                        setPlanDraft((prev) => ({ ...prev, preferredAccountId: event.target.value }))
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Unlinked / choose at purchase time</option>
                      {(phaseThreeWorkspace?.accountOptions ?? []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} · {account.type}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium">Plan active</p>
                      <p className="text-xs text-muted-foreground">
                        Paused plans stay saved but are excluded from planned monthly totals.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-7 w-12 items-center rounded-full border transition',
                        planDraft.enabled
                          ? 'border-emerald-400/25 bg-emerald-500/15 justify-end'
                          : 'border-border/60 bg-card/35 justify-start',
                      )}
                      onClick={() =>
                        setPlanDraft((prev) => ({ ...prev, enabled: !prev.enabled }))
                      }
                      aria-pressed={planDraft.enabled}
                    >
                      <span
                        className={cn(
                          'mx-1 h-5 w-5 rounded-full',
                          planDraft.enabled ? 'bg-emerald-300' : 'bg-muted-foreground/50',
                        )}
                      />
                    </button>
                  </label>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-border/60 bg-card/35 shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Derived cost model</CardTitle>
                    <CardDescription>
                      What the app calculates from your quantity, cadence, and cost per item.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                      <PreviewMetric
                        label="Cost per item"
                        value={money.format(planDraftDerived.costPerItem)}
                      />
                      <PreviewMetric
                        label="Quantity per shop"
                        value={`${roundMoney(planDraftDerived.quantityPerShop)} ${planDraft.unitLabel || 'items'}`}
                      />
                      <PreviewMetric
                        label="Cost per shop"
                        value={money.format(planDraftDerived.costPerShop)}
                        tone={planDraftDerived.costPerShop > 0 ? 'positive' : 'neutral'}
                      />
                      <PreviewMetric
                        label="Monthly spend"
                        value={money.format(planDraftDerived.monthlyCost)}
                        tone={planDraftDerived.monthlyCost > 0 ? 'warning' : 'neutral'}
                      />
                      <PreviewMetric
                        label="Annual spend"
                        value={money.format(planDraftDerived.annualCost)}
                        tone={planDraftDerived.annualCost > 0 ? 'warning' : 'neutral'}
                      />
                      <PreviewMetric
                        label="Daily usage"
                        value={`${roundMoney(planDraftDerived.dailyUsageUnits)} ${
                          planDraft.unitLabel || 'items'
                        } / day`}
                      />
                      <PreviewMetric
                        label="Days left"
                        value={
                          planDraftDerived.daysLeft === null
                            ? 'Set stock on hand'
                            : `${roundMoney(planDraftDerived.daysLeft)} days`
                        }
                        tone={planDraftDerived.stockCoverageTone}
                      />
                    </div>

                    <Separator />

                    <div className="rounded-xl border border-border/60 bg-background/45 p-3 text-sm">
                      <p className="font-medium">Shopping frequency</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {planDraftDerived.shopFrequencyLabel}
                      </p>
                      {planDraftDerived.nextShopLabel ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Next shop {planDraftDerived.nextShopEstimated ? '(est.) ' : ''}
                          {planDraftDerived.nextShopLabel}
                        </p>
                      ) : null}
                      {planDraftDerived.runOutLabel ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Run-out est. {planDraftDerived.runOutLabel} · Threshold{' '}
                          {planDraftDerived.lowStockThresholdDays} day
                          {planDraftDerived.lowStockThresholdDays === 1 ? '' : 's'}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-primary/20 bg-primary/6 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Example</p>
                      <p className="mt-1">
                        4 tobaccos every 4 weeks with 2 shops per cycle = 2 tobaccos every 2 weeks.
                        Cost per shop = 2 × cost per item.
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/8 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">What if I skip this purchase?</p>
                        <Badge variant="outline" className="border-emerald-400/25 bg-emerald-500/10 text-emerald-200">
                          Quick impact
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <PreviewMetric
                          label="Cash retained"
                          value={money.format(planDraftDerived.costPerShop)}
                          tone="positive"
                        />
                        <PreviewMetric
                          label="Repeat skip / year"
                          value={money.format(
                            planDraftDerived.shopsPerCycle > 0
                              ? planDraftDerived.annualCost / planDraftDerived.shopsPerCycle
                              : 0,
                          )}
                          tone="neutral"
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Skipping one planned shop keeps {money.format(planDraftDerived.costPerShop)} in
                        this cycle. If you skip one shop each cycle, annual spend drops by about{' '}
                        {money.format(
                          planDraftDerived.shopsPerCycle > 0
                            ? planDraftDerived.annualCost / planDraftDerived.shopsPerCycle
                            : 0,
                        )}
                        .
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/35 shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Template linkage</CardTitle>
                    <CardDescription>
                      Saving a plan also saves a Phase 3 split template so you can post purchases faster.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <p>Purchase amount template: {money.format(planDraftDerived.costPerShop)}</p>
                    <p>Category: {planDraft.category || 'Shopping'}</p>
                    <p>Ownership: {planDraft.ownership}</p>
                    <p>
                      Funding account: {planDraft.preferredAccountId ? 'Linked' : 'Choose at post time'}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t border-border/60 px-4 py-3 sm:px-6" showCloseButton>
            {planDraft.id ? (
              <Button
                variant="outline"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={() =>
                  void handleDeletePlan(planDraft.id!, planDraft.name || 'Recurring shopping item')
                }
                disabled={planDeleteId === planDraft.id || isSavingPlan}
              >
                <Trash2 className="h-4 w-4" />
                {planDeleteId === planDraft.id ? 'Deleting...' : 'Delete'}
              </Button>
            ) : null}
            <Button onClick={() => void handleSavePlan()} disabled={isSavingPlan}>
              {isSavingPlan ? 'Saving...' : planDraft.id ? 'Save changes' : 'Add recurring item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function MiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'positive' && 'text-emerald-300',
          tone === 'warning' && 'text-amber-300',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function CompactSignalBlock({
  label,
  value,
  detail,
  tone = 'neutral',
  icon: Icon = Boxes,
}: {
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'positive' | 'warning'
  icon?: typeof Boxes
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            tone === 'positive' && 'text-emerald-300',
            tone === 'warning' && 'text-amber-300',
            tone === 'neutral' && 'text-muted-foreground',
          )}
        />
        <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      </div>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'positive' && 'text-emerald-300',
          tone === 'warning' && 'text-amber-300',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  )
}

function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'positive' | 'warning'
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[15rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
        tone === 'positive' && 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
        tone === 'warning' && 'border-amber-400/25 bg-amber-500/10 text-amber-200',
        tone === 'neutral' && 'border-border/60 bg-background/55 text-muted-foreground',
      )}
      title={label}
    >
      {tone === 'warning' ? <AlertTriangle className="h-3 w-3 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

function PreviewMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/45 px-3 py-2.5">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'positive' && 'text-emerald-300',
          tone === 'warning' && 'text-amber-300',
        )}
      >
        {value}
      </p>
    </div>
  )
}
