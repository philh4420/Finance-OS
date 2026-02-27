import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  Circle,
  Home,
  Info,
  User,
} from 'lucide-react'

import type {
  ConfidenceLevel,
  FinanceUserMode,
  WorkspaceTabKey,
} from '@/components/dashboard/dashboard-types'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const USER_MODE_COPY: Record<
  FinanceUserMode,
  {
    label: string
    icon: typeof User
    strapline: string
    description: string
  }
> = {
  personal: {
    label: 'Personal',
    icon: User,
    strapline: 'Cashflow-first personal operating system',
    description:
      'Prioritizes paydays, due items, recurring shopping, debt coverage, and practical weekly reviews.',
  },
  household: {
    label: 'Household',
    icon: Home,
    strapline: 'Shared household planning and obligations',
    description:
      'Emphasizes shared spending, household bills, recurring consumables, and coordinated monthly reviews.',
  },
  operator: {
    label: 'Operator',
    icon: BriefcaseBusiness,
    strapline: 'Ops-heavy finance workspace',
    description:
      'Surfaces controls, exceptions, and audit detail for users who want a more operational workflow.',
  },
}

const CONFIDENCE_META: Record<
  ConfidenceLevel,
  { label: string; className: string; description: string }
> = {
  posted: {
    label: 'Posted',
    className:
      'border-emerald-400/25 bg-emerald-500/10 text-emerald-200 dark:text-emerald-200',
    description: 'Built from recorded events or current stored balances.',
  },
  scheduled: {
    label: 'Scheduled',
    className: 'border-sky-400/25 bg-sky-500/10 text-sky-200 dark:text-sky-200',
    description: 'Built from recurring paydays and due dates that are expected but not posted yet.',
  },
  planned: {
    label: 'Planned',
    className: 'border-violet-400/25 bg-violet-500/10 text-violet-200 dark:text-violet-200',
    description: 'Built from user plans, budgets, or scenarios.',
  },
  estimated: {
    label: 'Estimated',
    className: 'border-amber-400/25 bg-amber-500/10 text-amber-200 dark:text-amber-200',
    description: 'Derived or provisional because source records are incomplete.',
  },
  mixed: {
    label: 'Mixed',
    className: 'border-border/70 bg-background/65 text-foreground',
    description: 'Combines posted, scheduled, or planned inputs.',
  },
}

type RhythmFlowKey = 'daily' | 'payday' | 'weekly' | 'monthClose'

type RhythmChecklistItem = {
  id: string
  label: string
  detail: string
  tab?: WorkspaceTabKey
  ctaLabel?: string
}

type RhythmFlow = {
  id: RhythmFlowKey
  label: string
  duration: string
  purpose: string
  checklist: RhythmChecklistItem[]
}

export function ConfidenceBadge({
  level,
  detail,
  compact = false,
  className,
}: {
  level: ConfidenceLevel
  detail?: string
  compact?: boolean
  className?: string
}) {
  const meta = CONFIDENCE_META[level]
  const copy = detail ?? meta.description

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          title={copy}
          className={cn(
            'rounded-full font-medium',
            compact ? 'h-5 px-2 text-[10px]' : 'h-6 px-2.5 text-[11px]',
            meta.className,
            className,
          )}
        >
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72 text-xs">
        {copy}
      </TooltipContent>
    </Tooltip>
  )
}

