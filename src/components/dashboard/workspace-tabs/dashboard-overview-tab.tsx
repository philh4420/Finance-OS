import type { ReactNode } from 'react'
import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  CartesianGrid,
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarClock,
  CircleAlert,
  Clock3,
  DollarSign,
  Plus,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import type {
  ConfidenceLevel,
  DashboardData,
  FinanceUserMode,
  RangeKey,
  WorkspaceTabKey,
} from '@/components/dashboard/dashboard-types'
import {
  ConfidenceBadge,
  OperatingRhythmPanel,
  SourceOfTruthPolicyDialog,
  UserModeSelector,
} from '@/components/dashboard/dashboard-experience'
import { KpiWhyDialog } from '@/components/dashboard/kpi-why-dialog'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const portfolioChartConfig = {
  netWorth: { label: 'Net worth', color: 'var(--chart-1)' },
  invested: { label: 'Invested', color: 'var(--chart-2)' },
  cash: { label: 'Cash', color: 'var(--chart-5)' },
} satisfies ChartConfig

const cashflowChartConfig = {
  income: { label: 'Income', color: 'var(--chart-2)' },
  expenses: { label: 'Expenses', color: 'var(--chart-1)' },
} satisfies ChartConfig

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

function buildAllocationChartConfig(
  allocations: Array<{ name: string }>,
) {
  return allocations.reduce<Record<string, { label: string; color: string }>>(
    (config, item, index) => {
      config[item.name] = {
        label: item.name,
        color: `var(--chart-${(index % 5) + 1})`,
      }
      return config
    },
    {},
  ) satisfies ChartConfig
}

function presentAllocationName(name: string) {
  if (name === 'Card Debt') return 'Credit Cards'
  if (name === 'Debt Accounts') return 'Debt Balances'
  if (name === 'Loans') return 'Loan Balances'
  if (name === 'Monthly Commitments') return 'Monthly Obligations'
  return name
}

function rangeSlice(range: RangeKey, totalPoints: number) {
  if (range === '30d') return 6
  if (range === '90d') return 9
  return totalPoints
}

