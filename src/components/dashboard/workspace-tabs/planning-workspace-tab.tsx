import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Coins,
  Flag,
  LoaderCircle,
  Repeat,
  PiggyBank,
  Save,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import type { WorkspaceTabKey } from '@/components/dashboard/dashboard-types'
import { KpiWhyDialog } from '@/components/dashboard/kpi-why-dialog'
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
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type PlanningVersionRow = {
  id: string
  cycleKey: string
  name: string
  versionKey: string
  status: string
  scenarioType: string
  scenarioLabel: string
  plannedIncome: number
  plannedExpenses: number
  plannedSavings: number
  plannedNet: number
  horizonMonths: number
  linkedStateId: string
  note: string
  assumptionsJson: string
  recurringScenario: {
    enabled: boolean
    name: string
    intervalMonths: number
    startCycleKey: string
    tags: string[]
  }
  createdAt: number
  updatedAt: number
  taskCounts?: { total: number; open: number; done: number }
}

type PlanningTaskRow = {
  id: string
  planningVersionId: string
  title: string
  status: string
  priority: string
  ownerScope: string
  dueAt: number | null
  impactMonthly: number
  note: string
  linkedEntityType: string
  linkedEntityId: string
  createdAt: number
  updatedAt: number
}

type FinanceStateRow = {
  id: string
  name: string
  stateKind: string
  horizonMonths: number
  monthlyIncome: number
  monthlyExpenses: number
  liquidCash: number
  assets: number
  liabilities: number
  startingNetWorth: number
  expectedReturnPct: number
  inflationPct: number
  currency: string
  note: string
  createdAt: number
  updatedAt: number
}

type GoalEventRow = {
  id: string
  goalId: string
  eventType: string
  amount: number
  note: string
  occurredAt: number | null
  createdAt: number
  updatedAt: number
}

type GoalRow = {
  id: string
  title: string
  category: string
  status: string
  priority: string
  ownership: string
  targetAmount: number
  currentAmount: number
  monthlyContribution: number
  dueAt: number | null
  dueLabel: string
  currency: string
  note: string
  progressPct: number
  remainingAmount: number
  monthsToTarget: number | null
  lastEventAt: number | null
  recentEvents: GoalEventRow[]
  createdAt: number
  updatedAt: number
}

type EnvelopeBudgetRow = {
  id: string
  cycleKey: string
  category: string
  plannedAmount: number
  actualAmount: number
  carryoverAmount: number
  remainingAmount: number
  utilizationPct: number
  ownership: string
  status: string
  rollover: boolean
  note: string
  currency: string
  createdAt: number
  updatedAt: number
}

type ForecastData = {
  baseCurrency: string
  displayCurrency: string
  currentCycleKey: string
  selectedCycleKey: string
  baseline: {
    monthlyIncome: number
    monthlyExpenses: number
    monthlyBills: number
    monthlyCardMinimums: number
    monthlyLoanMinimums: number
    monthlyNet: number
    liquidCash: number
    totalAssets: number
    liabilities: number
    netWorth: number
    envelopePlannedForSelectedCycle: number
    envelopeActualForSelectedCycle: number
    envelopeCarryoverForSelectedCycle: number
  }
  scenarios: Array<{
    id: string
    label: string
    scenarioLabel: string
    source: string
    horizonMonths: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlyNet: number
    projectedNetWorth: number
    projectedLiquidCash: number
    runwayMonths: number | null
    expectedReturnPct: number | null
    inflationPct: number | null
    note: string
    linkedId: string | null
    recurringSummary: string | null
  }>
  activePlanningVersionId: string | null
  activePlanningVersionSummary: {
    id: string
    name: string
    cycleKey: string
    status: string
    scenarioType: string
    taskCounts: { total: number; open: number; done: number }
    plannedIncome: number
    plannedExpenses: number
    plannedSavings: number
    plannedNet: number
    horizonMonths: number
  } | null
  goals: Array<{
    id: string
    title: string
    category: string
    status: string
    priority: string
    targetAmount: number
    currentAmount: number
    monthlyContribution: number
    progressPct: number
    remainingAmount: number
    monthsToTarget: number | null
    dueAt: number | null
    projectedCompletionAt: number | null
    onTrack: boolean
    recentEvents: GoalEventRow[]
  }>
  envelopes: {
    selectedCycleKey: string
    totals: {
      planned: number
      actual: number
      carryover: number
      remaining: number
      utilizationPct: number
    }
    categories: Array<{
      id: string
      category: string
      plannedAmount: number
      actualAmount: number
      carryoverAmount: number
      remainingAmount: number
      utilizationPct: number
      ownership: string
      status: string
    }>
  }
  tasks: {
    total: number
    done: number
    blocked: number
    inProgress: number
    todo: number
  }
  cashflowFragility: {
    score: number
    level: 'low' | 'medium' | 'high'
    dueClusterScore: number
    lowBufferScore: number
    lowBufferDays: number
    dueDayClusters: Array<{ day: number; amount: number; source: string }>
    insights: string[]
  }
  spendingLens: {
    fixed: number
    variable: number
    controllable: number
    total: number
    shares: {
      fixed: number
      variable: number
      controllable: number
    }
  }
}

type PlanningWorkspaceData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  displayCurrency: string
  locale: string
  baseCurrency: string
  currentCycleKey: string
  selectedCycleKey: string
  options: {
    cycleKeys: string[]
    categories: string[]
    ownershipOptions: string[]
    accountOptions: Array<{ id: string; name: string; type: string }>
    currencyOptions: string[]
  }
  forecast: ForecastData
  planningVersions: PlanningVersionRow[]
  planningActionTasks: PlanningTaskRow[]
  personalFinanceStates: FinanceStateRow[]
  goals: GoalRow[]
  goalEvents: GoalEventRow[]
  envelopeBudgets: EnvelopeBudgetRow[]
}

type PlanningVersionDraft = {
  id: string | null
  cycleKey: string
  name: string
  versionKey: string
  status: string
  scenarioType: string
  plannedIncome: string
  plannedExpenses: string
  plannedSavings: string
  plannedNet: string
  horizonMonths: string
  linkedStateId: string
  note: string
  assumptionsJson: string
  recurringEnabled: boolean
  recurringName: string
  recurringIntervalMonths: string
  recurringStartCycleKey: string
  recurringTags: string
}

type PlanningTaskDraft = {
  id: string | null
  planningVersionId: string
  title: string
  status: string
  priority: string
  ownerScope: string
  dueDate: string
  impactMonthly: string
  note: string
  linkedEntityType: string
  linkedEntityId: string
}

type FinanceStateDraft = {
  id: string | null
  name: string
  stateKind: string
  horizonMonths: string
  monthlyIncome: string
  monthlyExpenses: string
  liquidCash: string
  assets: string
  liabilities: string
  startingNetWorth: string
  expectedReturnPct: string
  inflationPct: string
  currency: string
  note: string
}

type GoalDraft = {
  id: string | null
  title: string
  category: string
  status: string
  priority: string
  ownership: string
  targetAmount: string
  currentAmount: string
  monthlyContribution: string
  dueDate: string
  dueLabel: string
  currency: string
  note: string
}

type GoalEventDraft = {
  goalId: string
  eventType: string
  amount: string
  occurredDate: string
  note: string
  applyToGoalCurrent: boolean
}

type EnvelopeDraft = {
  id: string | null
  cycleKey: string
  category: string
  plannedAmount: string
  actualAmount: string
  carryoverAmount: string
  ownership: string
  status: string
  rollover: boolean
  currency: string
  note: string
}

