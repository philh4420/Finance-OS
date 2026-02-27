import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import {
  ArrowRightLeft,
  Bell,
  Bot,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import type { WorkspaceTabKey } from '@/components/dashboard/dashboard-types'
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
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const TRANSACTION_RULE_MATCH_FIELDS = ['merchant', 'category', 'note', 'account'] as const
const MATCH_MODES = ['contains', 'equals', 'starts_with', 'ends_with', 'regex'] as const
const TRANSACTION_TYPES = ['all', 'expense', 'income', 'transfer'] as const
const OWNERSHIP_OPTIONS = ['personal', 'shared', 'business', 'household'] as const

type PhaseFourPreferences = {
  monthlyAutomationEnabled: boolean
  monthlyAutomationRunDay: number
  monthlyAutomationRunHour: number
  monthlyAutomationRunMinute: number
  monthlyAutomationMaxRetries: number
  monthlyAutomationRetryStrategy: string
  monthlyCycleAlertsEnabled: boolean
  dueRemindersEnabled: boolean
  dueReminderDays: number
  reconciliationRemindersEnabled: boolean
  goalAlertsEnabled: boolean
  alertEscalationFailedStepsThreshold: number
  alertEscalationFailureStreakThreshold: number
  timezone: string
}

type PhaseFourTransactionRule = {
  id: string
  name: string
  enabled: boolean
  status: string
  priority: number
  note: string
  createdAt: number
  updatedAt: number
  lastMatchedAt: number | null
  lastAppliedAt: number | null
  matchField: string
  matchMode: string
  matchValue: string
  appliesToType: string
  category: string
  ownership: string
  linkedAccountId: string
  minAmount: number | null
  maxAmount: number | null
}

type PhaseFourIncomeAllocationRule = {
  id: string
  name: string
  enabled: boolean
  status: string
  priority: number
  note: string
  createdAt: number
  updatedAt: number
  lastMatchedAt: number | null
  lastAppliedAt: number | null
  incomeSourcePattern: string
  matchMode: string
  allocations: Array<{
    id: string
    label: string
    percent: number | null
    fixedAmount: number | null
    category: string
    ownership: string
    destinationAccountId: string
    note: string
  }>
}

type PhaseFourIncomeAllocationSuggestion = {
  id: string
  status: string
  decision: string | null
  title: string
  summary: string
  reason: string
  incomeId: string
  incomeSource: string
  amount: number
  fingerprint: string
  createdAt: number
  updatedAt: number
  reviewedAt: number | null
  snoozeUntil: number | null
  allocations: PhaseFourIncomeAllocationRule['allocations']
}

type PhaseFourSubscriptionPriceChange = {
  id: string
  status: string
  decision: string | null
  title: string
  summary: string
  reason: string
  fingerprint: string
  billId: string
  billName: string
  changeType: string
  previousAmount: number | null
  latestAmount: number
  deltaAmount: number
  deltaPct: number | null
  currency: string
  createdAt: number
  updatedAt: number
  reviewedAt: number | null
  snoozeUntil: number | null
}

type PhaseFourCycleAlert = {
  id: string
  status: 'open' | 'snoozed' | 'resolved' | string
  severity: 'low' | 'medium' | 'high' | string
  title: string
  detail: string
  fingerprint: string
  cycleKey: string
  entityType: string
  entityId: string
  dueAt: number | null
  actionLabel: string
  actionHref: string
  createdAt: number
  updatedAt: number
  resolvedAt: number | null
  snoozeUntil: number | null
}

type PhaseFourWorkspaceData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  displayCurrency: string
  locale: string
  timezone: string
  preferences: PhaseFourPreferences
  stats: {
    transactionRuleCount: number
    incomeAllocationRuleCount: number
    openSuggestionCount: number
    openAlertCount: number
    lastCycleRunAt: number | null
    lastCycleRunStatus: string | null
    nextMonthlyRunHint: string | null
  }
  options: {
    categories: string[]
    ownershipOptions: string[]
    incomeSources: string[]
    accountOptions: Array<{ id: string; name: string; type: string }>
    billOptions: Array<{ id: string; name: string; amount: number; isSubscription: boolean }>
    transactionRuleMatchFields: string[]
    matchModes: string[]
    transactionTypes: string[]
    cycleKeys: string[]
  }
  transactionRules: PhaseFourTransactionRule[]
  incomeAllocationRules: PhaseFourIncomeAllocationRule[]
  incomeAllocationSuggestions: PhaseFourIncomeAllocationSuggestion[]
  subscriptionPriceChanges: PhaseFourSubscriptionPriceChange[]
  cycleAlerts: PhaseFourCycleAlert[]
}

type TransactionRuleDraft = {
  id: string | null
  name: string
  enabled: boolean
  priority: string
  note: string
  matchField: string
  matchMode: string
  matchValue: string
  appliesToType: string
  category: string
  ownership: string
  linkedAccountId: string
  minAmount: string
  maxAmount: string
}

type IncomeAllocationDraftRow = {
  id: string
  label: string
  percent: string
  fixedAmount: string
  category: string
  ownership: string
  destinationAccountId: string
  note: string
}

type IncomeRuleDraft = {
  id: string | null
  name: string
  enabled: boolean
  priority: string
  note: string
  incomeSourcePattern: string
  matchMode: string
  allocations: IncomeAllocationDraftRow[]
}

function uuidLike() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `row-${Math.random().toString(36).slice(2, 10)}`
}

function emptyTransactionRuleDraft(): TransactionRuleDraft {
  return {
    id: null,
    name: '',
    enabled: true,
    priority: '100',
    note: '',
    matchField: 'merchant',
    matchMode: 'contains',
    matchValue: '',
    appliesToType: 'expense',
    category: '',
    ownership: 'shared',
    linkedAccountId: '',
    minAmount: '',
    maxAmount: '',
  }
}