export function DashboardOverviewTab({
  data,
  selectedRange,
  onSelectedRangeChange,
  showBalances,
  onToggleBalances,
  displayCurrency,
  displayLocale,
  thumbMode,
  lowSignalMode,
  queuedItemCount,
  userMode,
  onUserModeChange,
  onNavigateTab,
  formatters,
  formatInCurrency,
  metrics,
  fxPolicy,
}: {
  data: DashboardData
  selectedRange: RangeKey
  onSelectedRangeChange: (value: RangeKey) => void
  showBalances: boolean
  onToggleBalances: () => void
  displayCurrency: string
  displayLocale: string
  thumbMode: boolean
  lowSignalMode: boolean
  queuedItemCount: number
  userMode: FinanceUserMode
  onUserModeChange: (mode: FinanceUserMode) => void
  onNavigateTab?: (tab: WorkspaceTabKey) => void
  formatters: {
    compactCurrency: Intl.NumberFormat
    wholeCurrency: Intl.NumberFormat
    money: Intl.NumberFormat
  }
  formatInCurrency: (value: number, currencyCode?: string) => string
  metrics: {
    netWorth: number
    portfolioDeltaPct: number
    runwayMonths: number
    monthlyNet: number
    savingsRate: number
    budgetUsage: number
    marketingOverrun: number
  }
  fxPolicy?: {
    baseCurrency: string
    displayCurrency: string
    fxAsOfMs: number | null
    fxSources: string[]
    syntheticRates: boolean
  }
}) {
  const {
    accounts,
    allocations,
    budgets,
    cashflowSeries,
    goals,
    insights,
    portfolioSeries,
    summary,
    transactions,
    upcomingBills,
    watchlist,
  } = data
  const { compactCurrency, wholeCurrency, money } = formatters
  const visiblePortfolio = portfolioSeries.slice(
    -rangeSlice(selectedRange, portfolioSeries.length),
  )
  const allocationChartConfig = buildAllocationChartConfig(allocations)
  const now = new Date()
  const resolvedFxPolicy = fxPolicy ?? {
    baseCurrency: displayCurrency,
    displayCurrency,
    fxAsOfMs: null,
    fxSources: [],
    syntheticRates: false,
  }
  const fxAsOfLabel = resolvedFxPolicy.fxAsOfMs
    ? `${format(new Date(resolvedFxPolicy.fxAsOfMs), 'MMM d, yyyy HH:mm')} (${formatDistanceToNowStrict(
        resolvedFxPolicy.fxAsOfMs,
        { addSuffix: true },
      )})`
    : 'Not available'
  const pendingScheduledRows = transactions
    .filter((row) => row.status === 'pending')
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const nextPaydays = pendingScheduledRows.filter((row) => row.type === 'income').slice(0, 3)
  const nextScheduleRows = pendingScheduledRows.slice(0, 6)
  const fourteenDayMs = 14 * 24 * 60 * 60 * 1000
  const nearTermScheduleRows = pendingScheduledRows.filter((row) => {
    const dueMs = parseISO(row.date).getTime()
    return dueMs >= now.getTime() && dueMs <= now.getTime() + fourteenDayMs
  })
  const nearTermScheduledNet = nearTermScheduleRows.reduce((sum, row) => sum + row.amount, 0)
  const nearTermScheduledOutflow = nearTermScheduleRows
    .filter((row) => row.amount < 0)
    .reduce((sum, row) => sum + Math.abs(row.amount), 0)
  const nextPayday = nextPaydays[0]
  const nextPaydayDateLabel = nextPayday ? format(parseISO(nextPayday.date), 'MMM d') : null
  const hasIncomeSchedules = summary.monthlyIncome > 0
  const hasRecurringExpenses = summary.monthlyExpenses > 0
  const hasBudgetPlan = budgets.length > 0
  const hasAssets = summary.totalAssets > 0
  const hasLiabilities = summary.liabilities > 0
  const liabilityOnlyWorkspace = hasLiabilities && !hasAssets
  const hasTrendHistory = visiblePortfolio.length >= 2
  const hasNetWorthMovement =
    hasTrendHistory &&
    Math.abs(visiblePortfolio.at(-1)!.netWorth - visiblePortfolio[0]!.netWorth) > 0.005
  const netWorthDeltaLabel = liabilityOnlyWorkspace
    ? 'Only liability accounts are currently configured'
    : hasTrendHistory && hasNetWorthMovement
      ? `${metrics.portfolioDeltaPct >= 0 ? '+' : ''}${metrics.portfolioDeltaPct.toFixed(1)}% over visible range`
      : 'Add more activity to build a trend range'
  const netWorthDeltaTone: 'positive' | 'neutral' | 'warning' = liabilityOnlyWorkspace
    ? 'warning'
    : hasTrendHistory && hasNetWorthMovement
      ? metrics.portfolioDeltaPct >= 0
        ? 'positive'
        : 'warning'
      : 'neutral'
  const liquidCashDeltaLabel = !hasRecurringExpenses
    ? liabilityOnlyWorkspace
      ? 'Add asset accounts and recurring bills to calculate runway'
      : 'Add recurring bills, cards, or loans to calculate runway'
    : summary.liquidCash <= 0 && hasAssets
      ? 'Mark your cash account as liquid to track runway'
      : nextPaydayDateLabel && nearTermScheduleRows.length > 0
      ? `Next payday ${nextPaydayDateLabel} · 14d net ${nearTermScheduledNet >= 0 ? '+' : ''}${wholeCurrency.format(nearTermScheduledNet)}`
      : nextPaydayDateLabel
        ? `Next payday ${nextPaydayDateLabel}`
        : nearTermScheduleRows.length > 0
          ? `14d scheduled outflow ${wholeCurrency.format(nearTermScheduledOutflow)}`
          : `${metrics.runwayMonths.toFixed(1)} months runway`
  const liquidCashDeltaTone: 'positive' | 'neutral' | 'warning' = !hasRecurringExpenses
    ? 'neutral'
    : metrics.runwayMonths >= 6
      ? 'positive'
      : metrics.runwayMonths >= 3
        ? 'neutral'
        : 'warning'
  const monthlyNetDeltaLabel =
    !hasIncomeSchedules && !hasRecurringExpenses
      ? 'Add income and bills to calculate savings rate'
      : !hasIncomeSchedules
        ? 'Add income schedules to calculate savings rate'
        : !hasRecurringExpenses
          ? 'Add recurring expenses to calculate savings rate'
          : nextPaydays.length > 0
            ? `${nextPaydays.length} upcoming payday${nextPaydays.length > 1 ? 's' : ''} scheduled`
            : pendingScheduledRows.some((row) => row.type === 'expense')
              ? `${pendingScheduledRows.filter((row) => row.type === 'expense').length} upcoming payments scheduled`
              : `${percent.format(metrics.savingsRate)} savings rate`
  const monthlyNetDeltaTone: 'positive' | 'neutral' | 'warning' =
    !hasIncomeSchedules || !hasRecurringExpenses
      ? 'neutral'
      : metrics.savingsRate > 0.2
        ? 'positive'
        : 'warning'
  const budgetUsageValue = hasBudgetPlan ? `${Math.round(metrics.budgetUsage * 100)}%` : 'No plan'
  const budgetUsageDeltaLabel = !hasBudgetPlan
    ? 'Create budget lines to track spending'
    : metrics.marketingOverrun > 0
      ? `Marketing exceeded by ${wholeCurrency.format(metrics.marketingOverrun)}`
      : 'All budget lines within plan'
  const budgetUsageDeltaTone: 'positive' | 'neutral' | 'warning' = !hasBudgetPlan
    ? 'neutral'
    : metrics.marketingOverrun > 0
      ? 'warning'
      : 'positive'
  const hasAssetAllocationBuckets = allocations.some(
    (item) => item.name === 'Liquid Cash' || item.name === 'Other Assets',
  )
  const allocationDescription =
    allocations.length > 0 && !hasAssetAllocationBuckets
      ? 'Liability-heavy snapshot. Add asset accounts to balance the mix.'
      : 'Diversification snapshot and risk posture'
  const schedulePanelTitle = nextPaydays.length > 0 ? 'Upcoming schedule' : 'Upcoming bills'
  const postedRows = transactions
    .filter((row) => row.status === 'posted')
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
  const recentPostedRows = postedRows.slice(0, 4)
  const overdueScheduledRows = pendingScheduledRows.filter((row) => {
    const dueMs = parseISO(row.date).getTime()
    return dueMs < now.getTime()
  })
  const dueWithinSevenDays = pendingScheduledRows.filter((row) => {
    const dueMs = parseISO(row.date).getTime()
    return dueMs >= now.getTime() && dueMs <= now.getTime() + 7 * 24 * 60 * 60 * 1000
  })
  const actionRows = [
    overdueScheduledRows.length > 0
      ? {
          id: 'overdue',
          title: `${overdueScheduledRows.length} scheduled item${overdueScheduledRows.length === 1 ? '' : 's'} overdue`,
          detail: 'Review due dates and post or resolve missed items first.',
          tone: 'warning' as const,
          tab: 'dashboard' as const,
          actionLabel: 'Review schedule',
        }
      : null,
    !hasIncomeSchedules
      ? {
          id: 'income-setup',
          title: 'Add payday schedules',
          detail: 'Monthly cashflow and payday review work best once income cadence is configured.',
          tone: 'neutral' as const,
          tab: 'income' as const,
          actionLabel: 'Open income',
        }
      : null,
    !hasRecurringExpenses
      ? {
          id: 'expense-setup',
          title: 'Add bills, cards, or loans',
          detail: 'Recurring obligations unlock runway, due-date alerts, and monthly review checks.',
          tone: 'neutral' as const,
          tab: 'bills' as const,
          actionLabel: 'Open bills',
        }
      : null,
    !hasBudgetPlan
      ? {
          id: 'budget-plan',
          title: 'Create a plan baseline',
          detail: 'Budget and envelope plans improve variance tracking and monthly close accuracy.',
          tone: 'neutral' as const,
          tab: 'planning' as const,
          actionLabel: 'Open planning',
        }
      : null,
    recentPostedRows.length === 0
      ? {
          id: 'first-post',
          title: 'Post your first purchase',
          detail: 'Posted activity drives the most trustworthy dashboard story and audit trail.',
          tone: 'neutral' as const,
          tab: 'transactions' as const,
          actionLabel: 'Open transactions',
        }
      : null,
    hasRecurringExpenses && metrics.runwayMonths < 1
      ? {
          id: 'low-runway',
          title: 'Runway below one month',
          detail: 'Review upcoming due items and discretionary spending before the next cycle.',
          tone: 'warning' as const,
          tab: 'dashboard' as const,
          actionLabel: 'Open dashboard',
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string
    title: string
    detail: string
    tone: 'positive' | 'neutral' | 'warning'
    tab: WorkspaceTabKey
    actionLabel: string
  }>
  const hasMeaningfulChanges = recentPostedRows.length > 0 || hasTrendHistory
  const dashboardNarrativeConfidence: {
    changed: ConfidenceLevel
    next: ConfidenceLevel
    action: ConfidenceLevel
  } = {
    changed: recentPostedRows.length > 0 ? 'posted' : hasTrendHistory ? 'mixed' : 'estimated',
    next: pendingScheduledRows.length > 0 ? 'scheduled' : 'estimated',
    action: actionRows.length > 0 ? 'mixed' : 'estimated',
  }
  const todayDueWindowMs = 72 * 60 * 60 * 1000
  const todayActionScheduleRows = pendingScheduledRows.filter((row) => {
    const dueMs = parseISO(row.date).getTime()
    return Number.isFinite(dueMs) && dueMs <= now.getTime() + todayDueWindowMs
  })
  const nextSevenDayExpenseRows = pendingScheduledRows.filter((row) => {
    const dueMs = parseISO(row.date).getTime()
    return (
      Number.isFinite(dueMs) &&
      row.amount < 0 &&
      dueMs <= now.getTime() + 7 * 24 * 60 * 60 * 1000
    )
  })
  const nextThirtyDayExpenseRows = pendingScheduledRows.filter((row) => {
    const dueMs = parseISO(row.date).getTime()
    return (
      Number.isFinite(dueMs) &&
      row.amount < 0 &&
      dueMs <= now.getTime() + 30 * 24 * 60 * 60 * 1000
    )
  })
  const nextSevenDayObligations = nextSevenDayExpenseRows.reduce(
    (sum, row) => sum + Math.abs(row.amount),
    0,
  )
  const nextThirtyDayObligations = nextThirtyDayExpenseRows.reduce(
    (sum, row) => sum + Math.abs(row.amount),
    0,
  )
  const topUpcomingObligations = nextThirtyDayExpenseRows.slice(0, 5)
  const todayPriorityActions = actionRows.filter((row) => row.tone === 'warning').slice(0, 2)
  const upcomingIncomeRows = pendingScheduledRows.filter((row) => row.type === 'income').slice(0, 4)
  const paydayWindows = upcomingIncomeRows.slice(0, 3).map((incomeRow, index) => {
    const startMs = parseISO(incomeRow.date).getTime()
    const nextIncomeRow = upcomingIncomeRows[index + 1]
    const previousIncomeRow = index > 0 ? upcomingIncomeRows[index - 1] : null
    const fallbackWindowDays =
      nextIncomeRow && Number.isFinite(parseISO(nextIncomeRow.date).getTime())
        ? Math.max(
            1,
            differenceInCalendarDays(parseISO(nextIncomeRow.date), parseISO(incomeRow.date)),
          )
        : previousIncomeRow &&
            Number.isFinite(parseISO(previousIncomeRow.date).getTime())
          ? Math.max(
              1,
              differenceInCalendarDays(parseISO(incomeRow.date), parseISO(previousIncomeRow.date)),
            )
          : 14
    const endMs = nextIncomeRow
      ? parseISO(nextIncomeRow.date).getTime()
      : startMs + fallbackWindowDays * 24 * 60 * 60 * 1000
    const windowRows = pendingScheduledRows.filter((row) => {
      const rowMs = parseISO(row.date).getTime()
      return Number.isFinite(rowMs) && rowMs >= startMs && rowMs < endMs
    })
    const incomeTotal = windowRows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0)
    const obligationTotal = windowRows
      .filter((row) => row.amount < 0)
      .reduce((sum, row) => sum + Math.abs(row.amount), 0)
    const net = incomeTotal - obligationTotal
    return {
      id: `${incomeRow.id}-${nextIncomeRow?.id ?? 'forecast'}`,
      startDate: incomeRow.date,
      endDate: nextIncomeRow?.date ?? null,
      fallbackWindowDays,
      incomeTotal,
      obligationTotal,
      net,
      rows: windowRows.length,
      days:
        nextIncomeRow && Number.isFinite(parseISO(nextIncomeRow.date).getTime())
          ? Math.max(
              1,
              differenceInCalendarDays(parseISO(nextIncomeRow.date), parseISO(incomeRow.date)),
            )
          : fallbackWindowDays,
    }
  })
  const paydayWindowConfidence: ConfidenceLevel =
    paydayWindows.length > 0 ? 'scheduled' : 'estimated'
  const projectedRunwayAfter30dObligations =
    summary.monthlyExpenses > 0
      ? Math.max(summary.liquidCash - nextThirtyDayObligations, 0) / summary.monthlyExpenses
      : null
  const nextDueExpense = nextThirtyDayExpenseRows[0]
  const cashBufferDays =
    summary.monthlyExpenses > 0
      ? Math.max(0, (summary.liquidCash / summary.monthlyExpenses) * 30)
      : null

  return (
    <div className="grid gap-4">
      {thumbMode ? (
        <Card className="finance-panel border-primary/30 bg-primary/8 shadow-none">
          <CardHeader className="gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Thumb Mode quick check</CardTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/12 text-primary">
                Mobile focus
              </Badge>
              {lowSignalMode ? (
                <Badge
                  variant="outline"
                  className="border-amber-400/30 bg-amber-500/12 text-amber-200"
                >
                  {queuedItemCount} queued
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                >
                  Synced
                </Badge>
              )}
            </div>
            <CardDescription>
              One-thumb summary for next due, cash safety, and immediate action flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <InlineFinanceChip
              icon={CalendarClock}
              label="Next due"
              value={
                nextDueExpense
                  ? format(parseISO(nextDueExpense.date), 'MMM d')
                  : 'No due items'
              }
              tone={nextDueExpense ? 'warning' : 'positive'}
            />
            <InlineFinanceChip
              icon={Wallet}
              label="Cash buffer"
              value={
                cashBufferDays === null
                  ? 'N/A'
                  : `${cashBufferDays.toFixed(cashBufferDays < 10 ? 1 : 0)} days`
              }
              tone={
                cashBufferDays === null
                  ? 'neutral'
                  : cashBufferDays < 14
                    ? 'warning'
                    : cashBufferDays < 45
                      ? 'neutral'
                      : 'positive'
              }
            />
            <InlineFinanceChip
              icon={DollarSign}
              label="Next payday"
              value={
                nextPayday
                  ? format(parseISO(nextPayday.date), 'MMM d')
                  : 'Not scheduled'
              }
              tone={nextPayday ? 'positive' : 'neutral'}
            />
            <Button
              size="sm"
              variant="outline"
              className="sm:col-span-3"
              onClick={() => onNavigateTab?.('transactions')}
            >
              <Plus className="h-4 w-4" />
              Quick post purchase
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader className="gap-2 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Lock-screen widget concepts</CardTitle>
            <Badge variant="outline" className="border-border/70 bg-background/55">
              PWA preview
            </Badge>
          </div>
          <CardDescription>
            Install-surface concepts using live values for next due, cash buffer, and next payday.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <WidgetConceptCard
            title="Next due"
            value={
              nextDueExpense
                ? `${format(parseISO(nextDueExpense.date), 'MMM d')} · ${nextDueExpense.merchant}`
                : 'No due obligations in 30 days'
            }
            detail={
              nextDueExpense && showBalances
                ? wholeCurrency.format(Math.abs(nextDueExpense.amount))
                : nextDueExpense
                  ? 'Amount hidden'
                  : 'All clear'
            }
            tone={nextDueExpense ? 'warning' : 'positive'}
          />
          <WidgetConceptCard
            title="Cash buffer"
            value={
              showBalances
                ? wholeCurrency.format(summary.liquidCash)
                : '••••'
            }
            detail={
              cashBufferDays === null
                ? 'Needs recurring obligations to calculate days'
                : `${cashBufferDays.toFixed(cashBufferDays < 10 ? 1 : 0)} days at current burn`
            }
            tone={
              cashBufferDays === null
                ? 'neutral'
                : cashBufferDays < 14
                  ? 'warning'
                  : 'positive'
            }
          />
          <WidgetConceptCard
            title="Next payday"
            value={
              nextPayday
                ? `${format(parseISO(nextPayday.date), 'EEE, MMM d')}`
                : 'No payday schedule'
            }
            detail={
              nextPayday
                ? showBalances
                  ? `+${wholeCurrency.format(nextPayday.amount)}`
                  : 'Amount hidden'
                : 'Add income cadence in Income tab'
            }
            tone={nextPayday ? 'positive' : 'neutral'}
          />
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card/30 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Finance operating model
              </p>
              <p className="text-sm text-muted-foreground">
                One language for posted, scheduled, planned, and estimated numbers.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge level="posted" compact />
              <ConfidenceBadge level="scheduled" compact />
              <ConfidenceBadge level="planned" compact />
              <ConfidenceBadge level="estimated" compact />
              <SourceOfTruthPolicyDialog />
            </div>
          </div>

          <UserModeSelector mode={userMode} onModeChange={onUserModeChange} />

          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">FX conversion policy</CardTitle>
                <Badge variant="outline" className="border-border/70 bg-background/55">
                  {resolvedFxPolicy.baseCurrency} base
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-background/55">
                  {resolvedFxPolicy.displayCurrency} display
                </Badge>
                {resolvedFxPolicy.syntheticRates ? (
                  <Badge variant="outline" className="border-amber-400/25 bg-amber-500/10 text-amber-200">
                    mixed real + synthetic
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                Conversion path uses posted native amounts with current display conversion for dashboards.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>FX as-of: {fxAsOfLabel}</p>
              <p>
                Source feed: {resolvedFxPolicy.fxSources.length ? resolvedFxPolicy.fxSources.join(', ') : 'Not declared'}
              </p>
              <p>
                Base values remain immutable for posted events; display values are converted for presentation.
              </p>
            </CardContent>
          </Card>
        </div>

        <OperatingRhythmPanel
          mode={userMode}
          nextPaydayIso={nextPayday?.date ?? null}
          pendingScheduleCount={pendingScheduledRows.length}
          overdueScheduleCount={overdueScheduledRows.length}
          hasBudgetPlan={hasBudgetPlan}
          hasGoals={goals.length > 0}
          hasPostedTransactions={recentPostedRows.length > 0}
          onNavigateTab={onNavigateTab}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NarrativePanel
          title="What changed"
          confidence={dashboardNarrativeConfidence.changed}
          description={
            hasMeaningfulChanges
              ? 'Recent posted activity and movement in your visible range.'
              : 'Start posting activity to turn the dashboard into a factual timeline.'
          }
        >
          <div className="space-y-2">
            {recentPostedRows.length > 0 ? (
              recentPostedRows.slice(0, 3).map((row) => {
                const isIncome = row.amount >= 0 || row.type === 'income'
                return (
                  <NarrativeRow
                    key={row.id}
                    title={row.merchant}
                    detail={`${format(parseISO(row.date), 'MMM d')} · ${row.account}`}
                    value={
                      showBalances
                        ? `${isIncome ? '+' : ''}${wholeCurrency.format(row.amount)}`
                        : '••••'
                    }
                    tone={isIncome ? 'positive' : 'neutral'}
                  />
                )
              })
            ) : (
              <EmptyNarrativeState>
                No posted transactions yet. Use the Transactions tab to build a real activity history.
              </EmptyNarrativeState>
            )}
            <Separator />
            <NarrativeRow
              title="Visible-range net worth movement"
              detail={hasTrendHistory ? `${visiblePortfolio.length} points in view` : 'Need more history'}
              value={
                hasTrendHistory && hasNetWorthMovement
                  ? `${metrics.portfolioDeltaPct >= 0 ? '+' : ''}${metrics.portfolioDeltaPct.toFixed(1)}%`
                  : 'No movement'
              }
              tone={netWorthDeltaTone === 'positive' ? 'positive' : 'neutral'}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onNavigateTab ? (
              <Button size="xs" variant="outline" onClick={() => onNavigateTab('transactions')}>
                Review ledger
              </Button>
            ) : null}
            {onNavigateTab ? (
              <Button size="xs" variant="ghost" onClick={() => onNavigateTab('governance')}>
                Audit trail
              </Button>
            ) : null}
          </div>
        </NarrativePanel>

        <NarrativePanel
          title="What’s next"
          confidence={dashboardNarrativeConfidence.next}
          description="Upcoming paydays, due items, and short-term scheduled cashflow."
        >
          <div className="space-y-2">
            {nextPayday ? (
              <NarrativeRow
                title="Next payday"
                detail={`${format(parseISO(nextPayday.date), 'EEE, MMM d')} · ${nextPayday.account}`}
                value={showBalances ? `+${wholeCurrency.format(nextPayday.amount)}` : '••••'}
                tone="positive"
              />
            ) : (
              <EmptyNarrativeState>
                No payday schedule found yet. Add income cadence and paydays in the Income tab.
              </EmptyNarrativeState>
            )}

            {(dueWithinSevenDays.length > 0 ? dueWithinSevenDays : nextScheduleRows)
              .slice(0, 3)
              .map((row) => {
                const isIncome = row.amount >= 0 || row.type === 'income'
                return (
                  <NarrativeRow
                    key={`next-${row.id}`}
                    title={`${isIncome ? 'Payday' : 'Due'} · ${row.merchant}`}
                    detail={`${format(parseISO(row.date), 'EEE, MMM d')} · ${row.account}`}
                    value={
                      showBalances
                        ? `${isIncome ? '+' : ''}${wholeCurrency.format(row.amount)}`
                        : '••••'
                    }
                    tone={isIncome ? 'positive' : 'neutral'}
                  />
                )
              })}

            <Separator />
            <NarrativeRow
              title="Near-term scheduled net (14 days)"
              detail={`${nearTermScheduleRows.length} scheduled row${nearTermScheduleRows.length === 1 ? '' : 's'}`}
              value={
                showBalances
                  ? `${nearTermScheduledNet >= 0 ? '+' : ''}${wholeCurrency.format(nearTermScheduledNet)}`
                  : '••••'
              }
              tone={nearTermScheduledNet >= 0 ? 'positive' : 'warning'}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onNavigateTab ? (
              <Button size="xs" variant="outline" onClick={() => onNavigateTab('income')}>
                Open income
              </Button>
            ) : null}
            {onNavigateTab ? (
              <Button size="xs" variant="ghost" onClick={() => onNavigateTab('bills')}>
                Open bills
              </Button>
            ) : null}
            {onNavigateTab ? (
              <Button size="xs" variant="ghost" onClick={() => onNavigateTab('shopping')}>
                Open shopping
              </Button>
            ) : null}
          </div>
        </NarrativePanel>

        <NarrativePanel
          title="What needs action"
          confidence={dashboardNarrativeConfidence.action}
          description="Overdue items, missing setup, and things blocking reliable forecasts."
        >
          <div className="space-y-2">
            {actionRows.length > 0 ? (
              actionRows.slice(0, 4).map((row) => (
                <ActionNarrativeRow
                  key={row.id}
                  title={row.title}
                  detail={row.detail}
                  tone={row.tone}
                  actionLabel={row.actionLabel}
                  onAction={
                    onNavigateTab
                      ? () => onNavigateTab(row.tab)
                      : undefined
                  }
                />
              ))
            ) : (
              <EmptyNarrativeState>
                No urgent blockers detected. Use the weekly review to tighten plans and improve forecast confidence.
              </EmptyNarrativeState>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Today focus
            </p>
            <p className="mt-1 text-sm">
              {actionRows[0]?.title ??
                (nextPayday
                  ? `Prepare for ${format(parseISO(nextPayday.date), 'MMM d')} payday review`
                  : 'Keep posting activity and refining recurring schedules')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete the relevant operating-rhythm checklist on the right to keep the dashboard trustworthy.
            </p>
          </div>
        </NarrativePanel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Today</CardTitle>
              <ConfidenceBadge
                level={todayActionScheduleRows.length > 0 ? 'scheduled' : 'estimated'}
                compact
                detail="Shows only overdue or due-soon scheduled items and urgent action blockers."
              />
              <Badge variant="outline" className="border-border/70 bg-transparent">
                Due soon window: 72h
              </Badge>
            </div>
            <CardDescription>
              Action-only view for overdue items, due-soon paydays/payments, and urgent blockers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {todayActionScheduleRows.length > 0 ? (
              <div className="space-y-2">
                {todayActionScheduleRows.slice(0, 6).map((row) => {
                  const dueDate = parseISO(row.date)
                  const isIncome = row.amount >= 0 || row.type === 'income'
                  const overdue = dueDate.getTime() < now.getTime()
                  return (
                    <TodayActionRow
                      key={`today-${row.id}`}
                      title={`${isIncome ? 'Payday' : 'Due'} · ${row.merchant}`}
                      subtitle={`${format(dueDate, 'EEE, MMM d')} · ${row.account}`}
                      amount={
                        showBalances
                          ? `${isIncome ? '+' : ''}${wholeCurrency.format(row.amount)}`
                          : '••••'
                      }
                      statusLabel={overdue ? 'Overdue' : 'Due soon'}
                      statusTone={overdue ? 'warning' : isIncome ? 'positive' : 'neutral'}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyNarrativeState>
                No overdue or due-soon scheduled items in the next 72 hours.
              </EmptyNarrativeState>
            )}

            {todayPriorityActions.length > 0 ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Priority blockers
                  </p>
                  {todayPriorityActions.map((row) => (
                    <ActionNarrativeRow
                      key={`priority-${row.id}`}
                      title={row.title}
                      detail={row.detail}
                      tone={row.tone}
                      actionLabel={row.actionLabel}
                      onAction={onNavigateTab ? () => onNavigateTab(row.tab) : undefined}
                    />
                  ))}
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {onNavigateTab ? (
                <Button size="xs" variant="outline" onClick={() => onNavigateTab('dashboard')}>
                  <CircleAlert className="h-3.5 w-3.5" />
                  Review schedule
                </Button>
              ) : null}
              {onNavigateTab ? (
                <Button size="xs" variant="ghost" onClick={() => onNavigateTab('transactions')}>
                  <CalendarClock className="h-3.5 w-3.5" />
                  Post activity
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Runway and obligations</CardTitle>
                <ConfidenceBadge
                  level={hasRecurringExpenses ? 'mixed' : 'estimated'}
                  compact
                  detail="Runway uses posted liquid cash and scheduled recurring obligations to highlight near-term pressure."
                />
              </div>
              <CardDescription>
                Dedicated obligation pressure panel for due sums, debt load, and runway under upcoming payments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <InlineFinanceChip
                  icon={Rocket}
                  label="Runway now"
                  value={
                    summary.monthlyExpenses > 0
                      ? `${metrics.runwayMonths.toFixed(1)} months`
                      : 'N/A'
                  }
                  tone={liquidCashDeltaTone}
                />
                <InlineFinanceChip
                  icon={Clock3}
                  label="Runway after 30d dues"
                  value={
                    projectedRunwayAfter30dObligations == null
                      ? 'N/A'
                      : `${projectedRunwayAfter30dObligations.toFixed(1)} months`
                  }
                  tone={
                    projectedRunwayAfter30dObligations == null
                      ? 'neutral'
                      : projectedRunwayAfter30dObligations < 1
                        ? 'warning'
                        : projectedRunwayAfter30dObligations < 3
                          ? 'neutral'
                          : 'positive'
                  }
                />
                <InlineFinanceChip
                  icon={CalendarClock}
                  label="Due next 7d"
                  value={showBalances ? wholeCurrency.format(nextSevenDayObligations) : '••••'}
                  tone={nextSevenDayObligations > 0 ? 'warning' : 'neutral'}
                />
                <InlineFinanceChip
                  icon={CircleAlert}
                  label="Due next 30d"
                  value={showBalances ? wholeCurrency.format(nextThirtyDayObligations) : '••••'}
                  tone={nextThirtyDayObligations > 0 ? 'warning' : 'neutral'}
                />
              </div>

              <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Monthly obligations baseline</span>
                  <span className="font-semibold">
                    {showBalances ? wholeCurrency.format(summary.monthlyExpenses) : '••••'}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Liability balances</span>
                  <span className="font-semibold">
                    {showBalances ? wholeCurrency.format(summary.liabilities) : '••••'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Upcoming obligations
                </p>
                {topUpcomingObligations.length > 0 ? (
                  topUpcomingObligations.map((row) => (
                    <div key={`obligation-${row.id}`} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{row.merchant}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(row.date), 'MMM d')} · {row.account}
                        </p>
                      </div>
                      <p className="font-medium">
                        {showBalances ? wholeCurrency.format(Math.abs(row.amount)) : '••••'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No scheduled obligations found in the next 30 days.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Payday to payday windows</CardTitle>
                <ConfidenceBadge level={paydayWindowConfidence} compact />
              </div>
              <CardDescription>
                Cashflow windows between scheduled paydays, useful for weekly, biweekly, and 4-week income cycles.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {paydayWindows.length > 0 ? (
                paydayWindows.map((window) => (
                  <div
                    key={window.id}
                    className="rounded-xl border border-border/50 bg-background/55 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {format(parseISO(window.startDate), 'MMM d')}
                          {' → '}
                          {window.endDate
                            ? format(parseISO(window.endDate), 'MMM d')
                            : `+${window.fallbackWindowDays}d`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {window.days} days · {window.rows} scheduled row
                          {window.rows === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          window.net >= 0
                            ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-400/25 bg-amber-500/10 text-amber-200',
                        )}
                      >
                        Net {showBalances ? wholeCurrency.format(window.net) : '••••'}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <InlineFinanceChip
                        icon={DollarSign}
                        label="Income"
                        value={showBalances ? wholeCurrency.format(window.incomeTotal) : '••••'}
                        tone="positive"
                      />
                      <InlineFinanceChip
                        icon={CalendarClock}
                        label="Obligations"
                        value={showBalances ? wholeCurrency.format(window.obligationTotal) : '••••'}
                        tone={window.obligationTotal > 0 ? 'warning' : 'neutral'}
                      />
                      <InlineFinanceChip
                        icon={Rocket}
                        label="Net window"
                        value={
                          showBalances
                            ? `${window.net >= 0 ? '+' : ''}${wholeCurrency.format(window.net)}`
                            : '••••'
                        }
                        tone={window.net >= 0 ? 'positive' : 'warning'}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyNarrativeState>
                  Add income schedules (including biweekly or custom 4-week cadence) to generate payday-to-payday windows.
                </EmptyNarrativeState>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Net worth"
          value={showBalances ? wholeCurrency.format(metrics.netWorth) : '••••••'}
          deltaLabel={netWorthDeltaLabel}
          deltaTone={netWorthDeltaTone}
          confidence="posted"
          confidenceDetail="Current net worth is derived from stored account balances and liabilities in your live Convex records."
          icon={TrendingUp}
        />
        <MetricCard
          title="Liquid cash"
          value={showBalances ? wholeCurrency.format(summary.liquidCash) : '••••••'}
          deltaLabel={liquidCashDeltaLabel}
          deltaTone={liquidCashDeltaTone}
          confidence="posted"
          confidenceDetail="Liquid cash uses balances from accounts marked as liquid."
          icon={Wallet}
        />
        <MetricCard
          title="Monthly net"
          value={showBalances ? wholeCurrency.format(metrics.monthlyNet) : '••••••'}
          deltaLabel={monthlyNetDeltaLabel}
          deltaTone={monthlyNetDeltaTone}
          confidence={hasIncomeSchedules || hasRecurringExpenses ? 'scheduled' : 'estimated'}
          confidenceDetail={
            hasIncomeSchedules || hasRecurringExpenses
              ? 'Monthly net is projected from recurring paydays and recurring obligations.'
              : 'Monthly net is estimated until income and recurring obligations are configured.'
          }
          icon={DollarSign}
        />
        <MetricCard
          title="Budget usage"
          value={budgetUsageValue}
          deltaLabel={budgetUsageDeltaLabel}
          deltaTone={budgetUsageDeltaTone}
          confidence={hasBudgetPlan ? 'planned' : 'estimated'}
          confidenceDetail={
            hasBudgetPlan
              ? 'Budget usage compares spending activity against your planned budget lines.'
              : 'Budget usage is estimated because no budget plan exists yet.'
          }
          icon={Target}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader className="gap-3">
            <div>
              <CardTitle className="text-base">Portfolio trajectory</CardTitle>
              <CardDescription>
                Asset growth, invested capital, and cash reserves
              </CardDescription>
            </div>
            <CardAction>
              <Tabs value={selectedRange} onValueChange={(value) => onSelectedRangeChange(value as RangeKey)}>
                <TabsList variant="line">
                  <TabsTrigger value="30d">30D</TabsTrigger>
                  <TabsTrigger value="90d">90D</TabsTrigger>
                  <TabsTrigger value="1y">1Y</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-card/65">
                {showBalances
                  ? `${compactCurrency.format(metrics.netWorth)} total net worth`
                  : 'Balances hidden'}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {displayCurrency} · {displayLocale}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                <Sparkles className="h-3.5 w-3.5" />
                2026 planning mode
              </Badge>
              <Button
                size="xs"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={onToggleBalances}
              >
                {showBalances ? 'Hide balances' : 'Show balances'}
              </Button>
            </div>

            <ChartContainer
              config={portfolioChartConfig}
              className="h-[280px] w-full rounded-xl border border-border/50 bg-background/55 p-2"
            >
              <AreaChart data={visiblePortfolio} margin={{ left: 8, right: 12, top: 8 }}>
                <defs>
                  <linearGradient id="portfolioNet" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-netWorth)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-netWorth)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="portfolioInvested" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-invested)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--color-invested)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={18} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => compactCurrency.format(value)}
                  width={64}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Area
                  type="monotone"
                  dataKey="invested"
                  stroke="var(--color-invested)"
                  strokeWidth={2}
                  fill="url(#portfolioInvested)"
                />
                <Area
                  type="monotone"
                  dataKey="cash"
                  stroke="var(--color-cash)"
                  strokeWidth={1.5}
                  fillOpacity={0}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="var(--color-netWorth)"
                  strokeWidth={2.5}
                  fill="url(#portfolioNet)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Allocation mix</CardTitle>
              <CardDescription>{allocationDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr]">
              <ChartContainer
                config={allocationChartConfig}
                className="mx-auto h-[180px] w-full aspect-square max-w-[220px]"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                  <Pie
                    data={allocations}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={82}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {allocations.map((item, index) => (
                      <Cell key={item.name} fill={`var(--chart-${(index % 5) + 1})`} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              <div className="space-y-2">
                {allocations.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/55 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: `var(--chart-${(index % 5) + 1})` }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {presentAllocationName(item.name)}
                        </p>
                        <p className="text-muted-foreground text-xs">{item.risk} risk</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {showBalances ? compactCurrency.format(item.amount) : '••••'}
                      </p>
                      {(() => {
                        const isLiabilityBucket = /debt|loan|credit card/i.test(
                          presentAllocationName(item.name),
                        )
                        const improving = isLiabilityBucket ? item.deltaPct <= 0 : item.deltaPct >= 0
                        return (
                          <p
                            className={cn(
                              'text-xs',
                              improving ? 'text-emerald-400' : 'text-rose-400',
                            )}
                          >
                            {item.deltaPct >= 0 ? '+' : ''}
                            {item.deltaPct}%
                          </p>
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Cashflow cadence</CardTitle>
              <CardDescription>Weekly inflow vs outflow monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={cashflowChartConfig}
                className="h-[220px] w-full rounded-xl border border-border/50 bg-background/55 p-2"
              >
                <BarChart data={cashflowSeries} barGap={6}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrency.format(value)}
                    width={64}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="income" radius={[6, 6, 0, 0]} fill="var(--color-income)" />
                  <Bar
                    dataKey="expenses"
                    radius={[6, 6, 0, 0]}
                    fill="var(--color-expenses)"
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="finance-panel border-border/60 bg-card/35 shadow-none" id="budgets">
          <CardHeader>
            <CardTitle className="text-base">Budgets and goals</CardTitle>
            <CardDescription>
              Active budget lines, progress, and funding targets
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Budget status</p>
                <Badge variant="outline" className="border-border/70 bg-transparent">
                  {Math.round(metrics.budgetUsage * 100)}% used
                </Badge>
              </div>
              {budgets.map((budget) => {
                const progress = Math.min((budget.spent / budget.limit) * 100, 100)
                return (
                  <div
                    key={budget.category}
                    className="rounded-xl border border-border/50 bg-background/55 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{budget.category}</p>
                        <p className="text-muted-foreground text-xs">{budget.cadence}</p>
                      </div>
                      <Badge
                        variant={
                          budget.status === 'Exceeded'
                            ? 'destructive'
                            : budget.status === 'Tight'
                              ? 'secondary'
                              : 'outline'
                        }
                        className={cn(
                          budget.status === 'Tight' && 'bg-amber-500/15 text-amber-200',
                          budget.status === 'Healthy' &&
                            'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
                        )}
                      >
                        {budget.status}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <Progress value={progress} className="h-2 bg-card/55" />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {showBalances
                          ? `${wholeCurrency.format(budget.spent)} spent`
                          : '•••• spent'}
                      </span>
                      <span className="text-muted-foreground">
                        {showBalances
                          ? `${wholeCurrency.format(budget.limit)} limit`
                          : '•••• limit'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Goals</p>
                <Button size="xs" variant="outline">
                  <Plus className="h-3.5 w-3.5" />
                  New goal
                </Button>
              </div>
              {goals.map((goal) => {
                const progress = (goal.current / goal.target) * 100
                return (
                  <div
                    key={goal.id}
                    className="rounded-xl border border-border/50 bg-background/55 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{goal.title}</p>
                        <p className="text-muted-foreground text-xs">{goal.dueLabel}</p>
                      </div>
                      <Target className="text-muted-foreground h-4 w-4" />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {showBalances
                        ? `${wholeCurrency.format(goal.current)} / ${wholeCurrency.format(goal.target)}`
                        : '•••• / ••••'}
                    </p>
                    <Progress value={progress} className="mt-2 h-2 bg-card/55" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Suggested monthly contribution:{' '}
                      <span className="text-foreground font-medium">
                        {showBalances ? wholeCurrency.format(goal.contribution) : '••••'}
                      </span>
                    </p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Accounts</CardTitle>
              <CardDescription>Linked balances and trend snapshots</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/55 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {account.provider} · {account.type}
                    </p>
                    {account.originalCurrency &&
                    account.originalCurrency !== displayCurrency &&
                    account.originalBalance !== undefined ? (
                      <p className="text-[11px] text-muted-foreground">
                        Native{' '}
                        {formatInCurrency(account.originalBalance, account.originalCurrency)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {showBalances ? money.format(account.balance) : '••••••'}
                    </p>
                    <p
                      className={cn(
                        'text-xs',
                        account.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {account.changePct >= 0 ? '+' : ''}
                      {account.changePct}%
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Signals</CardTitle>
              <CardDescription>Alerts, bills, and watchlist movement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-xl border border-border/50 bg-background/55 px-3 py-3"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 rounded-full',
                          insight.tone === 'positive' && 'bg-emerald-400',
                          insight.tone === 'warning' && 'bg-amber-300',
                          insight.tone === 'neutral' && 'bg-sky-300',
                        )}
                      />
                      <div>
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {insight.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {schedulePanelTitle}
                </p>
                {nextScheduleRows.length > 0 ? (
                  nextScheduleRows.map((row) => {
                    const isIncome = row.amount >= 0 || row.type === 'income'
                    return (
                      <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-medium uppercase tracking-wide',
                                isIncome
                                  ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                                  : 'border-amber-300/20 bg-amber-400/10 text-amber-200',
                              )}
                            >
                              {isIncome ? 'Payday' : 'Due'}
                            </span>
                            <p className="truncate">{row.merchant}</p>
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {format(parseISO(row.date), 'MMM d')} · {row.account}
                          </p>
                        </div>
                        <p
                          className={cn(
                            'font-medium',
                            isIncome ? 'text-emerald-300' : 'text-foreground',
                          )}
                        >
                          {showBalances
                            ? `${isIncome ? '+' : ''}${wholeCurrency.format(row.amount)}`
                            : '••••'}
                        </p>
                      </div>
                    )
                  })
                ) : upcomingBills.length > 0 ? (
                  upcomingBills.map((bill) => (
                    <div key={bill.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{bill.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {format(parseISO(bill.due), 'MMM d')}
                        </p>
                      </div>
                      <p className="font-medium">
                        {showBalances ? wholeCurrency.format(bill.amount) : '••••'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Add paydays and due days to populate the schedule timeline.
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Watchlist
                </p>
                {watchlist.map((item) => (
                  <div key={item.symbol} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-border/70 bg-card/45 px-2 py-0.5 text-xs font-medium">
                        {item.symbol}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {money.format(item.price)}
                      </span>
                      {item.originalCurrency &&
                      item.originalCurrency !== displayCurrency &&
                      item.originalPrice !== undefined ? (
                        <span className="text-[11px] text-muted-foreground/80">
                          {formatInCurrency(item.originalPrice, item.originalCurrency)}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        item.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {item.changePct >= 0 ? '+' : ''}
                      {item.changePct}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  title,
  value,
  deltaLabel,
  deltaTone,
  confidence,
  confidenceDetail,
  icon: Icon,
  why,
}: {
  title: string
  value: string
  deltaLabel: string
  deltaTone: 'positive' | 'neutral' | 'warning'
  confidence: ConfidenceLevel
  confidenceDetail: string
  icon: LucideIcon
  why?: {
    explanation: string
    includes?: string[]
    excludes?: string[]
    confidence?: string
  }
}) {
  const resolvedWhy = why ?? defaultMetricWhy(title, confidenceDetail, confidence)
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardHeader className="gap-1">
        <CardDescription className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
          {title}
        </CardDescription>
        <CardAction>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/45">
            <Icon className="h-4 w-4" />
          </span>
        </CardAction>
        <div className="flex flex-wrap items-center gap-1">
          <ConfidenceBadge level={confidence} compact detail={confidenceDetail} />
          <KpiWhyDialog
            kpi={title}
            explanation={resolvedWhy.explanation}
            includes={resolvedWhy.includes}
            excludes={resolvedWhy.excludes}
            confidence={resolvedWhy.confidence}
          />
        </div>
        <CardTitle className="finance-display text-xl sm:text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            'text-xs',
            deltaTone === 'positive' && 'text-emerald-300',
            deltaTone === 'warning' && 'text-amber-200',
            deltaTone === 'neutral' && 'text-muted-foreground',
          )}
        >
          {deltaLabel}
        </p>
      </CardContent>
    </Card>
  )
}

function defaultMetricWhy(
  title: string,
  confidenceDetail: string,
  confidence: ConfidenceLevel,
) {
  const key = title.trim().toLowerCase()
  if (key === 'net worth') {
    return {
      explanation: 'Net worth tracks assets minus liabilities from your current live balances.',
      includes: ['Asset account balances', 'Card and loan liabilities', 'Debt-account liabilities'],
      excludes: ['Planned-only scenario changes', 'Pending unsaved edits'],
      confidence: `Confidence: ${confidence.toUpperCase()} · ${confidenceDetail}`,
    }
  }
  if (key === 'liquid cash') {
    return {
      explanation: 'Liquid cash shows immediately available money from accounts marked liquid.',
      includes: ['Checking/savings marked liquid', 'Current stored balances'],
      excludes: ['Non-liquid investments', 'Credit limit headroom'],
      confidence: `Confidence: ${confidence.toUpperCase()} · ${confidenceDetail}`,
    }
  }
  if (key === 'monthly net') {
    return {
      explanation: 'Monthly net is recurring income minus recurring obligations for the current planning window.',
      includes: ['Configured recurring income', 'Recurring bills, card minimums, loan minimums'],
      excludes: ['One-off transactions not modeled as recurring'],
      confidence: `Confidence: ${confidence.toUpperCase()} · ${confidenceDetail}`,
    }
  }
  if (key === 'budget usage') {
    return {
      explanation: 'Budget usage compares spending activity against your configured budget lines.',
      includes: ['Tracked category spend', 'Budget limits for active lines'],
      excludes: ['Categories without budget lines'],
      confidence: `Confidence: ${confidence.toUpperCase()} · ${confidenceDetail}`,
    }
  }

  return {
    explanation: confidenceDetail,
    confidence: `Confidence: ${confidence.toUpperCase()}`,
  }
}

function NarrativePanel({
  title,
  description,
  confidence,
  children,
}: {
  title: string
  description: string
  confidence: ConfidenceLevel
  children: ReactNode
}) {
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <ConfidenceBadge level={confidence} compact />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function NarrativeRow({
  title,
  detail,
  value,
  tone = 'neutral',
}: {
  title: string
  detail: string
  value: string
  tone?: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-background/55 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <p
        className={cn(
          'shrink-0 text-sm font-semibold',
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

function ActionNarrativeRow({
  title,
  detail,
  tone,
  actionLabel,
  onAction,
}: {
  title: string
  detail: string
  tone: 'positive' | 'neutral' | 'warning'
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/55 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-2 w-2 rounded-full',
                tone === 'positive' && 'bg-emerald-400',
                tone === 'warning' && 'bg-amber-300',
                tone === 'neutral' && 'bg-sky-300',
              )}
            />
            <p className="text-sm font-medium">{title}</p>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{detail}</p>
        </div>
        {onAction && actionLabel ? (
          <Button size="xs" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function TodayActionRow({
  title,
  subtitle,
  amount,
  statusLabel,
  statusTone,
}: {
  title: string
  subtitle: string
  amount: string
  statusLabel: string
  statusTone: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/55 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            <Badge
              variant="outline"
              className={cn(
                'h-5 px-1.5 text-[10px]',
                statusTone === 'positive' && 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
                statusTone === 'warning' && 'border-amber-400/25 bg-amber-500/10 text-amber-200',
                statusTone === 'neutral' && 'border-border/70 bg-transparent',
              )}
            >
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <p
          className={cn(
            'text-sm font-semibold',
            statusTone === 'positive' && 'text-emerald-300',
            statusTone === 'warning' && 'text-amber-200',
          )}
        >
          {amount}
        </p>
      </div>
    </div>
  )
}

function InlineFinanceChip({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 px-2.5 py-2">
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
          tone === 'warning' && 'text-amber-200',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function WidgetConceptCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string
  value: string
  detail: string
  tone: 'positive' | 'neutral' | 'warning'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-3 py-2.5',
        tone === 'positive' && 'border-emerald-400/20 bg-emerald-500/8',
        tone === 'warning' && 'border-amber-400/20 bg-amber-500/10',
        tone === 'neutral' && 'border-border/60 bg-background/45',
      )}
    >
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function EmptyNarrativeState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-background/35 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}