function numberOrZero(value: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function dateInputValue(timestamp: number | null | undefined) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInputMs(value: string) {
  if (!value.trim()) return undefined
  const parsed = new Date(`${value}T12:00:00`).getTime()
  return Number.isFinite(parsed) ? parsed : undefined
}

function formatAge(timestamp: number | null | undefined) {
  if (!timestamp) return 'Never'
  return formatDistanceToNowStrict(timestamp, { addSuffix: true })
}

function scenarioTypeLabel(scenarioType: string) {
  if (scenarioType === 'downside') return 'Tight month'
  if (scenarioType === 'recovery') return 'Recovery month'
  if (scenarioType === 'stretch') return 'Growth month'
  return 'Normal month'
}

function addMonthsToCycleKey(cycleKey: string, offsetMonths: number) {
  const [yearRaw, monthRaw] = cycleKey.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return cycleKey
  const anchor = new Date(year, month - 1, 1)
  anchor.setMonth(anchor.getMonth() + offsetMonths)
  const nextYear = anchor.getFullYear()
  const nextMonth = String(anchor.getMonth() + 1).padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

function emptyPlanningVersionDraft(cycleKey: string): PlanningVersionDraft {
  return {
    id: null,
    cycleKey,
    name: '',
    versionKey: 'v1',
    status: 'draft',
    scenarioType: 'base',
    plannedIncome: '',
    plannedExpenses: '',
    plannedSavings: '',
    plannedNet: '',
    horizonMonths: '12',
    linkedStateId: '',
    note: '',
    assumptionsJson: '{\n  "headline": ""\n}',
    recurringEnabled: false,
    recurringName: '',
    recurringIntervalMonths: '1',
    recurringStartCycleKey: cycleKey,
    recurringTags: '',
  }
}

function emptyPlanningTaskDraft(versionId = ''): PlanningTaskDraft {
  return {
    id: null,
    planningVersionId: versionId,
    title: '',
    status: 'todo',
    priority: 'medium',
    ownerScope: 'shared',
    dueDate: '',
    impactMonthly: '',
    note: '',
    linkedEntityType: '',
    linkedEntityId: '',
  }
}

function emptyFinanceStateDraft(currency: string): FinanceStateDraft {
  return {
    id: null,
    name: '',
    stateKind: 'scenario',
    horizonMonths: '12',
    monthlyIncome: '',
    monthlyExpenses: '',
    liquidCash: '',
    assets: '',
    liabilities: '',
    startingNetWorth: '',
    expectedReturnPct: '4',
    inflationPct: '2',
    currency,
    note: '',
  }
}

function emptyGoalDraft(currency: string): GoalDraft {
  return {
    id: null,
    title: '',
    category: '',
    status: 'active',
    priority: 'medium',
    ownership: 'shared',
    targetAmount: '',
    currentAmount: '',
    monthlyContribution: '',
    dueDate: '',
    dueLabel: '',
    currency,
    note: '',
  }
}

function emptyGoalEventDraft(goalId = ''): GoalEventDraft {
  return {
    goalId,
    eventType: 'contribution',
    amount: '',
    occurredDate: dateInputValue(Date.now()),
    note: '',
    applyToGoalCurrent: true,
  }
}

function emptyEnvelopeDraft(cycleKey: string, currency: string): EnvelopeDraft {
  return {
    id: null,
    cycleKey,
    category: '',
    plannedAmount: '',
    actualAmount: '',
    carryoverAmount: '0',
    ownership: 'shared',
    status: 'draft',
    rollover: false,
    currency,
    note: '',
  }
}

export function PlanningWorkspaceTab({
  displayCurrency,
  displayLocale,
  thumbMode = false,
  onNavigateTab,
  openSubTabSignal = 0,
  openSubTabValue = null,
}: {
  displayCurrency: string
  displayLocale: string
  thumbMode?: boolean
  onNavigateTab?: (tab: WorkspaceTabKey) => void
  openSubTabSignal?: number
  openSubTabValue?: 'forecast' | 'plans' | 'goals' | 'envelopes' | null
}) {
  const [subTab, setSubTab] = useState<'forecast' | 'plans' | 'goals' | 'envelopes'>('forecast')
  const [plansSubTab, setPlansSubTab] = useState<'versions' | 'tasks' | 'states'>('versions')
  const [selectedEnvelopeCycle, setSelectedEnvelopeCycle] = useState<string | undefined>(undefined)
  const [handledOpenSubTabSignal, setHandledOpenSubTabSignal] = useState(0)

  const workspace = useQuery(api.planning.getPhaseFivePlanningWorkspace, {
    displayCurrency,
    locale: displayLocale,
    cycleKey: selectedEnvelopeCycle,
  }) as PlanningWorkspaceData | undefined

  const upsertPhaseFiveEntity = useMutation(api.planning.upsertPhaseFiveEntity)
  const deletePhaseFiveEntity = useMutation(api.planning.deletePhaseFiveEntity)
  const recordGoalEvent = useMutation(api.planning.recordGoalEvent)

  const workspaceCurrency = workspace?.displayCurrency ?? displayCurrency
  const workspaceLocale = workspace?.locale ?? displayLocale
  const money = createCurrencyFormatters(workspaceLocale, workspaceCurrency).money
  const compactCurrency = createCurrencyFormatters(workspaceLocale, workspaceCurrency).compactCurrency

  const [versionDraft, setVersionDraft] = useState<PlanningVersionDraft>(() =>
    emptyPlanningVersionDraft(new Date().toISOString().slice(0, 7)),
  )
  const [taskDraft, setTaskDraft] = useState<PlanningTaskDraft>(() => emptyPlanningTaskDraft())
  const [stateDraft, setStateDraft] = useState<FinanceStateDraft>(() => emptyFinanceStateDraft(displayCurrency))
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(() => emptyGoalDraft(displayCurrency))
  const [goalEventDraft, setGoalEventDraft] = useState<GoalEventDraft>(() => emptyGoalEventDraft())
  const [envelopeDraft, setEnvelopeDraft] = useState<EnvelopeDraft>(() =>
    emptyEnvelopeDraft(new Date().toISOString().slice(0, 7), displayCurrency),
  )
  const [skipPurchaseDraft, setSkipPurchaseDraft] = useState<{
    amount: string
    frequencyPerMonth: string
    label: string
  }>({
    amount: '',
    frequencyPerMonth: '1',
    label: 'Skipped purchase',
  })
  const [isSavingEntity, setIsSavingEntity] = useState(false)
  const [isRecordingGoalEvent, setIsRecordingGoalEvent] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace) return
    if (!selectedEnvelopeCycle) {
      setSelectedEnvelopeCycle(workspace.selectedCycleKey)
    }
    setVersionDraft((prev) =>
      prev.id || prev.name
        ? prev
        : emptyPlanningVersionDraft(workspace.selectedCycleKey || workspace.currentCycleKey),
    )
    setTaskDraft((prev) =>
      prev.id || prev.title
        ? prev
        : emptyPlanningTaskDraft(workspace.planningVersions[0]?.id ?? ''),
    )
    setStateDraft((prev) => (prev.id || prev.name ? prev : emptyFinanceStateDraft(workspace.baseCurrency)))
    setGoalDraft((prev) => (prev.id || prev.title ? prev : emptyGoalDraft(workspace.baseCurrency)))
    setGoalEventDraft((prev) =>
      prev.goalId || workspace.goals.length === 0 ? prev : emptyGoalEventDraft(workspace.goals[0]?.id ?? ''),
    )
    setEnvelopeDraft((prev) =>
      prev.id || prev.category
        ? prev
        : emptyEnvelopeDraft(workspace.selectedCycleKey || workspace.currentCycleKey, workspace.baseCurrency),
    )
  }, [workspace, selectedEnvelopeCycle])

  useEffect(() => {
    if (!openSubTabSignal) return
    if (handledOpenSubTabSignal === openSubTabSignal) return
    if (
      openSubTabValue === 'forecast' ||
      openSubTabValue === 'plans' ||
      openSubTabValue === 'goals' ||
      openSubTabValue === 'envelopes'
    ) {
      setSubTab(openSubTabValue)
    }
    setHandledOpenSubTabSignal(openSubTabSignal)
  }, [handledOpenSubTabSignal, openSubTabSignal, openSubTabValue])

  const categoryOptions = workspace?.options.categories ?? []
  const ownershipOptions = workspace?.options.ownershipOptions ?? ['personal', 'shared', 'business', 'household']
  const currencyOptions = workspace?.options.currencyOptions ?? [workspaceCurrency]

  const planningVersionsById = useMemo(
    () => new Map((workspace?.planningVersions ?? []).map((row) => [row.id, row])),
    [workspace?.planningVersions],
  )
  const recurringScenarioTemplates = useMemo(
    () => [
      {
        key: 'school-holidays',
        label: 'School holidays',
        scenarioType: 'downside',
        intervalMonths: 12,
        tags: 'family, seasonal',
      },
      {
        key: 'winter-energy',
        label: 'Winter energy',
        scenarioType: 'downside',
        intervalMonths: 12,
        tags: 'utilities, winter',
      },
      {
        key: 'travel-month',
        label: 'Travel month',
        scenarioType: 'recovery',
        intervalMonths: 6,
        tags: 'travel, discretionary',
      },
    ],
    [],
  )

  const openTaskCount = (workspace?.planningActionTasks ?? []).filter((task) => task.status !== 'done').length

  const saveEntity = async (
    entityType: 'planning_version' | 'planning_task' | 'finance_state' | 'goal' | 'envelope_budget',
    id: string | null,
    values: Record<string, unknown>,
    successLabel: string,
  ) => {
    setIsSavingEntity(true)
    try {
      const result = await upsertPhaseFiveEntity({
        entityType,
        id: id ?? undefined,
        valuesJson: JSON.stringify(values),
      })
      toast.success(`${successLabel} ${result.mode === 'created' ? 'created' : 'updated'}`)
      return result
    } catch (error) {
      console.error(error)
      toast.error(`Failed to save ${successLabel.toLowerCase()}`, {
        description: error instanceof Error ? error.message : 'Convex rejected the request.',
      })
      return null
    } finally {
      setIsSavingEntity(false)
    }
  }

  const handleSavePlanningVersion = async () => {
    if (!versionDraft.name.trim()) {
      toast.error('Planning version name is required')
      return
    }
    let assumptionsObject: Record<string, unknown>
    try {
      assumptionsObject = JSON.parse(versionDraft.assumptionsJson || '{}')
    } catch {
      toast.error('Assumptions JSON must be valid JSON')
      return
    }
    assumptionsObject = {
      ...(assumptionsObject ?? {}),
    }
    if (versionDraft.recurringEnabled) {
      assumptionsObject.recurringScenario = {
        enabled: true,
        name: versionDraft.recurringName.trim() || versionDraft.name.trim(),
        intervalMonths: Math.max(
          1,
          Math.min(12, numberOrZero(versionDraft.recurringIntervalMonths || '1') || 1),
        ),
        startCycleKey:
          versionDraft.recurringStartCycleKey || versionDraft.cycleKey || workspace?.selectedCycleKey,
        tags: versionDraft.recurringTags
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 8),
      }
    } else {
      delete assumptionsObject.recurringScenario
    }

    const assumptionsJson = JSON.stringify(assumptionsObject, null, 2)
    const result = await saveEntity(
      'planning_version',
      versionDraft.id,
      {
        cycleKey: versionDraft.cycleKey,
        name: versionDraft.name,
        versionKey: versionDraft.versionKey,
        status: versionDraft.status,
        scenarioType: versionDraft.scenarioType,
        plannedIncome: numberOrZero(versionDraft.plannedIncome),
        plannedExpenses: numberOrZero(versionDraft.plannedExpenses),
        plannedSavings: numberOrZero(versionDraft.plannedSavings),
        plannedNet: numberOrZero(versionDraft.plannedNet),
        horizonMonths: Number(versionDraft.horizonMonths || 12),
        linkedStateId: versionDraft.linkedStateId || undefined,
        note: versionDraft.note || undefined,
        assumptionsJson,
      },
      'Planning version',
    )
    if (result) {
      setVersionDraft(emptyPlanningVersionDraft(versionDraft.cycleKey || workspace?.selectedCycleKey || ''))
    }
  }

  const handleSavePlanningTask = async () => {
    if (!taskDraft.title.trim()) {
      toast.error('Task title is required')
      return
    }
    const result = await saveEntity(
      'planning_task',
      taskDraft.id,
      {
        planningVersionId: taskDraft.planningVersionId || undefined,
        title: taskDraft.title,
        status: taskDraft.status,
        priority: taskDraft.priority,
        ownerScope: taskDraft.ownerScope,
        dueAt: parseDateInputMs(taskDraft.dueDate),
        impactMonthly: numberOrZero(taskDraft.impactMonthly),
        note: taskDraft.note || undefined,
        linkedEntityType: taskDraft.linkedEntityType || undefined,
        linkedEntityId: taskDraft.linkedEntityId || undefined,
      },
      'Planning task',
    )
    if (result) {
      setTaskDraft(emptyPlanningTaskDraft(taskDraft.planningVersionId))
    }
  }

  const handleSaveFinanceState = async () => {
    if (!stateDraft.name.trim()) {
      toast.error('Scenario/state name is required')
      return
    }
    const result = await saveEntity(
      'finance_state',
      stateDraft.id,
      {
        name: stateDraft.name,
        stateKind: stateDraft.stateKind,
        horizonMonths: Number(stateDraft.horizonMonths || 12),
        monthlyIncome: numberOrZero(stateDraft.monthlyIncome),
        monthlyExpenses: numberOrZero(stateDraft.monthlyExpenses),
        liquidCash: numberOrZero(stateDraft.liquidCash),
        assets: numberOrZero(stateDraft.assets),
        liabilities: numberOrZero(stateDraft.liabilities),
        startingNetWorth: numberOrZero(stateDraft.startingNetWorth),
        expectedReturnPct: numberOrZero(stateDraft.expectedReturnPct),
        inflationPct: numberOrZero(stateDraft.inflationPct),
        currency: stateDraft.currency,
        note: stateDraft.note || undefined,
      },
      'Finance state',
    )
    if (result) {
      setStateDraft(emptyFinanceStateDraft(stateDraft.currency || workspace?.baseCurrency || displayCurrency))
    }
  }

  const handleSaveGoal = async () => {
    if (!goalDraft.title.trim()) {
      toast.error('Goal title is required')
      return
    }
    const targetAmount = numberOrZero(goalDraft.targetAmount)
    if (targetAmount <= 0) {
      toast.error('Target amount must be greater than zero')
      return
    }
    const result = await saveEntity(
      'goal',
      goalDraft.id,
      {
        title: goalDraft.title,
        category: goalDraft.category || 'general',
        status: goalDraft.status,
        priority: goalDraft.priority,
        ownership: goalDraft.ownership,
        targetAmount,
        currentAmount: numberOrZero(goalDraft.currentAmount),
        monthlyContribution: numberOrZero(goalDraft.monthlyContribution),
        dueAt: parseDateInputMs(goalDraft.dueDate),
        dueLabel: goalDraft.dueLabel || undefined,
        currency: goalDraft.currency,
        note: goalDraft.note || undefined,
      },
      'Goal',
    )
    if (result) {
      setGoalDraft(emptyGoalDraft(goalDraft.currency || workspace?.baseCurrency || displayCurrency))
    }
  }

  const handleRecordGoalEvent = async () => {
    if (!goalEventDraft.goalId) {
      toast.error('Select a goal first')
      return
    }
    const amount = numberOrZero(goalEventDraft.amount)
    if (amount === 0) {
      toast.error('Goal event amount cannot be zero')
      return
    }
    setIsRecordingGoalEvent(true)
    try {
      const result = await recordGoalEvent({
        goalId: goalEventDraft.goalId,
        eventType: goalEventDraft.eventType,
        amount,
        occurredAt: parseDateInputMs(goalEventDraft.occurredDate),
        note: goalEventDraft.note || undefined,
        applyToGoalCurrent: goalEventDraft.applyToGoalCurrent,
      })
      toast.success('Goal event recorded', {
        description:
          result.updatedGoalCurrentAmount != null
            ? `Goal current amount updated to ${money.format(result.updatedGoalCurrentAmount)}.`
            : undefined,
      })
      setGoalEventDraft((prev) => ({ ...emptyGoalEventDraft(prev.goalId), goalId: prev.goalId }))
    } catch (error) {
      console.error(error)
      toast.error('Failed to record goal event', {
        description: error instanceof Error ? error.message : 'Convex rejected the goal event.',
      })
    } finally {
      setIsRecordingGoalEvent(false)
    }
  }

  const handleSaveEnvelope = async () => {
    if (!envelopeDraft.category.trim()) {
      toast.error('Envelope category is required')
      return
    }
    const result = await saveEntity(
      'envelope_budget',
      envelopeDraft.id,
      {
        cycleKey: envelopeDraft.cycleKey,
        category: envelopeDraft.category,
        plannedAmount: numberOrZero(envelopeDraft.plannedAmount),
        actualAmount: numberOrZero(envelopeDraft.actualAmount),
        carryoverAmount: numberOrZero(envelopeDraft.carryoverAmount),
        ownership: envelopeDraft.ownership,
        status: envelopeDraft.status,
        rollover: envelopeDraft.rollover,
        currency: envelopeDraft.currency,
        note: envelopeDraft.note || undefined,
      },
      'Envelope budget',
    )
    if (result) {
      setEnvelopeDraft(emptyEnvelopeDraft(envelopeDraft.cycleKey, envelopeDraft.currency || workspace?.baseCurrency || displayCurrency))
    }
  }

  const handleDeleteEntity = async (
    entityType:
      | 'planning_version'
      | 'planning_task'
      | 'finance_state'
      | 'goal'
      | 'goal_event'
      | 'envelope_budget',
    id: string,
    label: string,
  ) => {
    setDeletingId(id)
    try {
      await deletePhaseFiveEntity({ entityType, id })
      toast.success(`${label} deleted`)
    } catch (error) {
      console.error(error)
      toast.error(`Failed to delete ${label.toLowerCase()}`, {
        description: error instanceof Error ? error.message : 'Convex rejected the delete request.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const forecast = workspace?.forecast
  const selectedEnvelopeRows = (workspace?.envelopeBudgets ?? []).filter(
    (row) => row.cycleKey === (workspace?.selectedCycleKey ?? selectedEnvelopeCycle),
  )
  const skipPurchaseAmount = Math.max(0, numberOrZero(skipPurchaseDraft.amount))
  const skipFrequencyPerMonth = Math.max(0, numberOrZero(skipPurchaseDraft.frequencyPerMonth))
  const skipMonthlyImpact = skipPurchaseAmount * skipFrequencyPerMonth
  const skipAnnualImpact = skipMonthlyImpact * 12
  const skipBaseline = forecast?.baseline
  const skipProjectedMonthlyNet =
    skipBaseline != null ? skipBaseline.monthlyNet + skipMonthlyImpact : null
  const skipProjectedMonthlyExpenses =
    skipBaseline != null ? Math.max(0, skipBaseline.monthlyExpenses - skipMonthlyImpact) : null
  const skipProjectedRunwayMonths =
    skipBaseline != null &&
    skipProjectedMonthlyExpenses != null &&
    skipProjectedMonthlyExpenses > 0
      ? skipBaseline.liquidCash / skipProjectedMonthlyExpenses
      : skipBaseline != null && skipBaseline.liquidCash > 0
        ? null
        : null
  const recurringScenarioRows = (workspace?.planningVersions ?? [])
    .filter((version) => version.recurringScenario.enabled)
    .map((version) => {
      const cadence =
        version.recurringScenario.intervalMonths === 1
          ? 'Monthly'
          : version.recurringScenario.intervalMonths === 2
            ? 'Every 2 months'
            : version.recurringScenario.intervalMonths === 3
              ? 'Quarterly'
              : `Every ${version.recurringScenario.intervalMonths} months`
      const nextCycle = addMonthsToCycleKey(
        version.recurringScenario.startCycleKey,
        version.recurringScenario.intervalMonths,
      )
      return {
        id: version.id,
        name: version.recurringScenario.name || version.name,
        cadence,
        nextCycle,
        scenarioLabel: version.scenarioLabel || scenarioTypeLabel(version.scenarioType),
        tags: version.recurringScenario.tags,
      }
    })
    .slice(0, 8)

  const fragility = forecast?.cashflowFragility
  const spendingLens = forecast?.spendingLens
  const goalDelayImpacts = (forecast?.goals ?? [])
    .filter((goal) => goal.status === 'active')
    .map((goal) => {
      const baselineMonths =
        goal.monthsToTarget ??
        (goal.monthlyContribution > 0
          ? Math.ceil(Math.max(0, goal.remainingAmount) / goal.monthlyContribution)
          : null)
      const adjustedMonthlyContribution = Math.max(0, goal.monthlyContribution - skipMonthlyImpact)
      const adjustedMonths =
        adjustedMonthlyContribution > 0
          ? Math.ceil(Math.max(0, goal.remainingAmount) / adjustedMonthlyContribution)
          : null
      const delayMonths =
        baselineMonths == null || adjustedMonths == null ? null : Math.max(0, adjustedMonths - baselineMonths)
      return {
        id: goal.id,
        title: goal.title,
        baselineMonths,
        adjustedMonths,
        delayMonths,
      }
    })
    .filter((entry) => entry.delayMonths == null || entry.delayMonths > 0)
    .slice(0, 4)

  return (
    <div className="grid gap-4">
      {thumbMode ? (
        <Card className="finance-panel border-primary/30 bg-primary/8 shadow-none">
          <CardHeader className="gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Thumb actions</CardTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/12 text-primary">
                <Smartphone className="h-3.5 w-3.5" />
                Planning
              </Badge>
            </div>
            <CardDescription>Quick scenario, goals, and execution shortcuts.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button size="sm" variant="outline" onClick={() => setSubTab('forecast')}>
              <TrendingUp className="h-4 w-4" />
              Forecast
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubTab('plans')}>
              <CalendarRange className="h-4 w-4" />
              Plans
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubTab('goals')}>
              <Target className="h-4 w-4" />
              Goals
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSubTab('envelopes')}>
              <Coins className="h-4 w-4" />
              Envelopes
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
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base">Planning & Forecasting</CardTitle>
                  <CardDescription>
                    Phase 5 workspace for monthly planning versions, scenario states, goals, goal events, and envelope budgeting.
                  </CardDescription>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {workspace?.planningVersions.length ?? 0} plan versions
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {workspace?.planningActionTasks.length ?? 0} planning tasks
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {workspace?.goals.length ?? 0} goals
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-transparent">
                {workspace?.envelopeBudgets.length ?? 0} envelopes
              </Badge>
              {workspace === undefined ? (
                <Badge variant="secondary" className="bg-card/55">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Loading Phase 5 data
                </Badge>
              ) : null}
            </div>
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

      <Tabs value={subTab} onValueChange={(value) => setSubTab(value as typeof subTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="envelopes">Envelopes</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={TrendingUp}
              label="Monthly Net"
              value={forecast ? money.format(forecast.baseline.monthlyNet) : '...'}
              hint="Live baseline from incomes, bills, cards, and loans"
              tone={forecast && forecast.baseline.monthlyNet >= 0 ? 'positive' : 'warning'}
            />
            <MetricCard
              icon={PiggyBank}
              label="Liquid Cash"
              value={forecast ? compactCurrency.format(forecast.baseline.liquidCash) : '...'}
              hint={forecast ? `Runway ${(forecast.scenarios[0]?.runwayMonths ?? 0).toFixed?.(1) ?? '0'} months` : 'Runway estimate'}
              tone="neutral"
            />
            <MetricCard
              icon={Target}
              label="Goals On Track"
              value={forecast ? String(forecast.goals.filter((goal) => goal.onTrack).length) : '...'}
              hint={forecast ? `${forecast.goals.length} goal forecasts` : 'Goal projections'}
              tone="neutral"
            />
            <MetricCard
              icon={Coins}
              label="Envelope Planned"
              value={forecast ? money.format(forecast.envelopes.totals.planned) : '...'}
              hint={forecast ? `Cycle ${forecast.envelopes.selectedCycleKey}` : 'Selected cycle'}
              tone="neutral"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Scenario Comparisons</CardTitle>
                <CardDescription>
                  Compare baseline, active planning version, and personal finance scenario states over their forecast horizons.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {(forecast?.scenarios ?? []).length ? (
                    forecast?.scenarios.map((scenario) => (
                      <div key={scenario.id} className="rounded-xl border border-border/50 bg-background/55 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{scenario.label}</p>
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                {scenario.source}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'h-5 px-1.5 text-[10px]',
                                  scenario.scenarioLabel === 'Tight month' &&
                                    'border-amber-400/25 bg-amber-500/10 text-amber-200',
                                  scenario.scenarioLabel === 'Recovery month' &&
                                    'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
                                )}
                              >
                                {scenario.scenarioLabel}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {scenario.horizonMonths} month horizon · {scenario.note || 'No note'}
                            </p>
                            {scenario.recurringSummary ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {scenario.recurringSummary}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right text-xs">
                            <p className={cn('font-semibold', scenario.monthlyNet >= 0 ? 'text-emerald-300' : 'text-amber-300')}>
                              {scenario.monthlyNet >= 0 ? '+' : ''}
                              {money.format(scenario.monthlyNet)} /mo
                            </p>
                            <p className="text-muted-foreground">
                              Net worth {compactCurrency.format(scenario.projectedNetWorth)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-4">
                          <InlineStat label="Income" value={money.format(scenario.monthlyIncome)} />
                          <InlineStat label="Expenses" value={money.format(scenario.monthlyExpenses)} />
                          <InlineStat label="Cash" value={compactCurrency.format(scenario.projectedLiquidCash)} />
                          <InlineStat
                            label="Runway"
                            value={
                              scenario.runwayMonths == null
                                ? 'N/A'
                                : `${scenario.runwayMonths.toFixed(1)}m`
                            }
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyBlock label="Create a finance state or planning version to compare scenarios." />
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="h-4 w-4" />
                    Cashflow fragility score
                  </CardTitle>
                  <CardDescription>
                    Risk model based on due-date clustering and low-buffer days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <InlineStat
                      label="Fragility score"
                      value={fragility ? `${fragility.score}/100` : 'N/A'}
                    />
                    <InlineStat
                      label="Risk level"
                      value={fragility ? fragility.level.toUpperCase() : 'N/A'}
                    />
                    <InlineStat
                      label="Due clustering"
                      value={fragility ? `${fragility.dueClusterScore}/100` : 'N/A'}
                    />
                    <InlineStat
                      label="Low buffer days"
                      value={fragility ? `${Math.max(0, Math.round(fragility.lowBufferDays))}d` : 'N/A'}
                    />
                  </div>
                  <div className="space-y-1.5">
                    {(fragility?.insights ?? []).length ? (
                      fragility?.insights.map((insight) => (
                        <div
                          key={insight}
                          className="rounded-lg border border-border/50 bg-background/55 px-3 py-2 text-xs text-muted-foreground"
                        >
                          {insight}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Configure due days and paydays to improve fragility diagnostics.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Fixed vs variable vs controllable</CardTitle>
                  <CardDescription>
                    Spending lens to separate hard obligations from adjustable spend.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <InlineStat
                      label="Fixed"
                      value={spendingLens ? money.format(spendingLens.fixed) : 'N/A'}
                    />
                    <InlineStat
                      label="Variable"
                      value={spendingLens ? money.format(spendingLens.variable) : 'N/A'}
                    />
                    <InlineStat
                      label="Controllable"
                      value={spendingLens ? money.format(spendingLens.controllable) : 'N/A'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Progress value={spendingLens ? spendingLens.shares.fixed * 100 : 0} className="h-2" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Fixed share</span>
                      <span>{spendingLens ? `${(spendingLens.shares.fixed * 100).toFixed(0)}%` : '0%'}</span>
                    </div>
                    <Progress value={spendingLens ? spendingLens.shares.variable * 100 : 0} className="h-2" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Variable share</span>
                      <span>{spendingLens ? `${(spendingLens.shares.variable * 100).toFixed(0)}%` : '0%'}</span>
                    </div>
                    <Progress value={spendingLens ? spendingLens.shares.controllable * 100 : 0} className="h-2" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Controllable share</span>
                      <span>{spendingLens ? `${(spendingLens.shares.controllable * 100).toFixed(0)}%` : '0%'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Active Plan Snapshot</CardTitle>
                  <CardDescription>
                    Current active planning version and execution progress.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {forecast?.activePlanningVersionSummary ? (
                    <>
                      <div className="rounded-xl border border-border/50 bg-background/55 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{forecast.activePlanningVersionSummary.name}</p>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {forecast.activePlanningVersionSummary.status}
                          </Badge>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {forecast.activePlanningVersionSummary.scenarioType}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {forecast.activePlanningVersionSummary.cycleKey} · {forecast.activePlanningVersionSummary.horizonMonths}m horizon
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <InlineStat label="Income" value={money.format(forecast.activePlanningVersionSummary.plannedIncome)} />
                          <InlineStat label="Expenses" value={money.format(forecast.activePlanningVersionSummary.plannedExpenses)} />
                          <InlineStat label="Savings" value={money.format(forecast.activePlanningVersionSummary.plannedSavings)} />
                          <InlineStat label="Net" value={money.format(forecast.activePlanningVersionSummary.plannedNet)} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Task completion</span>
                          <span>
                            {forecast.activePlanningVersionSummary.taskCounts.done}/{forecast.activePlanningVersionSummary.taskCounts.total}
                          </span>
                        </div>
                        <Progress
                          value={
                            forecast.activePlanningVersionSummary.taskCounts.total > 0
                              ? (forecast.activePlanningVersionSummary.taskCounts.done /
                                  forecast.activePlanningVersionSummary.taskCounts.total) *
                                100
                              : 0
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <EmptyBlock label="No active planning version yet. Create a plan in the Plans tab and set status to active." />
                  )}
                </CardContent>
              </Card>

              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Repeat className="h-4 w-4" />
                    Recurring scenarios
                  </CardTitle>
                  <CardDescription>
                    Named scenarios that repeat by cadence (school holidays, winter energy, travel month).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {recurringScenarioRows.length ? (
                      recurringScenarioRows.map((scenario) => (
                        <div key={scenario.id} className="rounded-xl border border-border/50 bg-background/55 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{scenario.name}</p>
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {scenario.scenarioLabel}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {scenario.cadence} · Next cycle {scenario.nextCycle}
                          </p>
                          {scenario.tags.length ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Tags: {scenario.tags.join(', ')}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <EmptyBlock label="No recurring scenarios yet. Create one in Planning month versions using the recurring scenario controls." />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">Goal Outlook</CardTitle>
                  <CardDescription>
                    Projected completion timing from monthly contributions and recorded goal events.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(forecast?.goals ?? []).slice(0, 5).map((goal) => (
                      <div key={goal.id} className="rounded-xl border border-border/50 bg-background/55 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{goal.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {goal.category} · {goal.status}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-5 px-1.5 text-[10px]',
                              goal.onTrack ? 'border-emerald-400/30 text-emerald-300' : 'border-amber-400/30 text-amber-300',
                            )}
                          >
                            {goal.onTrack ? 'On track' : 'Watch'}
                          </Badge>
                        </div>
                        <div className="mt-2">
                          <Progress value={Math.max(0, Math.min(goal.progressPct * 100, 100))} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <InlineStat label="Remaining" value={money.format(goal.remainingAmount)} />
                          <InlineStat
                            label="ETA"
                            value={
                              goal.monthsToTarget == null
                                ? 'N/A'
                                : `${goal.monthsToTarget}m`
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {forecast && forecast.goals.length === 0 ? (
                      <EmptyBlock label="No goals yet. Add goals and goal events to start forecasting completion dates." />
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">What if I skip this purchase?</CardTitle>
                  <CardDescription>
                    Quick impact model for a skipped recurring or discretionary purchase. This does
                    not change your saved plan or ledger.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Purchase label</span>
                      <Input
                        value={skipPurchaseDraft.label}
                        onChange={(event) =>
                          setSkipPurchaseDraft((prev) => ({ ...prev, label: event.target.value }))
                        }
                        placeholder="Tobacco shop"
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Amount</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={skipPurchaseDraft.amount}
                        onChange={(event) =>
                          setSkipPurchaseDraft((prev) => ({ ...prev, amount: event.target.value }))
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label className="grid gap-1.5 sm:col-span-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Times per month
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.25"
                        min="0"
                        value={skipPurchaseDraft.frequencyPerMonth}
                        onChange={(event) =>
                          setSkipPurchaseDraft((prev) => ({
                            ...prev,
                            frequencyPerMonth: event.target.value,
                          }))
                        }
                        placeholder="1"
                      />
                    </label>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <InlineStat
                      label="Monthly impact"
                      value={skipMonthlyImpact > 0 ? `+${money.format(skipMonthlyImpact)}` : money.format(0)}
                    />
                    <InlineStat
                      label="Annual impact"
                      value={skipAnnualImpact > 0 ? `+${money.format(skipAnnualImpact)}` : money.format(0)}
                    />
                    <InlineStat
                      label="Projected monthly net"
                      value={
                        skipProjectedMonthlyNet != null
                          ? `${skipProjectedMonthlyNet >= 0 ? '+' : ''}${money.format(skipProjectedMonthlyNet)}`
                          : 'N/A'
                      }
                    />
                    <InlineStat
                      label="Projected runway"
                      value={
                        skipProjectedRunwayMonths == null
                          ? 'N/A'
                          : `${skipProjectedRunwayMonths.toFixed(1)}m`
                      }
                    />
                  </div>

                  <div className="rounded-xl border border-border/50 bg-background/55 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Impact summary</p>
                    <p className="mt-1 leading-relaxed">
                      Skipping <span className="font-medium">{skipPurchaseDraft.label || 'this purchase'}</span>{' '}
                      {skipFrequencyPerMonth === 1 ? 'once per month' : `${skipFrequencyPerMonth} times per month`}
                      {' '}improves projected monthly net by{' '}
                      <span className="font-medium text-emerald-300">{money.format(skipMonthlyImpact)}</span>
                      {' '}and annual cash retention by{' '}
                      <span className="font-medium text-emerald-300">{money.format(skipAnnualImpact)}</span>.
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                      <p className="text-sm font-medium">Goal delay impact</p>
                    </div>
                    {goalDelayImpacts.length ? (
                      <div className="space-y-2">
                        {goalDelayImpacts.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-lg border border-border/50 bg-background/55 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{entry.title}</span>
                              <span className="text-muted-foreground">
                                {entry.delayMonths == null
                                  ? 'Potentially blocked'
                                  : entry.delayMonths === 0
                                    ? 'No delay'
                                    : `${entry.delayMonths}m delay`}
                              </span>
                            </div>
                            <p className="mt-1 text-muted-foreground">
                              ETA {entry.baselineMonths == null ? 'N/A' : `${entry.baselineMonths}m`} →{' '}
                              {entry.adjustedMonths == null ? 'N/A' : `${entry.adjustedMonths}m`} if this recurring spend continues.
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No active goals are currently delayed by this recurring spend level.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-4 space-y-4">
          <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Planning System</CardTitle>
              <CardDescription>
                Manage planning month versions, execution tasks, and scenario states used for forecasting comparisons.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={plansSubTab} onValueChange={(value) => setPlansSubTab(value as typeof plansSubTab)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="versions">Month Versions</TabsTrigger>
                  <TabsTrigger value="tasks">Action Tasks</TabsTrigger>
                  <TabsTrigger value="states">Finance States</TabsTrigger>
                </TabsList>

                <TabsContent value="versions" className="mt-4">
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                    <Card className="border-border/50 bg-background/55 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-sm">Planning month versions</CardTitle>
                        <CardDescription>
                          Versioned monthly plans for scenario analysis and execution tracking.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[34rem] rounded-xl border border-border/50 bg-card/20 p-2">
                          <div className="space-y-2">
                            {(workspace?.planningVersions ?? []).length ? (
                              workspace?.planningVersions.map((version) => (
                                <EntityRowCard
                                  key={version.id}
                                  title={version.name}
                                  subtitle={`${version.cycleKey} · ${version.scenarioLabel} · ${version.status}`}
                                  badges={[
                                    `${version.versionKey}`,
                                    version.recurringScenario.enabled ? 'Recurring' : '',
                                    `${version.taskCounts?.open ?? 0} open tasks`,
                                  ]}
                                  amountLabel={money.format(version.plannedNet)}
                                  hint={`Income ${money.format(version.plannedIncome)} · Expenses ${money.format(version.plannedExpenses)}`}
                                  footer={`Updated ${formatAge(version.updatedAt)}`}
                                  onEdit={() =>
                                    setVersionDraft({
                                      id: version.id,
                                      cycleKey: version.cycleKey,
                                      name: version.name,
                                      versionKey: version.versionKey,
                                      status: version.status,
                                      scenarioType: version.scenarioType,
                                      plannedIncome: String(version.plannedIncome),
                                      plannedExpenses: String(version.plannedExpenses),
                                      plannedSavings: String(version.plannedSavings),
                                      plannedNet: String(version.plannedNet),
                                      horizonMonths: String(version.horizonMonths),
                                      linkedStateId: version.linkedStateId,
                                      note: version.note,
                                      assumptionsJson: version.assumptionsJson || '{}',
                                      recurringEnabled: version.recurringScenario.enabled,
                                      recurringName: version.recurringScenario.name,
                                      recurringIntervalMonths: String(version.recurringScenario.intervalMonths),
                                      recurringStartCycleKey: version.recurringScenario.startCycleKey,
                                      recurringTags: version.recurringScenario.tags.join(', '),
                                    })
                                  }
                                  onDelete={() =>
                                    void handleDeleteEntity('planning_version', version.id, 'Planning version')
                                  }
                                  deleting={deletingId === version.id}
                                />
                              ))
                            ) : (
                              <EmptyBlock label="No planning month versions yet." />
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-background/55 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {versionDraft.id ? 'Edit planning version' : 'New planning version'}
                        </CardTitle>
                        <CardDescription>
                          Build a monthly plan, scenario variant, and link it to a finance state if needed.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <LabeledInput label="Cycle key (YYYY-MM)" value={versionDraft.cycleKey} onChange={(value) => setVersionDraft((prev) => ({ ...prev, cycleKey: value }))} />
                          <LabeledInput label="Version key" value={versionDraft.versionKey} onChange={(value) => setVersionDraft((prev) => ({ ...prev, versionKey: value }))} />
                          <LabeledInput label="Name" value={versionDraft.name} onChange={(value) => setVersionDraft((prev) => ({ ...prev, name: value }))} />
                          <LabeledInput label="Horizon months" type="number" value={versionDraft.horizonMonths} onChange={(value) => setVersionDraft((prev) => ({ ...prev, horizonMonths: value }))} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <SelectField label="Status" value={versionDraft.status} onChange={(value) => setVersionDraft((prev) => ({ ...prev, status: value }))} options={['draft', 'active', 'locked', 'archived']} />
                          <SelectField
                            label="Scenario"
                            value={versionDraft.scenarioType}
                            onChange={(value) => setVersionDraft((prev) => ({ ...prev, scenarioType: value }))}
                            options={['base', 'stretch', 'downside', 'recovery']}
                            labels={{
                              base: 'Normal month',
                              stretch: 'Growth month',
                              downside: 'Tight month',
                              recovery: 'Recovery month',
                            }}
                          />
                          <SelectField label="Linked state" value={versionDraft.linkedStateId} onChange={(value) => setVersionDraft((prev) => ({ ...prev, linkedStateId: value }))} options={['', ...(workspace?.personalFinanceStates ?? []).map((row) => row.id)]} labels={Object.fromEntries((workspace?.personalFinanceStates ?? []).map((row) => [row.id, row.name]))} />
                        </div>
                        <div className="rounded-xl border border-border/50 bg-background/55 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Recurring scenario</p>
                              <p className="text-xs text-muted-foreground">
                                Create named recurring scenarios like school holidays, winter energy, and travel month.
                              </p>
                            </div>
                            <ToggleField
                              label="Enabled"
                              checked={versionDraft.recurringEnabled}
                              onChange={(value) => setVersionDraft((prev) => ({ ...prev, recurringEnabled: value }))}
                            />
                          </div>

                          <div className="mb-2 flex flex-wrap gap-2">
                            {recurringScenarioTemplates.map((template) => (
                              <Button
                                key={template.key}
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  setVersionDraft((prev) => ({
                                    ...prev,
                                    recurringEnabled: true,
                                    recurringName: template.label,
                                    recurringIntervalMonths: String(template.intervalMonths),
                                    recurringTags: template.tags,
                                    scenarioType: template.scenarioType,
                                  }))
                                }
                              >
                                <CalendarRange className="h-3.5 w-3.5" />
                                {template.label}
                              </Button>
                            ))}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <LabeledInput
                              label="Recurring name"
                              value={versionDraft.recurringName}
                              onChange={(value) => setVersionDraft((prev) => ({ ...prev, recurringName: value }))}
                              placeholder="Winter energy"
                            />
                            <LabeledInput
                              label="Interval (months)"
                              type="number"
                              min="1"
                              max="12"
                              value={versionDraft.recurringIntervalMonths}
                              onChange={(value) =>
                                setVersionDraft((prev) => ({ ...prev, recurringIntervalMonths: value }))
                              }
                            />
                            <SelectField
                              label="Start cycle"
                              value={versionDraft.recurringStartCycleKey}
                              onChange={(value) =>
                                setVersionDraft((prev) => ({ ...prev, recurringStartCycleKey: value }))
                              }
                              options={workspace?.options.cycleKeys ?? [versionDraft.cycleKey]}
                            />
                            <LabeledInput
                              label="Tags (comma)"
                              value={versionDraft.recurringTags}
                              onChange={(value) => setVersionDraft((prev) => ({ ...prev, recurringTags: value }))}
                              placeholder="utilities, winter"
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Scenario label: {scenarioTypeLabel(versionDraft.scenarioType)} · repeats every{' '}
                            {Math.max(1, Number(versionDraft.recurringIntervalMonths || '1'))} month(s).
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <LabeledInput label="Planned income" type="number" step="0.01" value={versionDraft.plannedIncome} onChange={(value) => setVersionDraft((prev) => ({ ...prev, plannedIncome: value }))} />
                          <LabeledInput label="Planned expenses" type="number" step="0.01" value={versionDraft.plannedExpenses} onChange={(value) => setVersionDraft((prev) => ({ ...prev, plannedExpenses: value }))} />
                          <LabeledInput label="Planned savings" type="number" step="0.01" value={versionDraft.plannedSavings} onChange={(value) => setVersionDraft((prev) => ({ ...prev, plannedSavings: value }))} />
                          <LabeledInput label="Planned net" type="number" step="0.01" value={versionDraft.plannedNet} onChange={(value) => setVersionDraft((prev) => ({ ...prev, plannedNet: value }))} />
                        </div>
                        <LabeledTextarea label="Notes" value={versionDraft.note} onChange={(value) => setVersionDraft((prev) => ({ ...prev, note: value }))} rows={2} />
                        <LabeledTextarea label="Assumptions JSON" value={versionDraft.assumptionsJson} onChange={(value) => setVersionDraft((prev) => ({ ...prev, assumptionsJson: value }))} rows={6} />
                        <EntityFormActions
                          onReset={() => setVersionDraft(emptyPlanningVersionDraft(workspace?.selectedCycleKey ?? workspace?.currentCycleKey ?? versionDraft.cycleKey))}
                          onSave={() => void handleSavePlanningVersion()}
                          saving={isSavingEntity}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="tasks" className="mt-4">
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                    <Card className="border-border/50 bg-background/55 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-sm">Planning action tasks</CardTitle>
                        <CardDescription>
                          Execution tasks linked to planning versions with priority, due dates, and monthly impact estimates.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[34rem] rounded-xl border border-border/50 bg-card/20 p-2">
                          <div className="space-y-2">
                            {(workspace?.planningActionTasks ?? []).length ? (
                              workspace?.planningActionTasks.map((task) => (
                                <EntityRowCard
                                  key={task.id}
                                  title={task.title}
                                  subtitle={`${task.status} · ${task.priority} · ${task.ownerScope}`}
                                  badges={[
                                    task.planningVersionId
                                      ? planningVersionsById.get(task.planningVersionId)?.name ?? 'Linked plan'
                                      : 'Unlinked',
                                  ]}
                                  amountLabel={task.impactMonthly ? `${task.impactMonthly >= 0 ? '+' : ''}${money.format(task.impactMonthly)}/mo` : undefined}
                                  hint={task.note || undefined}
                                  footer={`${task.dueAt ? `Due ${format(new Date(task.dueAt), 'MMM d, yyyy')}` : 'No due date'} · Updated ${formatAge(task.updatedAt)}`}
                                  onEdit={() =>
                                    setTaskDraft({
                                      id: task.id,
                                      planningVersionId: task.planningVersionId,
                                      title: task.title,
                                      status: task.status,
                                      priority: task.priority,
                                      ownerScope: task.ownerScope,
                                      dueDate: dateInputValue(task.dueAt),
                                      impactMonthly: task.impactMonthly ? String(task.impactMonthly) : '',
                                      note: task.note,
                                      linkedEntityType: task.linkedEntityType,
                                      linkedEntityId: task.linkedEntityId,
                                    })
                                  }
                                  onDelete={() => void handleDeleteEntity('planning_task', task.id, 'Planning task')}
                                  deleting={deletingId === task.id}
                                />
                              ))
                            ) : (
                              <EmptyBlock label="No planning tasks yet." />
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-background/55 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {taskDraft.id ? 'Edit planning task' : 'New planning task'}
                        </CardTitle>
                        <CardDescription>
                          Track implementation tasks and their expected monthly impact on cash flow.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <SelectField
                          label="Planning version"
                          value={taskDraft.planningVersionId}
                          onChange={(value) => setTaskDraft((prev) => ({ ...prev, planningVersionId: value }))}
                          options={['', ...(workspace?.planningVersions ?? []).map((row) => row.id)]}
                          labels={Object.fromEntries((workspace?.planningVersions ?? []).map((row) => [row.id, `${row.name} (${row.cycleKey})`]))}
                        />
                        <LabeledInput label="Title" value={taskDraft.title} onChange={(value) => setTaskDraft((prev) => ({ ...prev, title: value }))} />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <SelectField label="Status" value={taskDraft.status} onChange={(value) => setTaskDraft((prev) => ({ ...prev, status: value }))} options={['todo', 'in_progress', 'blocked', 'done']} />
                          <SelectField label="Priority" value={taskDraft.priority} onChange={(value) => setTaskDraft((prev) => ({ ...prev, priority: value }))} options={['high', 'medium', 'low']} />
                          <SelectField label="Owner scope" value={taskDraft.ownerScope} onChange={(value) => setTaskDraft((prev) => ({ ...prev, ownerScope: value }))} options={ownershipOptions} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <LabeledInput label="Due date" type="date" value={taskDraft.dueDate} onChange={(value) => setTaskDraft((prev) => ({ ...prev, dueDate: value }))} />
                          <LabeledInput label="Impact / month" type="number" step="0.01" value={taskDraft.impactMonthly} onChange={(value) => setTaskDraft((prev) => ({ ...prev, impactMonthly: value }))} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <LabeledInput label="Linked entity type" value={taskDraft.linkedEntityType} onChange={(value) => setTaskDraft((prev) => ({ ...prev, linkedEntityType: value }))} />
                          <LabeledInput label="Linked entity id" value={taskDraft.linkedEntityId} onChange={(value) => setTaskDraft((prev) => ({ ...prev, linkedEntityId: value }))} />
                        </div>
                        <LabeledTextarea label="Notes" value={taskDraft.note} onChange={(value) => setTaskDraft((prev) => ({ ...prev, note: value }))} rows={4} />
                        <EntityFormActions
                          onReset={() => setTaskDraft(emptyPlanningTaskDraft(workspace?.planningVersions[0]?.id ?? ''))}
                          onSave={() => void handleSavePlanningTask()}
                          saving={isSavingEntity}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="states" className="mt-4">
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                    <Card className="border-border/50 bg-background/55 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-sm">Personal finance states</CardTitle>
                        <CardDescription>
                          Scenario snapshots used for forecasting and comparing different assumptions.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[34rem] rounded-xl border border-border/50 bg-card/20 p-2">
                          <div className="space-y-2">
                            {(workspace?.personalFinanceStates ?? []).length ? (
                              workspace?.personalFinanceStates.map((state) => (
                                <EntityRowCard
                                  key={state.id}
                                  title={state.name}
                                  subtitle={`${state.stateKind} · ${state.horizonMonths}m horizon`}
                                  badges={[state.currency]}
                                  amountLabel={money.format(state.monthlyIncome - state.monthlyExpenses)}
                                  hint={`Income ${money.format(state.monthlyIncome)} · Expenses ${money.format(state.monthlyExpenses)} · Net worth ${compactCurrency.format(state.startingNetWorth)}`}
                                  footer={`Updated ${formatAge(state.updatedAt)}`}
                                  onEdit={() =>
                                    setStateDraft({
                                      id: state.id,
                                      name: state.name,
                                      stateKind: state.stateKind,
                                      horizonMonths: String(state.horizonMonths),
                                      monthlyIncome: String(state.monthlyIncome),
                                      monthlyExpenses: String(state.monthlyExpenses),
                                      liquidCash: String(state.liquidCash),
                                      assets: String(state.assets),
                                      liabilities: String(state.liabilities),
                                      startingNetWorth: String(state.startingNetWorth),
                                      expectedReturnPct: String(state.expectedReturnPct),
                                      inflationPct: String(state.inflationPct),
                                      currency: state.currency,
                                      note: state.note,
                                    })
                                  }
                                  onDelete={() => void handleDeleteEntity('finance_state', state.id, 'Finance state')}
                                  deleting={deletingId === state.id}
                                />
                              ))
                            ) : (
                              <EmptyBlock label="No finance states yet. Create a scenario to compare outcomes in the Forecast tab." />
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-background/55 shadow-none">
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {stateDraft.id ? 'Edit finance state' : 'New finance state'}
                        </CardTitle>
                        <CardDescription>
                          Define a scenario with income, expenses, assets, liabilities, and macro assumptions.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <LabeledInput label="Name" value={stateDraft.name} onChange={(value) => setStateDraft((prev) => ({ ...prev, name: value }))} />
                          <SelectField label="State kind" value={stateDraft.stateKind} onChange={(value) => setStateDraft((prev) => ({ ...prev, stateKind: value }))} options={['scenario', 'current', 'target']} />
                          <LabeledInput label="Horizon months" type="number" value={stateDraft.horizonMonths} onChange={(value) => setStateDraft((prev) => ({ ...prev, horizonMonths: value }))} />
                          <SelectField label="Currency" value={stateDraft.currency} onChange={(value) => setStateDraft((prev) => ({ ...prev, currency: value }))} options={currencyOptions} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <LabeledInput label="Monthly income" type="number" step="0.01" value={stateDraft.monthlyIncome} onChange={(value) => setStateDraft((prev) => ({ ...prev, monthlyIncome: value }))} />
                          <LabeledInput label="Monthly expenses" type="number" step="0.01" value={stateDraft.monthlyExpenses} onChange={(value) => setStateDraft((prev) => ({ ...prev, monthlyExpenses: value }))} />
                          <LabeledInput label="Liquid cash" type="number" step="0.01" value={stateDraft.liquidCash} onChange={(value) => setStateDraft((prev) => ({ ...prev, liquidCash: value }))} />
                          <LabeledInput label="Assets" type="number" step="0.01" value={stateDraft.assets} onChange={(value) => setStateDraft((prev) => ({ ...prev, assets: value }))} />
                          <LabeledInput label="Liabilities" type="number" step="0.01" value={stateDraft.liabilities} onChange={(value) => setStateDraft((prev) => ({ ...prev, liabilities: value }))} />
                          <LabeledInput label="Starting net worth" type="number" step="0.01" value={stateDraft.startingNetWorth} onChange={(value) => setStateDraft((prev) => ({ ...prev, startingNetWorth: value }))} />
                          <LabeledInput label="Expected return %" type="number" step="0.01" value={stateDraft.expectedReturnPct} onChange={(value) => setStateDraft((prev) => ({ ...prev, expectedReturnPct: value }))} />
                          <LabeledInput label="Inflation %" type="number" step="0.01" value={stateDraft.inflationPct} onChange={(value) => setStateDraft((prev) => ({ ...prev, inflationPct: value }))} />
                        </div>
                        <LabeledTextarea label="Notes" value={stateDraft.note} onChange={(value) => setStateDraft((prev) => ({ ...prev, note: value }))} rows={4} />
                        <EntityFormActions
                          onReset={() => setStateDraft(emptyFinanceStateDraft(workspace?.baseCurrency ?? displayCurrency))}
                          onSave={() => void handleSaveFinanceState()}
                          saving={isSavingEntity}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Goals</CardTitle>
                <CardDescription>
                  Create target goals, track progress, and record goal events for milestone and contribution history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[38rem] rounded-xl border border-border/50 bg-background/55 p-2">
                  <div className="space-y-2">
                    {(workspace?.goals ?? []).length ? (
                      workspace?.goals.map((goal) => (
                        <div key={goal.id} className="rounded-xl border border-border/50 bg-card/35 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium">{goal.title}</p>
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                  {goal.status}
                                </Badge>
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                  {goal.priority}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {goal.category} · {goal.ownership} · {goal.dueLabel}
                              </p>
                              <div className="mt-2">
                                <Progress value={Math.max(0, Math.min(goal.progressPct * 100, 100))} />
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <InlineStat label="Current" value={money.format(goal.currentAmount)} />
                                <InlineStat label="Target" value={money.format(goal.targetAmount)} />
                                <InlineStat label="Monthly" value={money.format(goal.monthlyContribution)} />
                                <InlineStat label="ETA" value={goal.monthsToTarget == null ? 'N/A' : `${goal.monthsToTarget}m`} />
                              </div>
                              {goal.note ? (
                                <p className="mt-2 text-[11px] text-muted-foreground">{goal.note}</p>
                              ) : null}
                              {goal.recentEvents.length ? (
                                <div className="mt-2 space-y-1">
                                  {goal.recentEvents.slice(0, 3).map((event) => (
                                    <div key={event.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                      <span>
                                        {event.eventType} · {event.occurredAt ? format(new Date(event.occurredAt), 'MMM d') : 'No date'}
                                      </span>
                                      <span className={cn(event.amount >= 0 ? 'text-emerald-300' : 'text-amber-300')}>
                                        {event.amount >= 0 ? '+' : ''}
                                        {money.format(event.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setGoalDraft({
                                    id: goal.id,
                                    title: goal.title,
                                    category: goal.category,
                                    status: goal.status,
                                    priority: goal.priority,
                                    ownership: goal.ownership,
                                    targetAmount: String(goal.targetAmount),
                                    currentAmount: String(goal.currentAmount),
                                    monthlyContribution: String(goal.monthlyContribution),
                                    dueDate: dateInputValue(goal.dueAt),
                                    dueLabel: goal.dueLabel,
                                    currency: goal.currency,
                                    note: goal.note,
                                  })
                                  setGoalEventDraft((prev) => ({ ...prev, goalId: goal.id }))
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => void handleDeleteEntity('goal', goal.id, 'Goal')}
                                disabled={deletingId === goal.id}
                              >
                                {deletingId === goal.id ? (
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
                      <EmptyBlock label="No goals yet. Create a goal and then record contributions or milestones." />
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card className="border-border/50 bg-background/55 shadow-none">
                <CardHeader>
                  <CardTitle className="text-sm">{goalDraft.id ? 'Edit goal' : 'New goal'}</CardTitle>
                  <CardDescription>
                    Goals support progress tracking via current amount and event-based updates.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LabeledInput label="Title" value={goalDraft.title} onChange={(value) => setGoalDraft((prev) => ({ ...prev, title: value }))} />
                    <DatalistField label="Category" value={goalDraft.category} onChange={(value) => setGoalDraft((prev) => ({ ...prev, category: value }))} options={categoryOptions} listId="goal-category-options" />
                    <SelectField label="Status" value={goalDraft.status} onChange={(value) => setGoalDraft((prev) => ({ ...prev, status: value }))} options={['active', 'paused', 'completed', 'cancelled']} />
                    <SelectField label="Priority" value={goalDraft.priority} onChange={(value) => setGoalDraft((prev) => ({ ...prev, priority: value }))} options={['high', 'medium', 'low']} />
                    <SelectField label="Ownership" value={goalDraft.ownership} onChange={(value) => setGoalDraft((prev) => ({ ...prev, ownership: value }))} options={ownershipOptions} />
                    <SelectField label="Currency" value={goalDraft.currency} onChange={(value) => setGoalDraft((prev) => ({ ...prev, currency: value }))} options={currencyOptions} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LabeledInput label="Target amount" type="number" step="0.01" value={goalDraft.targetAmount} onChange={(value) => setGoalDraft((prev) => ({ ...prev, targetAmount: value }))} />
                    <LabeledInput label="Current amount" type="number" step="0.01" value={goalDraft.currentAmount} onChange={(value) => setGoalDraft((prev) => ({ ...prev, currentAmount: value }))} />
                    <LabeledInput label="Monthly contribution" type="number" step="0.01" value={goalDraft.monthlyContribution} onChange={(value) => setGoalDraft((prev) => ({ ...prev, monthlyContribution: value }))} />
                    <LabeledInput label="Due date" type="date" value={goalDraft.dueDate} onChange={(value) => setGoalDraft((prev) => ({ ...prev, dueDate: value }))} />
                  </div>
                  <LabeledInput label="Due label (optional)" value={goalDraft.dueLabel} onChange={(value) => setGoalDraft((prev) => ({ ...prev, dueLabel: value }))} />
                  <LabeledTextarea label="Notes" value={goalDraft.note} onChange={(value) => setGoalDraft((prev) => ({ ...prev, note: value }))} rows={3} />
                  <EntityFormActions onReset={() => setGoalDraft(emptyGoalDraft(workspace?.baseCurrency ?? displayCurrency))} onSave={() => void handleSaveGoal()} saving={isSavingEntity} />
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-background/55 shadow-none">
                <CardHeader>
                  <CardTitle className="text-sm">Record Goal Event</CardTitle>
                  <CardDescription>
                    Add contributions, withdrawals, milestones, or adjustments and optionally update the goal current amount.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SelectField
                    label="Goal"
                    value={goalEventDraft.goalId}
                    onChange={(value) => setGoalEventDraft((prev) => ({ ...prev, goalId: value }))}
                    options={['', ...(workspace?.goals ?? []).map((goal) => goal.id)]}
                    labels={Object.fromEntries((workspace?.goals ?? []).map((goal) => [goal.id, goal.title]))}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField label="Event type" value={goalEventDraft.eventType} onChange={(value) => setGoalEventDraft((prev) => ({ ...prev, eventType: value }))} options={['contribution', 'withdrawal', 'milestone', 'adjustment']} />
                    <LabeledInput label="Amount" type="number" step="0.01" value={goalEventDraft.amount} onChange={(value) => setGoalEventDraft((prev) => ({ ...prev, amount: value }))} />
                    <LabeledInput label="Occurred date" type="date" value={goalEventDraft.occurredDate} onChange={(value) => setGoalEventDraft((prev) => ({ ...prev, occurredDate: value }))} />
                    <ToggleField label="Apply to goal current" checked={goalEventDraft.applyToGoalCurrent} onChange={(value) => setGoalEventDraft((prev) => ({ ...prev, applyToGoalCurrent: value }))} />
                  </div>
                  <LabeledTextarea label="Note" value={goalEventDraft.note} onChange={(value) => setGoalEventDraft((prev) => ({ ...prev, note: value }))} rows={2} />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setGoalEventDraft(emptyGoalEventDraft(goalEventDraft.goalId))}>
                      <Trash2 className="h-4 w-4" />
                      Clear
                    </Button>
                    <Button onClick={() => void handleRecordGoalEvent()} disabled={isRecordingGoalEvent}>
                      {isRecordingGoalEvent ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                      Record event
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="envelopes" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={Coins} label="Planned" value={forecast ? money.format(forecast.envelopes.totals.planned) : '...'} hint={`Cycle ${(workspace?.selectedCycleKey ?? selectedEnvelopeCycle) || ''}`} tone="neutral" />
            <MetricCard icon={ClipboardList} label="Actual" value={forecast ? money.format(forecast.envelopes.totals.actual) : '...'} hint="Tracked spend against envelopes" tone={forecast && forecast.envelopes.totals.actual > forecast.envelopes.totals.planned + forecast.envelopes.totals.carryover ? 'warning' : 'neutral'} />
            <MetricCard icon={PiggyBank} label="Carryover" value={forecast ? money.format(forecast.envelopes.totals.carryover) : '...'} hint="Rollover budget available" tone="neutral" />
            <MetricCard icon={Target} label="Remaining" value={forecast ? money.format(forecast.envelopes.totals.remaining) : '...'} hint={forecast ? `${(forecast.envelopes.totals.utilizationPct * 100).toFixed(0)}% utilized` : 'Utilization'} tone={forecast && forecast.envelopes.totals.remaining < 0 ? 'warning' : 'positive'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Envelope Budgets</CardTitle>
                    <CardDescription>
                      Zero-based/planned spending envelopes by cycle and category.
                    </CardDescription>
                  </div>
                  <div className="w-full sm:w-auto sm:min-w-[12rem]">
                    <label className="mb-1 block text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                      Cycle
                    </label>
                    <select
                      value={selectedEnvelopeCycle ?? workspace?.selectedCycleKey ?? ''}
                      onChange={(event) => {
                        setSelectedEnvelopeCycle(event.target.value)
                        setEnvelopeDraft((prev) => ({ ...prev, cycleKey: event.target.value }))
                      }}
                      className="h-10 w-full rounded-lg border border-border/70 bg-background/60 px-3 text-sm"
                    >
                      {(workspace?.options.cycleKeys ?? []).map((cycleKey) => (
                        <option key={cycleKey} value={cycleKey}>
                          {cycleKey}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[34rem] rounded-xl border border-border/50 bg-background/55 p-2">
                  <div className="space-y-2">
                    {selectedEnvelopeRows.length ? (
                      selectedEnvelopeRows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border/50 bg-card/35 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium">{row.category}</p>
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                  {row.status}
                                </Badge>
                                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                  {row.ownership}
                                </Badge>
                              </div>
                              <div className="mt-2">
                                <Progress value={Math.max(0, Math.min(row.utilizationPct * 100, 100))} />
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <InlineStat label="Planned" value={money.format(row.plannedAmount)} />
                                <InlineStat label="Actual" value={money.format(row.actualAmount)} />
                                <InlineStat label="Carryover" value={money.format(row.carryoverAmount)} />
                                <InlineStat label="Remaining" value={money.format(row.remainingAmount)} />
                              </div>
                              {row.note ? <p className="mt-2 text-[11px] text-muted-foreground">{row.note}</p> : null}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  setEnvelopeDraft({
                                    id: row.id,
                                    cycleKey: row.cycleKey,
                                    category: row.category,
                                    plannedAmount: String(row.plannedAmount),
                                    actualAmount: String(row.actualAmount),
                                    carryoverAmount: String(row.carryoverAmount),
                                    ownership: row.ownership,
                                    status: row.status,
                                    rollover: row.rollover,
                                    currency: row.currency,
                                    note: row.note,
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button size="xs" variant="ghost" onClick={() => void handleDeleteEntity('envelope_budget', row.id, 'Envelope budget')} disabled={deletingId === row.id}>
                                {deletingId === row.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyBlock label="No envelopes for the selected cycle yet. Create category budgets to start zero-based planning." />
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-background/55 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{envelopeDraft.id ? 'Edit envelope' : 'New envelope'}</CardTitle>
                <CardDescription>
                  Define planned and actual spend by category, with carryover and rollover support.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Cycle" value={envelopeDraft.cycleKey} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, cycleKey: value }))} options={workspace?.options.cycleKeys ?? [envelopeDraft.cycleKey]} />
                  <SelectField label="Currency" value={envelopeDraft.currency} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, currency: value }))} options={currencyOptions} />
                  <DatalistField label="Category" value={envelopeDraft.category} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, category: value }))} options={categoryOptions} listId="envelope-category-options" />
                  <SelectField label="Ownership" value={envelopeDraft.ownership} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, ownership: value }))} options={ownershipOptions} />
                  <SelectField label="Status" value={envelopeDraft.status} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, status: value }))} options={['draft', 'funded', 'at_risk', 'over']} />
                  <ToggleField label="Rollover" checked={envelopeDraft.rollover} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, rollover: value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledInput label="Planned amount" type="number" step="0.01" value={envelopeDraft.plannedAmount} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, plannedAmount: value }))} />
                  <LabeledInput label="Actual amount" type="number" step="0.01" value={envelopeDraft.actualAmount} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, actualAmount: value }))} />
                  <LabeledInput label="Carryover amount" type="number" step="0.01" value={envelopeDraft.carryoverAmount} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, carryoverAmount: value }))} />
                </div>
                <LabeledTextarea label="Notes" value={envelopeDraft.note} onChange={(value) => setEnvelopeDraft((prev) => ({ ...prev, note: value }))} rows={4} />
                <EntityFormActions onReset={() => setEnvelopeDraft(emptyEnvelopeDraft(workspace?.selectedCycleKey ?? workspace?.currentCycleKey ?? envelopeDraft.cycleKey, workspace?.baseCurrency ?? displayCurrency))} onSave={() => void handleSaveEnvelope()} saving={isSavingEntity} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={ClipboardList} label="Open Tasks" value={String(openTaskCount)} hint={`${workspace?.planningActionTasks.length ?? 0} total tasks`} tone={openTaskCount > 0 ? 'warning' : 'positive'} />
        <MetricCard icon={CheckCircle2} label="Goal Events" value={String(workspace?.goalEvents.length ?? 0)} hint="Recent progress and milestones" tone="neutral" />
        <MetricCard icon={Target} label="Scenarios" value={String((forecast?.scenarios.length ?? 1) - 1)} hint="Custom states + active plan" tone="neutral" />
        <MetricCard icon={Coins} label="Envelope Rows" value={String(workspace?.envelopeBudgets.length ?? 0)} hint={`Cycle ${workspace?.selectedCycleKey ?? selectedEnvelopeCycle ?? ''}`} tone="neutral" />
      </div>
    </div>
  )
}

function EntityRowCard({
  title,
  subtitle,
  badges,
  amountLabel,
  hint,
  footer,
  onEdit,
  onDelete,
  deleting,
}: {
  title: string
  subtitle?: string
  badges?: string[]
  amountLabel?: string
  hint?: string
  footer?: string
  onEdit: () => void
  onDelete: () => void
  deleting?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            {badges?.filter(Boolean).map((badge) => (
              <Badge key={badge} variant="outline" className="h-5 px-1.5 text-[10px]">
                {badge}
              </Badge>
            ))}
          </div>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
          {footer ? <p className="mt-2 text-[11px] text-muted-foreground">{footer}</p> : null}
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          {amountLabel ? <p className="mr-2 text-xs font-semibold">{amountLabel}</p> : null}
          <Button size="xs" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button size="xs" variant="ghost" onClick={onDelete} disabled={deleting}>
            {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EntityFormActions({
  onReset,
  onSave,
  saving,
}: {
  onReset: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onReset}>
        <Trash2 className="h-4 w-4" />
        Reset
      </Button>
      <Button onClick={onSave} disabled={saving}>
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save
      </Button>
    </div>
  )
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/20 px-2 py-1.5">
      <p className="text-[10px] tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-xs font-medium">{value}</p>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
  why,
}: {
  icon: typeof Sparkles
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'positive' | 'warning'
  why?: {
    explanation: string
    includes?: string[]
    excludes?: string[]
    confidence?: string
  }
}) {
  const resolvedWhy = why ?? defaultPlanningMetricWhy(label)
  return (
    <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <CardDescription className="text-xs tracking-[0.12em] uppercase">{label}</CardDescription>
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
        <KpiWhyDialog
          kpi={label}
          explanation={resolvedWhy.explanation}
          includes={resolvedWhy.includes}
          excludes={resolvedWhy.excludes}
          confidence={resolvedWhy.confidence}
        />
      </CardHeader>
    </Card>
  )
}

function defaultPlanningMetricWhy(label: string) {
  const key = label.toLowerCase()
  if (key.includes('monthly net')) {
    return {
      explanation: 'Monthly net projects recurring income minus recurring obligations under the active forecast baseline.',
      includes: ['Income schedules', 'Bills', 'Card minimums', 'Loan minimums'],
      excludes: ['One-off discretionary transactions not in recurring model'],
      confidence: 'Source: Convex planning baseline',
    }
  }
  if (key.includes('liquid cash')) {
    return {
      explanation: 'Liquid cash reflects currently available cash used for runway and stress calculations.',
      includes: ['Liquid account balances'],
      excludes: ['Locked investments and non-liquid assets'],
      confidence: 'Source: Convex account balances',
    }
  }
  if (key.includes('goal')) {
    return {
      explanation: 'Goal metrics are calculated from targets, current amounts, and recorded goal events.',
      includes: ['Goal rows', 'Goal event history'],
      excludes: ['Goals without active forecast contributions'],
      confidence: 'Source: Convex goals + goalEvents',
    }
  }
  if (key.includes('envelope') || key.includes('planned') || key.includes('remaining')) {
    return {
      explanation: 'Envelope metrics summarize planned, actual, and carryover values for the selected cycle.',
      includes: ['Envelope budgets for current cycle'],
      excludes: ['Other cycle envelopes'],
      confidence: 'Source: Convex envelopeBudgets',
    }
  }
  return {
    explanation: 'Planning KPI derived from live Convex planning and finance data.',
    confidence: 'Source: Convex planning workspace',
  }
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="bg-background/60" {...rest} />
    </div>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</label>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-border"
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
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</label>
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
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} list={listId} className="bg-background/60" />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
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
    <label className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/55 px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{checked ? 'On' : 'Off'}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-border bg-background" />
      </span>
    </label>
  )
}