export function UserModeSelector({
  mode,
  onModeChange,
  className,
}: {
  mode: FinanceUserMode
  onModeChange: (mode: FinanceUserMode) => void
  className?: string
}) {
  const current = USER_MODE_COPY[mode]

  return (
    <Card className={cn('border-border/60 bg-background/35 shadow-none', className)}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
            Core mode
          </Badge>
          <ConfidenceBadge
            level="planned"
            compact
            detail="Mode controls product tone, defaults, and workflow emphasis."
          />
        </div>
        <CardTitle className="text-base">{current.label} Finance OS</CardTitle>
        <CardDescription>{current.strapline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(Object.keys(USER_MODE_COPY) as FinanceUserMode[]).map((candidate) => {
            const item = USER_MODE_COPY[candidate]
            const Icon = item.icon
            const active = candidate === mode

            return (
              <Button
                key={candidate}
                type="button"
                variant={active ? 'default' : 'outline'}
                className={cn(
                  'h-auto items-start justify-start rounded-xl px-3 py-3 text-left',
                  !active && 'border-border/60 bg-background/40',
                )}
                onClick={() => onModeChange(candidate)}
              >
                <div className="flex w-full items-start gap-2">
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
                      active
                        ? 'border-primary-foreground/20 bg-primary-foreground/10'
                        : 'border-border/70 bg-card/45',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block whitespace-normal text-xs leading-snug',
                        active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                      )}
                    >
                      {item.strapline}
                    </span>
                  </span>
                </div>
              </Button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">{current.description}</p>
      </CardContent>
    </Card>
  )
}

export function SourceOfTruthPolicyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-border/60 bg-background/45">
          <Info className="h-4 w-4" />
          Source of truth
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
              Policy
            </Badge>
            <ConfidenceBadge
              level="mixed"
              compact
              detail="This screen explains why different views can show different numbers."
            />
          </div>
          <DialogTitle>Single source of truth: how numbers are classified</DialogTitle>
          <DialogDescription>
            Every finance number in the app is labeled so you can tell whether it comes from posted
            events, scheduled recurring items, plans, or an estimate.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <DefinitionCard
            title="Posted"
            confidence="posted"
            example="Recorded purchases, confirmed income, stored balances, posted ledger rows."
          />
          <DefinitionCard
            title="Scheduled"
            confidence="scheduled"
            example="Upcoming paydays, bill due days, loan/card payment schedule projections."
          />
          <DefinitionCard
            title="Planned"
            confidence="planned"
            example="Budgets, goals, envelope plans, planning scenarios and target allocations."
          />
          <DefinitionCard
            title="Estimated"
            confidence="estimated"
            example="Derived values when data is incomplete (for example sparse history or missing anchors)."
          />
        </div>

        <Card className="border-border/60 bg-background/35 shadow-none">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="text-sm">Precedence rules</CardTitle>
            <CardDescription>
              These rules explain why dashboard, planning, and reports may differ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <RuleRow
              title="Posted overrides scheduled"
              detail="Once a real payment or income is posted, it should be treated as the source of truth for that event."
            />
            <RuleRow
              title="Scheduled informs near-term forecasts"
              detail="Recurring items shape upcoming cashflow until they are replaced by posted records."
            />
            <RuleRow
              title="Planned stays in planning/scenario views"
              detail="Plans influence forecasts and targets but should not be presented as already happened."
            />
            <RuleRow
              title="Estimated is explicit"
              detail="When the app derives a value with incomplete data, the metric is labeled so it is not mistaken for posted truth."
            />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/35 shadow-none">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="text-sm">Confidence badge legend</CardTitle>
            <CardDescription>
              These appear on KPI cards and story panels so you can judge reliability instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(['posted', 'scheduled', 'planned', 'estimated', 'mixed'] as ConfidenceLevel[]).map(
              (level) => (
                <ConfidenceBadge key={level} level={level} />
              ),
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}

export function OperatingRhythmPanel({
  mode,
  nextPaydayIso,
  pendingScheduleCount,
  overdueScheduleCount,
  hasBudgetPlan,
  hasGoals,
  hasPostedTransactions,
  onNavigateTab,
}: {
  mode: FinanceUserMode
  nextPaydayIso: string | null
  pendingScheduleCount: number
  overdueScheduleCount: number
  hasBudgetPlan: boolean
  hasGoals: boolean
  hasPostedTransactions: boolean
  onNavigateTab?: (tab: WorkspaceTabKey) => void
}) {
  const [activeFlow, setActiveFlow] = useState<RhythmFlowKey>('daily')
  const bucketKey = getRhythmBucketKey(activeFlow, nextPaydayIso)
  const [completionByBucket, setCompletionByBucket] = useState<Record<string, string[]>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem('finance-rhythm-completions')
      if (!raw) return {}
      const parsed = JSON.parse(raw) as unknown
      return isStringArrayRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'finance-rhythm-completions',
        JSON.stringify(completionByBucket),
      )
    } catch {
      // Ignore storage write issues.
    }
  }, [completionByBucket])

  const flows = buildOperatingRhythmFlows({
    mode,
    nextPaydayIso,
    pendingScheduleCount,
    overdueScheduleCount,
    hasBudgetPlan,
    hasGoals,
    hasPostedTransactions,
  })
  const active = flows.find((flow) => flow.id === activeFlow) ?? flows[0]
  const completedIds = new Set(completionByBucket[bucketKey] ?? [])
  const completedCount = active.checklist.filter((item) => completedIds.has(item.id)).length
  const progressPct = active.checklist.length
    ? Math.round((completedCount / active.checklist.length) * 100)
    : 0

  const toggleItem = (itemId: string) => {
    setCompletionByBucket((prev) => {
      const next = { ...prev }
      const current = new Set(next[bucketKey] ?? [])
      if (current.has(itemId)) current.delete(itemId)
      else current.add(itemId)
      next[bucketKey] = Array.from(current)
      return next
    })
  }

  const resetCurrentFlow = () => {
    setCompletionByBucket((prev) => {
      const next = { ...prev }
      delete next[bucketKey]
      return next
    })
  }

  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border/70 bg-background/50">
            <CalendarClock className="h-3.5 w-3.5" />
            Operating rhythm
          </Badge>
          <ConfidenceBadge
            level="mixed"
            compact
            detail="This panel combines posted activity, schedules, and plans into review checklists."
          />
          <Badge variant="outline" className="border-border/70 bg-background/50">
            {USER_MODE_COPY[mode].label} mode
          </Badge>
        </div>
        <CardTitle className="text-base">Daily to month-close review loops</CardTitle>
        <CardDescription>
          Build a repeatable finance habit with short guided reviews tied to your current data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={activeFlow}
          onValueChange={(value) => setActiveFlow(value as RhythmFlowKey)}
          className="gap-3"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:grid-cols-4">
            {flows.map((flow) => (
              <TabsTrigger
                key={flow.id}
                value={flow.id}
                className="h-auto min-h-11 rounded-xl border border-border/60 bg-card/20 px-3 py-2 text-left"
              >
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-medium">{flow.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {flow.duration}
                  </span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {flows.map((flow) => (
            <TabsContent key={flow.id} value={flow.id} className="mt-0">
              <div className="rounded-2xl border border-border/60 bg-background/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{flow.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{flow.purpose}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-border/70 bg-background/55">
                      {completedCount}/{flow.checklist.length} done
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        'border-border/70 bg-background/55',
                        progressPct === 100 && 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
                      )}
                    >
                      {progressPct}%
                    </Badge>
                    <Button size="xs" variant="ghost" onClick={resetCurrentFlow}>
                      Reset
                    </Button>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-2">
                  {flow.checklist.map((item) => {
                    const done = completedIds.has(item.id)
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-xl border px-3 py-3',
                          done
                            ? 'border-emerald-400/20 bg-emerald-500/8'
                            : 'border-border/60 bg-card/25',
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          >
                            <span
                              className={cn(
                                'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                                done
                                  ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-200'
                                  : 'border-border/70 bg-background/55 text-muted-foreground',
                              )}
                            >
                              {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0">
                              <span className={cn('block text-sm font-medium', done && 'line-through opacity-85')}>
                                {item.label}
                              </span>
                              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                {item.detail}
                              </span>
                            </span>
                          </button>

                          {item.tab && onNavigateTab ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              className="border-border/60 bg-background/45"
                              onClick={() => onNavigateTab(item.tab!)}
                            >
                              {item.ctaLabel ?? 'Open'}
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function DefinitionCard({
  title,
  confidence,
  example,
}: {
  title: string
  confidence: ConfidenceLevel
  example: string
}) {
  return (
    <Card className="border-border/60 bg-background/35 shadow-none">
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <ConfidenceBadge level={confidence} compact />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs leading-relaxed text-muted-foreground">{example}</p>
      </CardContent>
    </Card>
  )
}

function RuleRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/20 px-3 py-2.5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  )
}

function buildOperatingRhythmFlows({
  mode,
  nextPaydayIso,
  pendingScheduleCount,
  overdueScheduleCount,
  hasBudgetPlan,
  hasGoals,
  hasPostedTransactions,
}: {
  mode: FinanceUserMode
  nextPaydayIso: string | null
  pendingScheduleCount: number
  overdueScheduleCount: number
  hasBudgetPlan: boolean
  hasGoals: boolean
  hasPostedTransactions: boolean
}): RhythmFlow[] {
  const nextPaydayLabel = nextPaydayIso ? format(new Date(nextPaydayIso), 'EEE d MMM') : null
  const modeLabel = USER_MODE_COPY[mode].label

  return [
    {
      id: 'daily',
      label: 'Daily check',
      duration: '2-3 min',
      purpose: `Quick ${modeLabel.toLowerCase()} cashflow check: what posted, what is due soon, and what changed since yesterday.`,
      checklist: [
        {
          id: 'daily-kpi-scan',
          label: 'Scan net worth, cash, and monthly net with confidence badges',
          detail: 'Use the labels to separate posted facts from scheduled or estimated values.',
        },
        {
          id: 'daily-due-risk',
          label:
            overdueScheduleCount > 0
              ? `Review ${overdueScheduleCount} overdue scheduled item${overdueScheduleCount === 1 ? '' : 's'}`
              : 'Check upcoming due items and paydays',
          detail:
            overdueScheduleCount > 0
              ? 'Resolve anything overdue first before planning the rest of the day.'
              : `You currently have ${pendingScheduleCount} scheduled item${pendingScheduleCount === 1 ? '' : 's'} in the timeline.`,
          tab: 'dashboard',
          ctaLabel: 'Review dashboard',
        },
        {
          id: 'daily-capture-spend',
          label: hasPostedTransactions ? 'Capture any missing spending from today' : 'Post your first purchase',
          detail:
            'Keeping purchase posting current improves dashboards, shopping plans, and monthly close accuracy.',
          tab: 'transactions',
          ctaLabel: 'Open transactions',
        },
      ],
    },
    {
      id: 'payday',
      label: 'Payday review',
      duration: '5-10 min',
      purpose: nextPaydayLabel
        ? `Anchor your cycle around the next payday (${nextPaydayLabel}) and route income to bills, debt, and goals.`
        : 'Confirm income was received, then allocate cash across bills, debt, and goals for the next cycle.',
      checklist: [
        {
          id: 'payday-confirm-income',
          label: 'Confirm income landed and matches expected payday amount',
          detail: 'Review posted entries and note any difference from scheduled income.',
          tab: 'income',
          ctaLabel: 'Open income',
        },
        {
          id: 'payday-route-bills',
          label: 'Fund upcoming bills and debt payments',
          detail:
            overdueScheduleCount > 0
              ? 'You have overdue scheduled items. Clear those first before discretionary spending.'
              : 'Prioritize due items before variable spending and shopping.',
          tab: 'bills',
          ctaLabel: 'Open bills',
        },
        {
          id: 'payday-plan-shop',
          label: 'Review recurring shopping plans for this pay cycle',
          detail: 'Use Shopping plans to convert per-item costs into per-shop and monthly impacts.',
          tab: 'shopping',
          ctaLabel: 'Open shopping',
        },
      ],
    },
    {
      id: 'weekly',
      label: 'Weekly review',
      duration: '10-15 min',
      purpose: 'Compare posted vs scheduled activity, catch drift, and prepare next week.',
      checklist: [
        {
          id: 'weekly-posted-vs-scheduled',
          label: 'Review posted vs scheduled changes',
          detail:
            'Focus on mismatches, missed due days, and anything that should be moved from scheduled to posted.',
          tab: 'dashboard',
          ctaLabel: 'Open dashboard',
        },
        {
          id: 'weekly-budget-plan',
          label: hasBudgetPlan ? 'Review budget lines and overrun risk' : 'Create your first budget plan',
          detail: hasBudgetPlan
            ? 'Check categories trending tight and adjust planned shopping or discretionary spend.'
            : 'Budget lines make the dashboard and reports more useful.',
          tab: 'planning',
          ctaLabel: 'Open planning',
        },
        {
          id: 'weekly-shopping',
          label: 'Update recurring shopping plans and price changes',
          detail:
            'Refresh per-item cost and cadence so your projected monthly shopping spend stays accurate.',
          tab: 'shopping',
          ctaLabel: 'Open shopping',
        },
      ],
    },
    {
      id: 'monthClose',
      label: 'Month close',
      duration: '15-25 min',
      purpose: 'Reconcile the month, review outcomes, and lock in what happened versus what was planned.',
      checklist: [
        {
          id: 'monthclose-reconcile',
          label: 'Reconcile posted transactions and scheduled items',
          detail: 'Close out stale scheduled rows and verify major payments and income receipts.',
          tab: 'transactions',
          ctaLabel: 'Open ledger',
        },
        {
          id: 'monthclose-variance',
          label: 'Review plan vs actual variance and debt movement',
          detail: 'Use dashboard story panels and planning views to understand what changed this month.',
          tab: 'planning',
          ctaLabel: 'Review planning',
        },
        {
          id: 'monthclose-goals',
          label: hasGoals ? 'Update goal progress and contribution targets' : 'Create a first savings/debt goal',
          detail: hasGoals
            ? 'Confirm goal contributions and reforecast the next month.'
            : 'Goals make the monthly review outcome-driven instead of purely operational.',
          tab: 'planning',
          ctaLabel: 'Goals',
        },
        {
          id: 'monthclose-export',
          label: 'Generate a report/export for audit trail or review',
          detail:
            'Use Governance for a professional print pack or export bundle after your monthly review is complete.',
          tab: 'governance',
          ctaLabel: 'Open governance',
        },
      ],
    },
  ]
}

function getRhythmBucketKey(flow: RhythmFlowKey, nextPaydayIso: string | null) {
  const now = new Date()
  if (flow === 'daily') return `daily:${format(now, 'yyyy-MM-dd')}`
  if (flow === 'weekly') return `weekly:${format(now, "RRRR-'W'II")}`
  if (flow === 'monthClose') return `monthClose:${format(now, 'yyyy-MM')}`
  return `payday:${nextPaydayIso ?? format(now, 'yyyy-MM')}`
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(
    (entry) => Array.isArray(entry) && entry.every((item) => typeof item === 'string'),
  )
}