function emptyIncomeAllocationRow(): IncomeAllocationDraftRow {
  return {
    id: uuidLike(),
    label: 'Allocation',
    percent: '',
    fixedAmount: '',
    category: '',
    ownership: 'shared',
    destinationAccountId: '',
    note: '',
  }
}

function emptyIncomeRuleDraft(): IncomeRuleDraft {
  return {
    id: null,
    name: '',
    enabled: true,
    priority: '100',
    note: '',
    incomeSourcePattern: '',
    matchMode: 'contains',
    allocations: [emptyIncomeAllocationRow()],
  }
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function suggestionTone(status: string) {
  if (status === 'accepted') return 'border-emerald-400/30 text-emerald-300'
  if (status === 'dismissed') return 'border-muted text-muted-foreground'
  if (status === 'snoozed') return 'border-sky-400/30 text-sky-300'
  return 'border-amber-400/30 text-amber-300'
}

function alertTone(severity: string) {
  if (severity === 'high') return 'border-rose-400/35 text-rose-300'
  if (severity === 'low') return 'border-sky-400/30 text-sky-300'
  return 'border-amber-400/30 text-amber-300'
}

function formatMaybeDate(timestamp: number | null) {
  if (!timestamp) return 'Never'
  return format(new Date(timestamp), 'MMM d, yyyy HH:mm')
}

function formatAge(timestamp: number | null) {
  if (!timestamp) return 'Never'
  return formatDistanceToNowStrict(timestamp, { addSuffix: true })
}

export function RulesAutomationWorkspaceTab({
  displayCurrency,
  displayLocale,
  thumbMode = false,
  onNavigateTab,
}: {
  displayCurrency: string
  displayLocale: string
  thumbMode?: boolean
  onNavigateTab?: (tab: WorkspaceTabKey) => void
}) {
  // Phase 4 backend functions are added before local codegen refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = useQuery((api as any).automation.getPhaseFourAutomationWorkspace, {
    displayCurrency,
    locale: displayLocale,
  }) as PhaseFourWorkspaceData | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertRule = useMutation((api as any).automation.upsertPhaseFourRule)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteRule = useMutation((api as any).automation.deletePhaseFourRule)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewSuggestion = useMutation((api as any).automation.reviewPhaseFourSuggestion)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePreferences = useMutation((api as any).automation.updatePhaseFourAutomationPreferences)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runSweep = useMutation((api as any).automation.runPhaseFourAutomationSweep)

  const money = createCurrencyFormatters(
    workspace?.locale ?? displayLocale,
    workspace?.displayCurrency ?? displayCurrency,
  ).money

  const [ruleTab, setRuleTab] = useState<'transaction' | 'income_allocation'>('transaction')
  const [transactionDraft, setTransactionDraft] = useState<TransactionRuleDraft>(() =>
    emptyTransactionRuleDraft(),
  )
  const [incomeRuleDraft, setIncomeRuleDraft] = useState<IncomeRuleDraft>(() => emptyIncomeRuleDraft())
  const [preferencesDraft, setPreferencesDraft] = useState<PhaseFourPreferences | null>(null)
  const [prefsDirty, setPrefsDirty] = useState(false)
  const [isSavingRule, setIsSavingRule] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [reviewingSuggestionId, setReviewingSuggestionId] = useState<string | null>(null)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [isRunningSweep, setIsRunningSweep] = useState(false)

  useEffect(() => {
    if (!workspace?.preferences) return
    setPreferencesDraft((prev) => prev ?? workspace.preferences)
  }, [workspace?.preferences])

  const openAlerts = workspace?.cycleAlerts.filter((alert) => alert.status === 'open') ?? []
  const openIncomeSuggestions =
    workspace?.incomeAllocationSuggestions.filter((row) => row.status === 'open') ?? []
  const openSubscriptionSuggestions =
    workspace?.subscriptionPriceChanges.filter((row) => row.status === 'open') ?? []

  const transactionRulesById = useMemo(
    () => new Map((workspace?.transactionRules ?? []).map((row) => [row.id, row])),
    [workspace?.transactionRules],
  )
  const incomeRulesById = useMemo(
    () => new Map((workspace?.incomeAllocationRules ?? []).map((row) => [row.id, row])),
    [workspace?.incomeAllocationRules],
  )

  const startEditTransactionRule = (id: string) => {
    const rule = transactionRulesById.get(id)
    if (!rule) return
    setRuleTab('transaction')
    setTransactionDraft({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: String(rule.priority),
      note: rule.note,
      matchField: rule.matchField,
      matchMode: rule.matchMode,
      matchValue: rule.matchValue,
      appliesToType: rule.appliesToType,
      category: rule.category,
      ownership: rule.ownership || 'shared',
      linkedAccountId: rule.linkedAccountId || '',
      minAmount: rule.minAmount == null ? '' : String(rule.minAmount),
      maxAmount: rule.maxAmount == null ? '' : String(rule.maxAmount),
    })
  }

  const startEditIncomeRule = (id: string) => {
    const rule = incomeRulesById.get(id)
    if (!rule) return
    setRuleTab('income_allocation')
    setIncomeRuleDraft({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: String(rule.priority),
      note: rule.note,
      incomeSourcePattern: rule.incomeSourcePattern,
      matchMode: rule.matchMode,
      allocations:
        rule.allocations.length > 0
          ? rule.allocations.map((row) => ({
              id: row.id || uuidLike(),
              label: row.label,
              percent: row.percent == null ? '' : String(row.percent),
              fixedAmount: row.fixedAmount == null ? '' : String(row.fixedAmount),
              category: row.category,
              ownership: row.ownership,
              destinationAccountId: row.destinationAccountId,
              note: row.note,
            }))
          : [emptyIncomeAllocationRow()],
    })
  }

  const handleSaveTransactionRule = async () => {
    if (!transactionDraft.name.trim()) {
      toast.error('Rule name is required')
      return
    }
    if (!transactionDraft.matchValue.trim()) {
      toast.error('Match value is required')
      return
    }

    const payload = {
      matchField: transactionDraft.matchField,
      matchMode: transactionDraft.matchMode,
      matchValue: transactionDraft.matchValue,
      appliesToType: transactionDraft.appliesToType,
      category: transactionDraft.category.trim() || undefined,
      ownership: transactionDraft.ownership.trim() || undefined,
      linkedAccountId: transactionDraft.linkedAccountId || undefined,
      minAmount: parseOptionalNumber(transactionDraft.minAmount),
      maxAmount: parseOptionalNumber(transactionDraft.maxAmount),
    }

    setIsSavingRule(true)
    try {
      const result = await upsertRule({
        ruleType: 'transaction',
        id: transactionDraft.id ?? undefined,
        name: transactionDraft.name.trim(),
        enabled: transactionDraft.enabled,
        priority: Number(transactionDraft.priority || 100),
        note: transactionDraft.note.trim() || undefined,
        payloadJson: JSON.stringify(payload),
      })
      toast.success(`Transaction rule ${result.mode === 'created' ? 'created' : 'updated'}`)
      setTransactionDraft(emptyTransactionRuleDraft())
    } catch (error) {
      console.error(error)
      toast.error('Failed to save transaction rule', {
        description: error instanceof Error ? error.message : 'Convex rejected the rule update.',
      })
    } finally {
      setIsSavingRule(false)
    }
  }

  const handleSaveIncomeRule = async () => {
    if (!incomeRuleDraft.name.trim()) {
      toast.error('Rule name is required')
      return
    }
    if (!incomeRuleDraft.incomeSourcePattern.trim()) {
      toast.error('Income source pattern is required')
      return
    }

    const allocations = incomeRuleDraft.allocations
      .map((row) => ({
        id: row.id,
        label: row.label.trim() || 'Allocation',
        percent: parseOptionalNumber(row.percent),
        fixedAmount: parseOptionalNumber(row.fixedAmount),
        category: row.category.trim() || undefined,
        ownership: row.ownership || undefined,
        destinationAccountId: row.destinationAccountId || undefined,
        note: row.note.trim() || undefined,
      }))
      .filter((row) => row.percent != null || row.fixedAmount != null)

    if (allocations.length === 0) {
      toast.error('Add at least one allocation (percent or fixed amount)')
      return
    }

    setIsSavingRule(true)
    try {
      const result = await upsertRule({
        ruleType: 'income_allocation',
        id: incomeRuleDraft.id ?? undefined,
        name: incomeRuleDraft.name.trim(),
        enabled: incomeRuleDraft.enabled,
        priority: Number(incomeRuleDraft.priority || 100),
        note: incomeRuleDraft.note.trim() || undefined,
        payloadJson: JSON.stringify({
          incomeSourcePattern: incomeRuleDraft.incomeSourcePattern.trim(),
          matchMode: incomeRuleDraft.matchMode,
          allocations,
        }),
      })
      toast.success(`Income allocation rule ${result.mode === 'created' ? 'created' : 'updated'}`)
      setIncomeRuleDraft(emptyIncomeRuleDraft())
    } catch (error) {
      console.error(error)
      toast.error('Failed to save income allocation rule', {
        description: error instanceof Error ? error.message : 'Convex rejected the rule update.',
      })
    } finally {
      setIsSavingRule(false)
    }
  }

  const handleDeleteRule = async (ruleType: 'transaction' | 'income_allocation', id: string) => {
    setDeletingRuleId(id)
    try {
      await deleteRule({ ruleType, id })
      toast.success('Rule deleted')
      if (ruleType === 'transaction' && transactionDraft.id === id) {
        setTransactionDraft(emptyTransactionRuleDraft())
      }
      if (ruleType === 'income_allocation' && incomeRuleDraft.id === id) {
        setIncomeRuleDraft(emptyIncomeRuleDraft())
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete rule', {
        description: error instanceof Error ? error.message : 'Convex rejected the delete request.',
      })
    } finally {
      setDeletingRuleId(null)
    }
  }

  const handleReviewSuggestion = async (
    kind: 'income_allocation' | 'subscription_price',
    id: string,
    decision: 'accept' | 'dismiss' | 'snooze',
    applyEffects = true,
  ) => {
    setReviewingSuggestionId(id)
    try {
      const result = await reviewSuggestion({
        kind,
        id,
        decision,
        applyEffects,
      })
      toast.success(
        decision === 'accept'
          ? 'Suggestion accepted'
          : decision === 'dismiss'
            ? 'Suggestion dismissed'
            : 'Suggestion snoozed',
        {
          description:
            result.sideEffect?.kind === 'income_rule_created'
              ? 'Income allocation rule created from suggestion.'
              : result.sideEffect?.kind === 'subscription_bill_updated'
                ? 'Bill amount updated from reviewed subscription change.'
                : undefined,
        },
      )
    } catch (error) {
      console.error(error)
      toast.error('Failed to review suggestion', {
        description: error instanceof Error ? error.message : 'Convex rejected the review.',
      })
    } finally {
      setReviewingSuggestionId(null)
    }
  }

  const handleSavePreferences = async () => {
    if (!preferencesDraft) return
    setIsSavingPreferences(true)
    try {
      await updatePreferences({
        monthlyAutomationEnabled: preferencesDraft.monthlyAutomationEnabled,
        monthlyAutomationRunDay: Number(preferencesDraft.monthlyAutomationRunDay),
        monthlyAutomationRunHour: Number(preferencesDraft.monthlyAutomationRunHour),
        monthlyAutomationRunMinute: Number(preferencesDraft.monthlyAutomationRunMinute),
        monthlyAutomationMaxRetries: Number(preferencesDraft.monthlyAutomationMaxRetries),
        monthlyAutomationRetryStrategy: preferencesDraft.monthlyAutomationRetryStrategy,
        monthlyCycleAlertsEnabled: preferencesDraft.monthlyCycleAlertsEnabled,
        dueRemindersEnabled: preferencesDraft.dueRemindersEnabled,
        dueReminderDays: Number(preferencesDraft.dueReminderDays),
        reconciliationRemindersEnabled: preferencesDraft.reconciliationRemindersEnabled,
        goalAlertsEnabled: preferencesDraft.goalAlertsEnabled,
        alertEscalationFailedStepsThreshold: Number(
          preferencesDraft.alertEscalationFailedStepsThreshold,
        ),
        alertEscalationFailureStreakThreshold: Number(
          preferencesDraft.alertEscalationFailureStreakThreshold,
        ),
        timezone: preferencesDraft.timezone,
      })
      toast.success('Automation controls saved')
      setPrefsDirty(false)
    } catch (error) {
      console.error(error)
      toast.error('Failed to save automation controls', {
        description: error instanceof Error ? error.message : 'Convex rejected the preferences update.',
      })
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const handleRunSweep = async () => {
    setIsRunningSweep(true)
    try {
      const result = await runSweep({ mode: 'manual' })
      toast.success('Automation sweep completed', {
        description: `${result.alertsCreated} alerts, ${result.incomeSuggestionsCreated + result.subscriptionSuggestionsCreated} suggestions created.`,
      })
    } catch (error) {
      console.error(error)
      toast.error('Failed to run automation sweep', {
        description: error instanceof Error ? error.message : 'Convex rejected the sweep.',
      })
    } finally {
      setIsRunningSweep(false)
    }
  }

  const updatePreferenceField = <K extends keyof PhaseFourPreferences>(
    key: K,
    value: PhaseFourPreferences[K],
  ) => {
    setPreferencesDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    setPrefsDirty(true)
  }

  const accountOptions = workspace?.options.accountOptions ?? []
  const categoryOptions = workspace?.options.categories ?? []
  const ownershipOptions = workspace?.options.ownershipOptions ?? Array.from(OWNERSHIP_OPTIONS)
  const incomeSourceHints = workspace?.options.incomeSources ?? []

  return (
    <div className="grid gap-4">
      {thumbMode ? (
        <Card className="finance-panel border-primary/30 bg-primary/8 shadow-none">
          <CardHeader className="gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Thumb actions</CardTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/12 text-primary">
                <Smartphone className="h-3.5 w-3.5" />
                Automation
              </Badge>
            </div>
            <CardDescription>Quick control for rules, suggestions, and cycle checks.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button size="sm" variant="outline" onClick={() => setRuleTab('transaction')}>
              <Sparkles className="h-4 w-4" />
              Tx rules
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRuleTab('income_allocation')}>
              <Bell className="h-4 w-4" />
              Income rules
            </Button>
            <Button size="sm" variant="outline" onClick={handleRunSweep} disabled={isRunningSweep}>
              <RefreshCcw className="h-4 w-4" />
              Run checks
            </Button>
            {onNavigateTab ? (
              <Button size="sm" variant="outline" onClick={() => onNavigateTab('transactions')}>
                <ArrowRightLeft className="h-4 w-4" />
                Ledger
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card/45">
                  <Bot className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base">Rules & Automation</CardTitle>
                  <CardDescription>
                    Phase 4 control center for categorization rules, allocation automation, smart suggestions, and cycle alerts.
                  </CardDescription>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleRunSweep} disabled={isRunningSweep}>
                {isRunningSweep ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Run checks now
              </Button>
              <Button size="sm" onClick={handleSavePreferences} disabled={!prefsDirty || isSavingPreferences}>
                {isSavingPreferences ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save controls
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border/70 bg-transparent">
              {workspace?.stats.transactionRuleCount ?? 0} transaction rules
            </Badge>
            <Badge variant="outline" className="border-border/70 bg-transparent">
              {workspace?.stats.incomeAllocationRuleCount ?? 0} income allocation rules
            </Badge>
            <Badge variant="outline" className="border-amber-400/25 bg-transparent text-amber-300">
              {workspace?.stats.openSuggestionCount ?? 0} open suggestions
            </Badge>
            <Badge variant="outline" className="border-rose-400/25 bg-transparent text-rose-300">
              {workspace?.stats.openAlertCount ?? 0} open alerts
            </Badge>
            {workspace === undefined ? (
              <Badge variant="secondary" className="bg-card/55">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Loading Phase 4 data
              </Badge>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {workspace?.viewerAuthenticated === false ? (
        <Card className="finance-panel border-amber-400/20 bg-amber-500/8 shadow-none">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Convex backend auth is inactive. Sign in again after confirming the Clerk JWT template `convex`.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <CardTitle className="text-base">Monthly Automation Controls</CardTitle>
            </div>
            <CardDescription>
              Controls are stored in `financePreferences` and used by Phase 4 scheduled sweeps. Next run hint: {workspace?.stats.nextMonthlyRunHint ?? 'Not available'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preferencesDraft ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleField
                    label="Monthly automation"
                    checked={preferencesDraft.monthlyAutomationEnabled}
                    onChange={(value) => updatePreferenceField('monthlyAutomationEnabled', value)}
                  />
                  <ToggleField
                    label="Cycle alerts"
                    checked={preferencesDraft.monthlyCycleAlertsEnabled}
                    onChange={(value) => updatePreferenceField('monthlyCycleAlertsEnabled', value)}
                  />
                  <ToggleField
                    label="Due reminders"
                    checked={preferencesDraft.dueRemindersEnabled}
                    onChange={(value) => updatePreferenceField('dueRemindersEnabled', value)}
                  />
                  <ToggleField
                    label="Reconciliation reminders"
                    checked={preferencesDraft.reconciliationRemindersEnabled}
                    onChange={(value) => updatePreferenceField('reconciliationRemindersEnabled', value)}
                  />
                  <ToggleField
                    label="Goal alerts"
                    checked={preferencesDraft.goalAlertsEnabled}
                    onChange={(value) => updatePreferenceField('goalAlertsEnabled', value)}
                  />
                </div>

                <Separator />

                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledInput
                    label="Run day"
                    type="number"
                    min={1}
                    max={28}
                    value={String(preferencesDraft.monthlyAutomationRunDay)}
                    onChange={(value) =>
                      updatePreferenceField('monthlyAutomationRunDay', Number(value) || 1)
                    }
                  />
                  <LabeledInput
                    label="Run hour"
                    type="number"
                    min={0}
                    max={23}
                    value={String(preferencesDraft.monthlyAutomationRunHour)}
                    onChange={(value) =>
                      updatePreferenceField('monthlyAutomationRunHour', Number(value) || 0)
                    }
                  />
                  <LabeledInput
                    label="Run minute"
                    type="number"
                    min={0}
                    max={59}
                    value={String(preferencesDraft.monthlyAutomationRunMinute)}
                    onChange={(value) =>
                      updatePreferenceField('monthlyAutomationRunMinute', Number(value) || 0)
                    }
                  />
                  <LabeledInput
                    label="Max retries"
                    type="number"
                    min={0}
                    max={10}
                    value={String(preferencesDraft.monthlyAutomationMaxRetries)}
                    onChange={(value) =>
                      updatePreferenceField('monthlyAutomationMaxRetries', Number(value) || 0)
                    }
                  />
                  <LabeledInput
                    label="Due reminder days"
                    type="number"
                    min={0}
                    max={30}
                    value={String(preferencesDraft.dueReminderDays)}
                    onChange={(value) => updatePreferenceField('dueReminderDays', Number(value) || 0)}
                  />
                  <LabeledInput
                    label="Timezone"
                    value={preferencesDraft.timezone}
                    onChange={(value) => updatePreferenceField('timezone', value)}
                  />
                  <LabeledInput
                    label="Failed step threshold"
                    type="number"
                    min={1}
                    max={10}
                    value={String(preferencesDraft.alertEscalationFailedStepsThreshold)}
                    onChange={(value) =>
                      updatePreferenceField(
                        'alertEscalationFailedStepsThreshold',
                        Number(value) || 1,
                      )
                    }
                  />
                  <LabeledInput
                    label="Failure streak threshold"
                    type="number"
                    min={1}
                    max={10}
                    value={String(preferencesDraft.alertEscalationFailureStreakThreshold)}
                    onChange={(value) =>
                      updatePreferenceField(
                        'alertEscalationFailureStreakThreshold',
                        Number(value) || 1,
                      )
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    Retry strategy
                  </label>
                  <select
                    className="h-10 w-full rounded-lg border border-border/70 bg-background/60 px-3 text-sm"
                    value={preferencesDraft.monthlyAutomationRetryStrategy}
                    onChange={(event) =>
                      updatePreferenceField('monthlyAutomationRetryStrategy', event.target.value)
                    }
                  >
                    <option value="same_day_backoff">same_day_backoff</option>
                    <option value="next_day_retry">next_day_retry</option>
                    <option value="manual_only">manual_only</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-10 text-center text-sm text-muted-foreground">
                Loading automation controls...
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <CardTitle className="text-base">Smart Suggestions</CardTitle>
            </div>
            <CardDescription>
              Review generated suggestions and accept them to create rules or apply subscription price updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <SuggestionListCard
                title="Income allocation suggestions"
                description="Create income allocation rules for uncovered income sources"
                items={workspace?.incomeAllocationSuggestions ?? []}
                renderItem={(item) => (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', suggestionTone(item.status))}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.summary || item.reason}</p>
                    <div className="text-xs text-muted-foreground">
                      {item.incomeSource} · {money.format(item.amount)} · {formatAge(item.updatedAt)}
                    </div>
                    {item.allocations.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {item.allocations.slice(0, 4).map((allocation) => (
                          <Badge key={`${item.id}-${allocation.id}`} variant="secondary" className="bg-card/55 text-[10px]">
                            {allocation.label}{' '}
                            {allocation.percent != null
                              ? `${allocation.percent}%`
                              : allocation.fixedAmount != null
                                ? money.format(allocation.fixedAmount)
                                : ''}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {item.status === 'open' ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="xs"
                          onClick={() =>
                            handleReviewSuggestion('income_allocation', item.id, 'accept', true)
                          }
                          disabled={reviewingSuggestionId === item.id}
                        >
                          Accept & create rule
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            handleReviewSuggestion('income_allocation', item.id, 'snooze', false)
                          }
                          disabled={reviewingSuggestionId === item.id}
                        >
                          Snooze
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            handleReviewSuggestion('income_allocation', item.id, 'dismiss', false)
                          }
                          disabled={reviewingSuggestionId === item.id}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                emptyLabel="No income allocation suggestions yet. Run checks now to generate recommendations from your live incomes and bills."
              />

              <SuggestionListCard
                title="Subscription price changes"
                description="Review baseline and amount-change detections for recurring subscriptions"
                items={workspace?.subscriptionPriceChanges ?? []}
                renderItem={(item) => (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', suggestionTone(item.status))}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.summary || item.reason}</p>
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <span>{item.billName}</span>
                      <span>•</span>
                      <span>{item.changeType}</span>
                      <span>•</span>
                      <span>
                        {item.previousAmount == null
                          ? money.format(item.latestAmount)
                          : `${money.format(item.previousAmount)} → ${money.format(item.latestAmount)}`}
                      </span>
                      {item.deltaPct != null ? (
                        <>
                          <span>•</span>
                          <span className={cn(item.deltaPct > 0 ? 'text-rose-300' : 'text-emerald-300')}>
                            {item.deltaPct > 0 ? '+' : ''}
                            {item.deltaPct.toFixed(1)}%
                          </span>
                        </>
                      ) : null}
                    </div>
                    {item.status === 'open' ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="xs"
                          onClick={() =>
                            handleReviewSuggestion('subscription_price', item.id, 'accept', true)
                          }
                          disabled={reviewingSuggestionId === item.id}
                        >
                          Accept & update bill
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            handleReviewSuggestion('subscription_price', item.id, 'accept', false)
                          }
                          disabled={reviewingSuggestionId === item.id}
                        >
                          Accept only
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            handleReviewSuggestion('subscription_price', item.id, 'dismiss', false)
                          }
                          disabled={reviewingSuggestionId === item.id}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
                emptyLabel="No subscription changes detected yet. The sweep will create baseline monitors for subscription bills and future change records when amounts differ."
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <CardTitle className="text-base">Rule Management</CardTitle>
          </div>
          <CardDescription>
            Manage transaction categorization rules and income allocation rules stored in live Convex tables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={ruleTab} onValueChange={(value) => setRuleTab(value as typeof ruleTab)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="transaction">Transaction Rules</TabsTrigger>
              <TabsTrigger value="income_allocation">Income Allocation Rules</TabsTrigger>
            </TabsList>

            <TabsContent value="transaction" className="mt-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <RuleListPanel
                  title="Transaction rules"
                  rows={workspace?.transactionRules ?? []}
                  onEdit={startEditTransactionRule}
                  onDelete={(id) => handleDeleteRule('transaction', id)}
                  deletingRuleId={deletingRuleId}
                  renderRowMeta={(rule) => (
                    <>
                      <span>{rule.matchField}</span>
                      <span>•</span>
                      <span>{rule.matchMode}</span>
                      <span>•</span>
                      <span>{rule.matchValue}</span>
                      {rule.category ? (
                        <>
                          <span>•</span>
                          <span>{rule.category}</span>
                        </>
                      ) : null}
                    </>
                  )}
                />

                <Card className="border-border/50 bg-background/55 shadow-none">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        {transactionDraft.id ? 'Edit transaction rule' : 'New transaction rule'}
                      </CardTitle>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setTransactionDraft(emptyTransactionRuleDraft())}
                      >
                        Reset
                      </Button>
                    </div>
                    <CardDescription>
                      Match ledger transactions by field/value and set category ownership defaults.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LabeledInput
                        label="Rule name"
                        value={transactionDraft.name}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, name: value }))
                        }
                      />
                      <LabeledInput
                        label="Priority"
                        type="number"
                        value={transactionDraft.priority}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, priority: value }))
                        }
                      />
                    </div>

                    <ToggleField
                      label="Enabled"
                      checked={transactionDraft.enabled}
                      onChange={(value) =>
                        setTransactionDraft((prev) => ({ ...prev, enabled: value }))
                      }
                    />

                    <div className="grid gap-3 sm:grid-cols-3">
                      <SelectField
                        label="Match field"
                        value={transactionDraft.matchField}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, matchField: value }))
                        }
                        options={workspace?.options.transactionRuleMatchFields ?? Array.from(TRANSACTION_RULE_MATCH_FIELDS)}
                      />
                      <SelectField
                        label="Match mode"
                        value={transactionDraft.matchMode}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, matchMode: value }))
                        }
                        options={workspace?.options.matchModes ?? Array.from(MATCH_MODES)}
                      />
                      <LabeledInput
                        label="Match value"
                        value={transactionDraft.matchValue}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, matchValue: value }))
                        }
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Transaction type"
                        value={transactionDraft.appliesToType}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, appliesToType: value }))
                        }
                        options={workspace?.options.transactionTypes ?? Array.from(TRANSACTION_TYPES)}
                      />
                      <SelectField
                        label="Ownership"
                        value={transactionDraft.ownership}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, ownership: value }))
                        }
                        options={ownershipOptions}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <DatalistField
                        label="Category"
                        value={transactionDraft.category}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, category: value }))
                        }
                        options={categoryOptions}
                        listId="phase4-transaction-rule-categories"
                      />
                      <SelectField
                        label="Linked account"
                        value={transactionDraft.linkedAccountId}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, linkedAccountId: value }))
                        }
                        options={['', ...accountOptions.map((option) => option.id)]}
                        labels={Object.fromEntries(accountOptions.map((option) => [option.id, `${option.name} (${option.type})`]))}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <LabeledInput
                        label="Min amount"
                        type="number"
                        step="0.01"
                        value={transactionDraft.minAmount}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, minAmount: value }))
                        }
                      />
                      <LabeledInput
                        label="Max amount"
                        type="number"
                        step="0.01"
                        value={transactionDraft.maxAmount}
                        onChange={(value) =>
                          setTransactionDraft((prev) => ({ ...prev, maxAmount: value }))
                        }
                      />
                    </div>

                    <LabeledTextarea
                      label="Notes"
                      value={transactionDraft.note}
                      onChange={(value) =>
                        setTransactionDraft((prev) => ({ ...prev, note: value }))
                      }
                    />

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setTransactionDraft(emptyTransactionRuleDraft())}>
                        <Trash2 className="h-4 w-4" />
                        Clear
                      </Button>
                      <Button onClick={handleSaveTransactionRule} disabled={isSavingRule}>
                        {isSavingRule ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save rule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="income_allocation" className="mt-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <RuleListPanel
                  title="Income allocation rules"
                  rows={workspace?.incomeAllocationRules ?? []}
                  onEdit={startEditIncomeRule}
                  onDelete={(id) => handleDeleteRule('income_allocation', id)}
                  deletingRuleId={deletingRuleId}
                  renderRowMeta={(rule) => (
                    <>
                      <span>{rule.matchMode}</span>
                      <span>•</span>
                      <span>{rule.incomeSourcePattern}</span>
                      <span>•</span>
                      <span>{rule.allocations.length} allocations</span>
                    </>
                  )}
                />

                <Card className="border-border/50 bg-background/55 shadow-none">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        {incomeRuleDraft.id ? 'Edit income allocation rule' : 'New income allocation rule'}
                      </CardTitle>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setIncomeRuleDraft(emptyIncomeRuleDraft())}
                      >
                        Reset
                      </Button>
                    </div>
                    <CardDescription>
                      Match an income source and split it across categories/accounts by percent or fixed amounts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <LabeledInput
                        label="Rule name"
                        value={incomeRuleDraft.name}
                        onChange={(value) =>
                          setIncomeRuleDraft((prev) => ({ ...prev, name: value }))
                        }
                      />
                      <LabeledInput
                        label="Priority"
                        type="number"
                        value={incomeRuleDraft.priority}
                        onChange={(value) =>
                          setIncomeRuleDraft((prev) => ({ ...prev, priority: value }))
                        }
                      />
                    </div>

                    <ToggleField
                      label="Enabled"
                      checked={incomeRuleDraft.enabled}
                      onChange={(value) =>
                        setIncomeRuleDraft((prev) => ({ ...prev, enabled: value }))
                      }
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <DatalistField
                        label="Income source pattern"
                        value={incomeRuleDraft.incomeSourcePattern}
                        onChange={(value) =>
                          setIncomeRuleDraft((prev) => ({ ...prev, incomeSourcePattern: value }))
                        }
                        listId="phase4-income-rule-source-patterns"
                        options={incomeSourceHints}
                      />
                      <SelectField
                        label="Match mode"
                        value={incomeRuleDraft.matchMode}
                        onChange={(value) =>
                          setIncomeRuleDraft((prev) => ({ ...prev, matchMode: value }))
                        }
                        options={workspace?.options.matchModes ?? Array.from(MATCH_MODES)}
                      />
                    </div>

                    <LabeledTextarea
                      label="Notes"
                      value={incomeRuleDraft.note}
                      onChange={(value) =>
                        setIncomeRuleDraft((prev) => ({ ...prev, note: value }))
                      }
                    />

                    <div className="rounded-xl border border-border/50 bg-card/25 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                          Allocations
                        </p>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            setIncomeRuleDraft((prev) => ({
                              ...prev,
                              allocations: [...prev.allocations, emptyIncomeAllocationRow()],
                            }))
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add allocation
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {incomeRuleDraft.allocations.map((row, index) => (
                          <div key={row.id} className="rounded-lg border border-border/50 bg-background/55 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-medium">Allocation {index + 1}</p>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations:
                                      prev.allocations.length <= 1
                                        ? prev.allocations
                                        : prev.allocations.filter((item) => item.id !== row.id),
                                  }))
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <LabeledInput
                                label="Label"
                                value={row.label}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id ? { ...item, label: value } : item,
                                    ),
                                  }))
                                }
                              />
                              <DatalistField
                                label="Category"
                                value={row.category}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id ? { ...item, category: value } : item,
                                    ),
                                  }))
                                }
                                options={categoryOptions}
                                listId={`phase4-income-rule-categories-${index}`}
                              />
                              <LabeledInput
                                label="Percent"
                                type="number"
                                step="0.01"
                                value={row.percent}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id ? { ...item, percent: value } : item,
                                    ),
                                  }))
                                }
                              />
                              <LabeledInput
                                label="Fixed amount"
                                type="number"
                                step="0.01"
                                value={row.fixedAmount}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id ? { ...item, fixedAmount: value } : item,
                                    ),
                                  }))
                                }
                              />
                              <SelectField
                                label="Ownership"
                                value={row.ownership}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id ? { ...item, ownership: value } : item,
                                    ),
                                  }))
                                }
                                options={ownershipOptions}
                              />
                              <SelectField
                                label="Destination account"
                                value={row.destinationAccountId}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id
                                        ? { ...item, destinationAccountId: value }
                                        : item,
                                    ),
                                  }))
                                }
                                options={['', ...accountOptions.map((option) => option.id)]}
                                labels={Object.fromEntries(accountOptions.map((option) => [option.id, `${option.name} (${option.type})`]))}
                              />
                            </div>
                            <div className="mt-2">
                              <LabeledTextarea
                                label="Note"
                                value={row.note}
                                onChange={(value) =>
                                  setIncomeRuleDraft((prev) => ({
                                    ...prev,
                                    allocations: prev.allocations.map((item) =>
                                      item.id === row.id ? { ...item, note: value } : item,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIncomeRuleDraft(emptyIncomeRuleDraft())}>
                        <Trash2 className="h-4 w-4" />
                        Clear
                      </Button>
                      <Button onClick={handleSaveIncomeRule} disabled={isSavingRule}>
                        {isSavingRule ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save rule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            <CardTitle className="text-base">Cycle Alerts</CardTitle>
          </div>
          <CardDescription>
            Alerts generated by Phase 4 sweeps and monthly automation checks. Open alerts are shown first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[22rem] rounded-xl border border-border/50 bg-background/55 p-2">
            <div className="space-y-2">
              {(workspace?.cycleAlerts ?? []).length ? (
                (workspace?.cycleAlerts ?? []).map((alert) => (
                  <div key={alert.id} className="rounded-xl border border-border/50 bg-card/35 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{alert.title}</p>
                          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', alertTone(alert.severity))}>
                            {alert.severity}
                          </Badge>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-border/60">
                            {alert.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{alert.detail}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {alert.cycleKey ? <span>Cycle {alert.cycleKey}</span> : null}
                          {alert.entityType ? <span>{alert.entityType}</span> : null}
                          {alert.dueAt ? <span>Due {formatMaybeDate(alert.dueAt)}</span> : null}
                          <span>Updated {formatAge(alert.updatedAt)}</span>
                        </div>
                      </div>
                      {alert.actionHref ? (
                        <a
                          href={alert.actionHref}
                          className="rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
                        >
                          {alert.actionLabel || 'Open'}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-10 text-center text-sm text-muted-foreground">
                  No cycle alerts yet. Run the sweep now or wait for scheduled cron sweeps to generate alerts.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MiniStatCard
          icon={Bell}
          label="Open alerts"
          value={String(openAlerts.length)}
          hint={openAlerts[0] ? openAlerts[0].title : 'No active alerts'}
          tone={openAlerts.length ? 'warning' : 'neutral'}
        />
        <MiniStatCard
          icon={Sparkles}
          label="Open suggestions"
          value={String(openIncomeSuggestions.length + openSubscriptionSuggestions.length)}
          hint={
            openIncomeSuggestions.length + openSubscriptionSuggestions.length
              ? 'Review and accept to automate'
              : 'No pending suggestions'
          }
          tone={openIncomeSuggestions.length + openSubscriptionSuggestions.length ? 'warning' : 'neutral'}
        />
        <MiniStatCard
          icon={Bot}
          label="Last cycle run"
          value={workspace?.stats.lastCycleRunAt ? format(new Date(workspace.stats.lastCycleRunAt), 'MMM d') : 'N/A'}
          hint={workspace?.stats.lastCycleRunStatus ?? 'No cycle runs found'}
          tone={workspace?.stats.lastCycleRunStatus === 'completed' ? 'positive' : 'neutral'}
        />
        <MiniStatCard
          icon={Settings2}
          label="Automation state"
          value={workspace?.preferences.monthlyAutomationEnabled ? 'Enabled' : 'Manual'}
          hint={workspace?.stats.nextMonthlyRunHint ?? 'Set in financePreferences'}
          tone={workspace?.preferences.monthlyAutomationEnabled ? 'positive' : 'neutral'}
        />
      </div>
    </div>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/55 px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <span className={cn('text-xs', checked ? 'text-emerald-300' : 'text-muted-foreground')}>
          {checked ? 'On' : 'Off'}
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-border bg-background"
        />
      </span>
    </label>
  )
}

function LabeledInput({
  label,
  onChange,
  value,
  type = 'text',
  ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-background/60"
        {...rest}
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labels?: Record<string, string>
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border/70 bg-background/60 px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option || '__empty'} value={option}>
            {labels?.[option] ?? (option || 'None')}
          </option>
        ))}
      </select>
    </div>
  )
}

function DatalistField({
  label,
  value,
  onChange,
  options,
  listId,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  listId: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        className="bg-background/60"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none ring-0 transition focus:border-border"
      />
    </div>
  )
}

function SuggestionListCard<T>({
  title,
  description,
  items,
  renderItem,
  emptyLabel,
}: {
  title: string
  description: string
  items: T[]
  renderItem: (item: T) => React.ReactNode
  emptyLabel: string
}) {
  return (
    <Card className="border-border/50 bg-background/55 shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[24rem] rounded-xl border border-border/50 bg-card/20 p-2">
          <div className="space-y-2">
            {items.length ? (
              items.map((item, index) => (
                <div key={index} className="rounded-xl border border-border/50 bg-card/35 p-3">
                  {renderItem(item)}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-8 text-center text-sm text-muted-foreground">
                {emptyLabel}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function RuleListPanel<T extends { id: string; name: string; enabled: boolean; updatedAt: number }>(props: {
  title: string
  rows: T[]
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  deletingRuleId: string | null
  renderRowMeta: (row: T) => React.ReactNode
}) {
  const { title, rows, onEdit, onDelete, deletingRuleId, renderRowMeta } = props
  return (
    <Card className="border-border/50 bg-background/55 shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>
          Stored in live Convex tables with priority ordering and audit logging.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[38rem] rounded-xl border border-border/50 bg-card/20 p-2">
          <div className="space-y-2">
            {rows.length ? (
              rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-border/50 bg-card/35 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 px-1.5 text-[10px] bg-transparent',
                            row.enabled
                              ? 'border-emerald-400/25 text-emerald-300'
                              : 'border-muted text-muted-foreground',
                          )}
                        >
                          {row.enabled ? 'enabled' : 'disabled'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {renderRowMeta(row)}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Updated {formatAge(row.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="xs" variant="outline" onClick={() => onEdit(row.id)}>
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => onDelete(row.id)}
                        disabled={deletingRuleId === row.id}
                      >
                        {deletingRuleId === row.id ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No rules saved yet.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function MiniStatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: typeof Bell
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'positive' | 'warning'
}) {
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <CardDescription className="text-xs tracking-[0.12em] uppercase">
            {label}
          </CardDescription>
        </div>
        <CardTitle
          className={cn(
            'finance-display text-xl',
            tone === 'positive' && 'text-emerald-300',
            tone === 'warning' && 'text-amber-300',
          )}
        >
          {value}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
    </Card>
  )
}
