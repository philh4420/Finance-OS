/* eslint-disable @typescript-eslint/no-explicit-any */
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import {
  assertOwnedDocOrThrow as sharedAssertOwnedDocOrThrow,
  auditWriteSafe as sharedAuditWriteSafe,
  collectUserDocs as sharedCollectUserDocs,
  requireViewerUserId as sharedRequireViewerUserId,
  safeCollectDocs as sharedSafeCollectDocs,
  viewerUserId as sharedViewerUserId,
} from './_shared/guardrails'

const DEFAULT_DISPLAY_CURRENCY = 'USD'
const DEFAULT_LOCALE = 'en-US'
const DEFAULT_OWNERSHIP = 'shared'

const PHASE_FIVE_ENTITY_TABLES = {
  planning_version: 'planningMonthVersions',
  planning_task: 'planningActionTasks',
  finance_state: 'personalFinanceStates',
  goal: 'goals',
  envelope_budget: 'envelopeBudgets',
  goal_event: 'goalEvents',
} as const

const OWNERSHIP_OPTIONS = ['personal', 'shared', 'business', 'household'] as const

export const getPhaseFivePlanningWorkspace = query({
  args: {
    displayCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
    cycleKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await viewerUserId(ctx)
    const financeDb = ctx.db as any

    if (!userId) {
      const currentCycleKey = cycleKeyFromDate(new Date())
      return {
        viewerAuthenticated: false,
        viewerUserId: null,
        displayCurrency: DEFAULT_DISPLAY_CURRENCY,
        locale: DEFAULT_LOCALE,
        baseCurrency: DEFAULT_DISPLAY_CURRENCY,
        currentCycleKey,
        selectedCycleKey: currentCycleKey,
        options: {
          cycleKeys: buildDefaultCycleKeys(new Date()),
          categories: [] as string[],
          ownershipOptions: Array.from(OWNERSHIP_OPTIONS),
          accountOptions: [] as Array<{ id: string; name: string; type: string }>,
          currencyOptions: [] as string[],
        },
        forecast: buildEmptyForecast(currentCycleKey),
        planningVersions: [] as any[],
        planningActionTasks: [] as any[],
        personalFinanceStates: [] as any[],
        goals: [] as any[],
        goalEvents: [] as any[],
        envelopeBudgets: [] as any[],
      }
    }

    const [prefDoc, dashboardPrefDoc, incomes, bills, cards, loans, accounts, monthSnapshots, planningVersions, planningTasks, financeStates, goals, goalEvents, envelopes, currencyCatalog] =
      await Promise.all([
        findUserDoc(financeDb, 'financePreferences', userId),
        findDashboardPreferencesDoc(ctx.db as any, userId),
        collectUserDocs(financeDb, 'incomes', userId),
        collectUserDocs(financeDb, 'bills', userId),
        collectUserDocs(financeDb, 'cards', userId),
        collectUserDocs(financeDb, 'loans', userId),
        collectUserDocs(financeDb, 'accounts', userId),
        collectUserDocs(financeDb, 'monthCloseSnapshots', userId),
        collectUserDocs(financeDb, 'planningMonthVersions', userId),
        collectUserDocs(financeDb, 'planningActionTasks', userId),
        collectUserDocs(financeDb, 'personalFinanceStates', userId),
        collectUserDocs(financeDb, 'goals', userId),
        collectUserDocs(financeDb, 'goalEvents', userId),
        collectUserDocs(financeDb, 'envelopeBudgets', userId),
        safeCollectDocs(financeDb, 'currencyCatalog'),
      ])

    const baseCurrency = normalizeCurrencyCode(
      optionalString((prefDoc as any)?.currency) ?? DEFAULT_DISPLAY_CURRENCY,
    )
    const displayCurrency = normalizeCurrencyCode(
      args.displayCurrency ??
        optionalString((dashboardPrefDoc as any)?.displayCurrency) ??
        baseCurrency,
    )
    const locale = sanitizeLocale(
      args.locale ??
        optionalString((dashboardPrefDoc as any)?.locale) ??
        optionalString((prefDoc as any)?.locale) ??
        DEFAULT_LOCALE,
    )

    const currentCycleKey = cycleKeyFromDate(new Date())
    const mappedPlanningVersions = planningVersions
      .slice()
      .sort(sortByUpdatedDesc)
      .map((row: any) => normalizePlanningVersion(row, currentCycleKey))
    const mappedPlanningTasks = planningTasks
      .slice()
      .sort(sortPlanningTasks)
      .map((row: any) => normalizePlanningTask(row))
    const mappedFinanceStates = financeStates
      .slice()
      .sort(sortByUpdatedDesc)
      .map((row: any) => normalizeFinanceState(row, baseCurrency))
    const mappedGoalEvents = goalEvents
      .slice()
      .sort(sortByUpdatedDesc)
      .slice(0, 200)
      .map((row: any) => normalizeGoalEvent(row))
    const goalEventsByGoalId = groupGoalEventsByGoalId(mappedGoalEvents)
    const mappedGoals = goals
      .slice()
      .sort(sortGoals)
      .map((row: any) => normalizeGoal(row, baseCurrency, goalEventsByGoalId.get(String(row._id)) ?? []))
    const mappedEnvelopes = envelopes
      .slice()
      .sort(sortEnvelopes)
      .map((row: any) => normalizeEnvelopeBudget(row, baseCurrency))

    const taskCountsByVersionId = new Map<string, { total: number; open: number; done: number }>()
    for (const task of mappedPlanningTasks) {
      if (!task.planningVersionId) continue
      const current = taskCountsByVersionId.get(task.planningVersionId) ?? {
        total: 0,
        open: 0,
        done: 0,
      }
      current.total += 1
      if (task.status === 'done') current.done += 1
      if (task.status !== 'done') current.open += 1
      taskCountsByVersionId.set(task.planningVersionId, current)
    }

    const planningVersionsWithCounts = mappedPlanningVersions.map((version) => ({
      ...version,
      taskCounts: taskCountsByVersionId.get(version.id) ?? { total: 0, open: 0, done: 0 },
    }))

    const categories = Array.from(
      new Set(
        [
          ...bills.map((row: any) => optionalString(row.category)),
          ...mappedEnvelopes.map((row) => row.category),
          ...mappedGoals.map((row) => row.category),
        ].filter(Boolean) as string[],
      ),
    ).sort((a, b) => a.localeCompare(b))

    const accountOptions = [
      ...accounts.map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? 'Account'),
        type: String(row.type ?? 'account'),
      })),
      ...cards.map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? 'Card'),
        type: 'card',
      })),
      ...loans.map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? 'Loan'),
        type: 'loan',
      })),
    ].sort((a, b) => a.name.localeCompare(b.name))

    const selectedCycleKey =
      normalizeCycleKey(optionalString(args.cycleKey)) ??
      mappedEnvelopes[0]?.cycleKey ??
      planningVersionsWithCounts[0]?.cycleKey ??
      currentCycleKey

    const currencyOptions = Array.from(
      new Set(
        [
          ...currencyCatalog.map((row: any) => normalizeCurrencyCode(optionalString(row.code))),
          baseCurrency,
          displayCurrency,
          ...mappedGoals.map((row) => row.currency),
          ...mappedFinanceStates.map((row) => row.currency),
          ...mappedEnvelopes.map((row) => row.currency),
        ].filter(Boolean) as string[],
      ),
    ).sort((a, b) => a.localeCompare(b))

    const coreBaseline = buildCoreBaseline({
      incomes,
      bills,
      cards,
      loans,
      accounts,
      monthSnapshots,
      baseCurrency,
    })

    const forecast = buildPhaseFiveForecast({
      currentCycleKey,
      selectedCycleKey,
      baseCurrency,
      displayCurrency,
      coreBaseline,
      incomes,
      bills,
      cards,
      loans,
      planningVersions: planningVersionsWithCounts,
      planningTasks: mappedPlanningTasks,
      financeStates: mappedFinanceStates,
      goals: mappedGoals,
      goalEvents: mappedGoalEvents,
      envelopes: mappedEnvelopes,
    })

    return {
      viewerAuthenticated: true,
      viewerUserId: userId,
      displayCurrency,
      locale,
      baseCurrency,
      currentCycleKey,
      selectedCycleKey,
      options: {
        cycleKeys: Array.from(
          new Set([
            ...buildDefaultCycleKeys(new Date()),
            ...planningVersionsWithCounts.map((row) => row.cycleKey),
            ...mappedEnvelopes.map((row) => row.cycleKey),
          ]),
        )
          .filter(Boolean)
          .sort()
          .reverse(),
        categories,
        ownershipOptions: Array.from(OWNERSHIP_OPTIONS),
        accountOptions,
        currencyOptions,
      },
      forecast,
      planningVersions: planningVersionsWithCounts,
      planningActionTasks: mappedPlanningTasks,
      personalFinanceStates: mappedFinanceStates,
      goals: mappedGoals,
      goalEvents: mappedGoalEvents,
      envelopeBudgets: mappedEnvelopes,
    }
  },
})

export const upsertPhaseFiveEntity = mutation({
  args: {
    entityType: v.union(
      v.literal('planning_version'),
      v.literal('planning_task'),
      v.literal('finance_state'),
      v.literal('goal'),
      v.literal('envelope_budget'),
    ),
    id: v.optional(v.string()),
    valuesJson: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const values = safeParseJsonObject(args.valuesJson)
    if (!values) throw new Error('Invalid values payload')

    const table = PHASE_FIVE_ENTITY_TABLES[args.entityType]
    let patch: Record<string, unknown>
    let entityTypeLabel: string

    if (args.entityType === 'planning_version') {
      patch = buildPlanningVersionPatch(values, now)
      entityTypeLabel = 'planning_month_version'
    } else if (args.entityType === 'planning_task') {
      patch = buildPlanningTaskPatch(values, now)
      entityTypeLabel = 'planning_action_task'
    } else if (args.entityType === 'finance_state') {
      patch = buildFinanceStatePatch(values, now)
      entityTypeLabel = 'personal_finance_state'
    } else if (args.entityType === 'goal') {
      patch = buildGoalPatch(values, now)
      entityTypeLabel = 'goal'
    } else {
      patch = buildEnvelopeBudgetPatch(values, now)
      entityTypeLabel = 'envelope_budget'
    }

    let docId = ''
    let mode: 'created' | 'updated' = 'created'
    let before: any = null

    if (args.id) {
      const existing = await getOwnedDocOrThrow(financeDb, table, args.id, userId)
      before = existing
      await financeDb.patch(existing._id, compactObject({ ...patch, userId, updatedAt: now }))
      docId = String(existing._id)
      mode = 'updated'
    } else {
      docId = String(
        await financeDb.insert(
          table,
          compactObject({
            userId,
            ...patch,
            createdAt: numberOr((patch as any).createdAt, now),
            updatedAt: now,
            source: 'phase5_planning_ui',
          }),
        ),
      )
    }

    await recordFinanceAuditEventSafe(financeDb, {
      action: mode === 'created' ? 'phase5_entity_create' : 'phase5_entity_update',
      entityId: docId,
      entityType: entityTypeLabel,
      userId,
      beforeJson: before ? JSON.stringify(before) : undefined,
      afterJson: JSON.stringify({ id: docId, ...patch }),
      metadataJson: JSON.stringify({ source: 'phase5_planning_tab', entityType: args.entityType, recordedAt: now }),
    })

    return {
      ok: true,
      id: docId,
      mode,
      entityType: args.entityType,
    }
  },
})

export const deletePhaseFiveEntity = mutation({
  args: {
    entityType: v.union(
      v.literal('planning_version'),
      v.literal('planning_task'),
      v.literal('finance_state'),
      v.literal('goal'),
      v.literal('goal_event'),
      v.literal('envelope_budget'),
    ),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const table = PHASE_FIVE_ENTITY_TABLES[args.entityType]
    const existing = await getOwnedDocOrThrow(financeDb, table, args.id, userId)
    await financeDb.delete(existing._id)

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase5_entity_delete',
      entityId: args.id,
      entityType: args.entityType,
      userId,
      beforeJson: JSON.stringify(existing),
      metadataJson: JSON.stringify({ source: 'phase5_planning_tab', recordedAt: Date.now() }),
    })

    return {
      ok: true,
      id: args.id,
      entityType: args.entityType,
    }
  },
})

export const recordGoalEvent = mutation({
  args: {
    goalId: v.string(),
    eventType: v.optional(v.string()),
    amount: v.number(),
    occurredAt: v.optional(v.number()),
    note: v.optional(v.string()),
    applyToGoalCurrent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const financeDb = ctx.db as any
    const now = Date.now()

    const goalDoc = await getOwnedDocOrThrow(financeDb, 'goals', args.goalId, userId)
    const eventType = normalizeGoalEventType(optionalString(args.eventType) ?? 'contribution')
    let amount = numberOr(args.amount)
    if (eventType === 'withdrawal' && amount > 0) amount = -amount
    if (eventType === 'contribution' && amount < 0) amount = Math.abs(amount)
    const occurredAt = Math.max(0, Math.trunc(numberOr(args.occurredAt, now)))

    const goalEventId = String(
      await financeDb.insert(
        'goalEvents',
        compactObject({
          userId,
          goalId: args.goalId,
          eventType,
          amount,
          occurredAt,
          note: optionalString(args.note),
          createdAt: now,
          updatedAt: now,
          source: 'phase5_goals_ui',
        }),
      ),
    )

    let updatedGoalCurrentAmount: number | null = null
    if (args.applyToGoalCurrent !== false) {
      const currentAmount = Math.max(0, numberOr((goalDoc as any).currentAmount ?? (goalDoc as any).current))
      const nextAmount = Math.max(0, currentAmount + amount)
      await financeDb.patch(goalDoc._id, {
        currentAmount: nextAmount,
        updatedAt: now,
        lastGoalEventAt: occurredAt,
      })
      updatedGoalCurrentAmount = nextAmount
    }

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase5_goal_event_record',
      entityId: goalEventId,
      entityType: 'goal_event',
      userId,
      afterJson: JSON.stringify({
        goalEventId,
        goalId: args.goalId,
        amount,
        eventType,
        occurredAt,
        updatedGoalCurrentAmount,
      }),
      metadataJson: JSON.stringify({ source: 'phase5_goals_tab', recordedAt: now }),
    })

    return {
      ok: true,
      goalEventId,
      goalId: args.goalId,
      eventType,
      amount,
      occurredAt,
      updatedGoalCurrentAmount,
    }
  },
})

function buildCoreBaseline({
  incomes,
  bills,
  cards,
  loans,
  accounts,
  monthSnapshots,
  baseCurrency,
}: {
  incomes: any[]
  bills: any[]
  cards: any[]
  loans: any[]
  accounts: any[]
  monthSnapshots: any[]
  baseCurrency: string
}) {
  const monthlyIncome = incomes.reduce((sum, row) => sum + normalizedMonthlyIncome(row), 0)
  const monthlyBills = bills.reduce((sum, row) => sum + normalizedMonthlyBill(row), 0)
  const monthlyCardMinimums = cards.reduce((sum, row) => sum + Math.max(0, numberOr((row as any).minimumPayment)), 0)
  const monthlyLoanMinimums = loans.reduce((sum, row) => sum + Math.max(0, numberOr((row as any).minimumPayment)), 0)
  const monthlyExpenses = monthlyBills + monthlyCardMinimums + monthlyLoanMinimums
  const monthlyNet = monthlyIncome - monthlyExpenses

  const liquidCash = accounts
    .filter((row) => {
      const type = (optionalString((row as any).type) ?? '').toLowerCase()
      const liquid = (row as any).liquid
      return liquid === true || type.includes('checking') || type.includes('savings')
    })
    .reduce((sum, row) => sum + Math.max(0, numberOr((row as any).balance)), 0)

  const totalAssets = accounts
    .filter((row) => {
      const type = (optionalString((row as any).type) ?? '').toLowerCase()
      return type !== 'debt' && type !== 'credit'
    })
    .reduce((sum, row) => sum + Math.max(0, numberOr((row as any).balance)), 0)
  const cardLiabilities = cards.reduce((sum, row) => sum + Math.max(0, numberOr((row as any).usedLimit)), 0)
  const loanLiabilities = loans.reduce((sum, row) => sum + Math.max(0, numberOr((row as any).balance)), 0)
  let liabilities = cardLiabilities + loanLiabilities
  let netWorth = totalAssets - liabilities

  const latestSnapshot = monthSnapshots.slice().sort(sortByUpdatedDesc)[0] ?? null
  const snapshotSummary = (latestSnapshot as any)?.summary
  if (isRecord(snapshotSummary)) {
    const snapshotNetWorth = numberOr((snapshotSummary as any).netWorth, Number.NaN)
    const snapshotLiabilities = numberOr((snapshotSummary as any).totalLiabilities, Number.NaN)
    if (Number.isFinite(snapshotNetWorth)) netWorth = snapshotNetWorth
    if (Number.isFinite(snapshotLiabilities)) liabilities = snapshotLiabilities
  }

  return {
    baseCurrency,
    monthlyIncome,
    monthlyExpenses,
    monthlyBills,
    monthlyCardMinimums,
    monthlyLoanMinimums,
    monthlyNet,
    liquidCash,
    totalAssets,
    liabilities,
    netWorth,
  }
}

function buildPhaseFiveForecast({
  currentCycleKey,
  selectedCycleKey,
  baseCurrency,
  displayCurrency,
  coreBaseline,
  incomes,
  bills,
  cards,
  loans,
  planningVersions,
  planningTasks,
  financeStates,
  goals,
  goalEvents,
  envelopes,
}: {
  currentCycleKey: string
  selectedCycleKey: string
  baseCurrency: string
  displayCurrency: string
  coreBaseline: ReturnType<typeof buildCoreBaseline>
  incomes: any[]
  bills: any[]
  cards: any[]
  loans: any[]
  planningVersions: Array<ReturnType<typeof normalizePlanningVersion> & { taskCounts: { total: number; open: number; done: number } }>
  planningTasks: Array<ReturnType<typeof normalizePlanningTask>>
  financeStates: Array<ReturnType<typeof normalizeFinanceState>>
  goals: Array<ReturnType<typeof normalizeGoal>>
  goalEvents: Array<ReturnType<typeof normalizeGoalEvent>>
  envelopes: Array<ReturnType<typeof normalizeEnvelopeBudget>>
}) {
  const selectedCycleEnvelopes = envelopes.filter((row) => row.cycleKey === selectedCycleKey)
  const envelopeTotals = selectedCycleEnvelopes.reduce(
    (sum, row) => {
      sum.planned += row.plannedAmount
      sum.actual += row.actualAmount
      sum.carryover += row.carryoverAmount
      return sum
    },
    { planned: 0, actual: 0, carryover: 0 },
  )

  const activePlanningVersion =
    planningVersions.find((row) => row.status === 'active') ??
    planningVersions.find((row) => row.cycleKey === selectedCycleKey) ??
    planningVersions[0] ??
    null

  const planningVersionForecast = activePlanningVersion
    ? computePlanningVersionProjection(activePlanningVersion, coreBaseline)
    : null

  const recurringPlanningForecasts = planningVersions
    .filter((row) => row.id !== activePlanningVersion?.id)
    .filter((row) => row.recurringScenario?.enabled)
    .slice(0, 4)
    .map((row) => computePlanningVersionProjection(row, coreBaseline))

  const scenarioForecasts = financeStates.map((state) => computeFinanceStateProjection(state, coreBaseline))
  const combinedScenarios = [
    {
      id: 'baseline-core',
      label: 'Current baseline',
      scenarioLabel: 'Normal month',
      source: 'core-live',
      horizonMonths: 12,
      monthlyIncome: coreBaseline.monthlyIncome,
      monthlyExpenses: coreBaseline.monthlyExpenses,
      monthlyNet: coreBaseline.monthlyNet,
      projectedNetWorth: coreBaseline.netWorth + coreBaseline.monthlyNet * 12,
      projectedLiquidCash: Math.max(0, coreBaseline.liquidCash + coreBaseline.monthlyNet * 12),
      runwayMonths:
        coreBaseline.monthlyExpenses > 0
          ? Math.max(0, coreBaseline.liquidCash / coreBaseline.monthlyExpenses)
          : null,
      expectedReturnPct: null,
      inflationPct: null,
      note: 'Derived from live incomes, bills, cards, and loans.',
      linkedId: null,
      recurringSummary: null,
    },
    ...(planningVersionForecast ? [planningVersionForecast] : []),
    ...recurringPlanningForecasts,
    ...scenarioForecasts,
  ]

  const goalForecasts = goals.map((goal) => {
    const remainingAmount = Math.max(goal.targetAmount - goal.currentAmount, 0)
    const monthsToTarget =
      goal.monthlyContribution > 0 ? Math.ceil(remainingAmount / goal.monthlyContribution) : null
    const projectedCompletionAt =
      monthsToTarget != null ? monthOffsetTimestamp(Date.now(), monthsToTarget) : null
    const recentEvents = goalEvents.filter((event) => event.goalId === goal.id).slice(0, 5)
    return {
      id: goal.id,
      title: goal.title,
      category: goal.category,
      status: goal.status,
      priority: goal.priority,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
      progressPct: goal.progressPct,
      remainingAmount,
      monthsToTarget,
      dueAt: goal.dueAt,
      projectedCompletionAt,
      onTrack:
        monthsToTarget == null
          ? false
          : goal.dueAt == null
            ? true
            : projectedCompletionAt != null && projectedCompletionAt <= goal.dueAt,
      recentEvents,
    }
  })

  const actionTaskSummary = planningTasks.reduce(
    (acc, task) => {
      acc.total += 1
      if (task.status === 'done') acc.done += 1
      else if (task.status === 'blocked') acc.blocked += 1
      else if (task.status === 'in_progress') acc.inProgress += 1
      else acc.todo += 1
      return acc
    },
    { total: 0, done: 0, blocked: 0, inProgress: 0, todo: 0 },
  )

  const fragility = computeCashflowFragility({
    incomes,
    bills,
    cards,
    loans,
    liquidCash: coreBaseline.liquidCash,
    monthlyExpenses: coreBaseline.monthlyExpenses,
  })

  const spendingLens = computeSpendingLens({
    bills,
    cards,
    loans,
    envelopes,
    selectedCycleKey,
  })

  return {
    baseCurrency,
    displayCurrency,
    currentCycleKey,
    selectedCycleKey,
    baseline: {
      ...coreBaseline,
      envelopePlannedForSelectedCycle: envelopeTotals.planned,
      envelopeActualForSelectedCycle: envelopeTotals.actual,
      envelopeCarryoverForSelectedCycle: envelopeTotals.carryover,
    },
    scenarios: combinedScenarios,
    activePlanningVersionId: activePlanningVersion?.id ?? null,
    activePlanningVersionSummary: activePlanningVersion
      ? {
          id: activePlanningVersion.id,
          name: activePlanningVersion.name,
          cycleKey: activePlanningVersion.cycleKey,
          status: activePlanningVersion.status,
          scenarioType: activePlanningVersion.scenarioType,
          taskCounts: activePlanningVersion.taskCounts,
          plannedIncome: activePlanningVersion.plannedIncome,
          plannedExpenses: activePlanningVersion.plannedExpenses,
          plannedSavings: activePlanningVersion.plannedSavings,
          plannedNet: activePlanningVersion.plannedNet,
          horizonMonths: activePlanningVersion.horizonMonths,
        }
      : null,
    goals: goalForecasts,
    envelopes: {
      selectedCycleKey,
      totals: {
        planned: envelopeTotals.planned,
        actual: envelopeTotals.actual,
        carryover: envelopeTotals.carryover,
        remaining: envelopeTotals.planned + envelopeTotals.carryover - envelopeTotals.actual,
        utilizationPct:
          envelopeTotals.planned + envelopeTotals.carryover > 0
            ? envelopeTotals.actual / (envelopeTotals.planned + envelopeTotals.carryover)
            : 0,
      },
      categories: selectedCycleEnvelopes.map((row) => ({
        id: row.id,
        category: row.category,
        plannedAmount: row.plannedAmount,
        actualAmount: row.actualAmount,
        carryoverAmount: row.carryoverAmount,
        remainingAmount: row.remainingAmount,
        utilizationPct: row.utilizationPct,
        ownership: row.ownership,
        status: row.status,
      })),
    },
    tasks: actionTaskSummary,
    cashflowFragility: fragility,
    spendingLens,
  }
}

function computePlanningVersionProjection(
  version: ReturnType<typeof normalizePlanningVersion> & { taskCounts: { total: number; open: number; done: number } },
  core: ReturnType<typeof buildCoreBaseline>,
) {
  const monthlyIncome = version.plannedIncome || core.monthlyIncome
  const monthlyExpenses = version.plannedExpenses || core.monthlyExpenses
  const monthlyNet =
    Number.isFinite(version.plannedNet) && version.plannedNet !== 0
      ? version.plannedNet
      : monthlyIncome - monthlyExpenses
  const horizon = Math.max(1, version.horizonMonths || 12)
  const projectedLiquidCash = Math.max(0, core.liquidCash + monthlyNet * horizon)
  return {
    id: `plan-${version.id}`,
    label: `${version.name} (${version.cycleKey})`,
    scenarioLabel: scenarioTypeUxLabel(version.scenarioType),
    source: 'planning_version',
    horizonMonths: horizon,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet,
    projectedNetWorth: core.netWorth + monthlyNet * horizon,
    projectedLiquidCash,
    runwayMonths: monthlyExpenses > 0 ? projectedLiquidCash / monthlyExpenses : null,
    expectedReturnPct: null,
    inflationPct: null,
    note: version.note || `${version.taskCounts.open} open planning tasks`,
    linkedId: version.id,
    recurringSummary: describeRecurringScenario(version.recurringScenario),
  }
}

function computeFinanceStateProjection(
  state: ReturnType<typeof normalizeFinanceState>,
  core: ReturnType<typeof buildCoreBaseline>,
) {
  const horizon = Math.max(1, state.horizonMonths || 12)
  const monthlyIncome = state.monthlyIncome || core.monthlyIncome
  const monthlyExpenses = state.monthlyExpenses || core.monthlyExpenses
  const monthlyNet = monthlyIncome - monthlyExpenses
  const startingAssets = state.assets || core.totalAssets
  const startingLiabilities = state.liabilities || core.liabilities
  const startingNetWorth = state.startingNetWorth || startingAssets - startingLiabilities
  const annualRealReturn = (state.expectedReturnPct - state.inflationPct) / 100
  const growthContribution = startingAssets * annualRealReturn * (horizon / 12)
  const projectedNetWorth = startingNetWorth + monthlyNet * horizon + growthContribution
  const projectedLiquidCash = Math.max(0, state.liquidCash + monthlyNet * horizon)

  return {
    id: `state-${state.id}`,
    label: state.name,
    scenarioLabel: inferScenarioLabel(monthlyNet, monthlyExpenses),
    source: 'finance_state',
    horizonMonths: horizon,
    monthlyIncome,
    monthlyExpenses,
    monthlyNet,
    projectedNetWorth,
    projectedLiquidCash,
    runwayMonths: monthlyExpenses > 0 ? projectedLiquidCash / monthlyExpenses : null,
    expectedReturnPct: state.expectedReturnPct,
    inflationPct: state.inflationPct,
    note: state.note,
    linkedId: state.id,
    recurringSummary: null,
  }
}

function buildEmptyForecast(cycleKey: string) {
  return {
    baseCurrency: DEFAULT_DISPLAY_CURRENCY,
    displayCurrency: DEFAULT_DISPLAY_CURRENCY,
    currentCycleKey: cycleKey,
    selectedCycleKey: cycleKey,
    baseline: {
      baseCurrency: DEFAULT_DISPLAY_CURRENCY,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyBills: 0,
      monthlyCardMinimums: 0,
      monthlyLoanMinimums: 0,
      monthlyNet: 0,
      liquidCash: 0,
      totalAssets: 0,
      liabilities: 0,
      netWorth: 0,
      envelopePlannedForSelectedCycle: 0,
      envelopeActualForSelectedCycle: 0,
      envelopeCarryoverForSelectedCycle: 0,
    },
    scenarios: [] as any[],
    activePlanningVersionId: null,
    activePlanningVersionSummary: null,
    goals: [] as any[],
    envelopes: {
      selectedCycleKey: cycleKey,
      totals: {
        planned: 0,
        actual: 0,
        carryover: 0,
        remaining: 0,
        utilizationPct: 0,
      },
      categories: [] as any[],
    },
    tasks: {
      total: 0,
      done: 0,
      blocked: 0,
      inProgress: 0,
      todo: 0,
    },
    cashflowFragility: {
      score: 0,
      level: 'low',
      dueClusterScore: 0,
      lowBufferScore: 0,
      lowBufferDays: 0,
      dueDayClusters: [] as Array<{ day: number; amount: number; source: string }>,
      insights: [] as string[],
    },
    spendingLens: {
      fixed: 0,
      variable: 0,
      controllable: 0,
      total: 0,
      shares: {
        fixed: 0,
        variable: 0,
        controllable: 0,
      },
    },
  }
}

function normalizePlanningVersion(row: any, currentCycleKey: string) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const assumptions =
    safeParseJsonObject(row.assumptionsJson) ??
    safeParseJsonObject((payload as any).assumptionsJson) ??
    {}
  const cycleKey =
    normalizeCycleKey(optionalString(row.cycleKey) ?? optionalString((payload as any).cycleKey)) ??
    currentCycleKey
  const plannedIncome = numberOr(row.plannedIncome ?? (payload as any).plannedIncome)
  const plannedExpenses = numberOr(row.plannedExpenses ?? (payload as any).plannedExpenses)
  const plannedSavings = numberOr(row.plannedSavings ?? (payload as any).plannedSavings)
  const plannedNet = numberOr(
    row.plannedNet ?? (payload as any).plannedNet,
    plannedSavings || plannedIncome - plannedExpenses,
  )
  return {
    id: String(row._id),
    cycleKey,
    name: String(row.name ?? row.title ?? `${cycleKey} plan`),
    versionKey: optionalString(row.versionKey) ?? optionalString((payload as any).versionKey) ?? 'v1',
    status: normalizePlanningVersionStatus(optionalString(row.status)),
    scenarioType: normalizeScenarioType(optionalString(row.scenarioType)),
    scenarioLabel: scenarioTypeUxLabel(normalizeScenarioType(optionalString(row.scenarioType))),
    plannedIncome,
    plannedExpenses,
    plannedSavings,
    plannedNet,
    horizonMonths: clampInt(numberOr(row.horizonMonths ?? (payload as any).horizonMonths, 12), 1, 120),
    linkedStateId: optionalString(row.linkedStateId) ?? optionalString((payload as any).linkedStateId) ?? '',
    note: optionalString(row.note) ?? optionalString((payload as any).note) ?? '',
    assumptionsJson: stringifyJsonObject(assumptions),
    recurringScenario: normalizeRecurringScenario((assumptions as any).recurringScenario, cycleKey, String(row.name ?? row.title ?? `${cycleKey} plan`)),
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
  }
}

function scenarioTypeUxLabel(scenarioType: string) {
  if (scenarioType === 'downside') return 'Tight month'
  if (scenarioType === 'recovery') return 'Recovery month'
  if (scenarioType === 'stretch') return 'Growth month'
  return 'Normal month'
}

function inferScenarioLabel(monthlyNet: number, monthlyExpenses: number) {
  if (monthlyNet < 0) return 'Tight month'
  if (monthlyExpenses > 0 && monthlyNet / monthlyExpenses >= 0.2) return 'Recovery month'
  return 'Normal month'
}

function normalizeRecurringScenario(value: unknown, cycleKey: string, fallbackName: string) {
  if (!isRecord(value)) {
    return {
      enabled: false,
      name: '',
      intervalMonths: 1,
      startCycleKey: cycleKey,
      tags: [] as string[],
    }
  }
  const tagsRaw = Array.isArray((value as any).tags) ? ((value as any).tags as unknown[]) : []
  const tags = tagsRaw
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 8)
  return {
    enabled: Boolean((value as any).enabled ?? true),
    name: optionalString((value as any).name) ?? fallbackName,
    intervalMonths: clampInt(numberOr((value as any).intervalMonths, 1), 1, 12),
    startCycleKey: normalizeCycleKey(optionalString((value as any).startCycleKey)) ?? cycleKey,
    tags,
  }
}

function describeRecurringScenario(recurringScenario: {
  enabled: boolean
  name: string
  intervalMonths: number
  startCycleKey: string
  tags: string[]
}) {
  if (!recurringScenario.enabled) return null
  const cadence =
    recurringScenario.intervalMonths === 1
      ? 'Monthly'
      : recurringScenario.intervalMonths === 2
        ? 'Every 2 months'
        : recurringScenario.intervalMonths === 3
          ? 'Quarterly'
          : `Every ${recurringScenario.intervalMonths} months`
  const tagsLabel = recurringScenario.tags.length ? ` · ${recurringScenario.tags.join(', ')}` : ''
  return `${recurringScenario.name} · ${cadence}${tagsLabel}`
}

function computeCashflowFragility({
  incomes,
  bills,
  cards,
  loans,
  liquidCash,
  monthlyExpenses,
}: {
  incomes: any[]
  bills: any[]
  cards: any[]
  loans: any[]
  liquidCash: number
  monthlyExpenses: number
}) {
  const dueRows = [
    ...bills.map((row) => ({
      day: clampInt(numberOr((row as any).dueDay, 1), 1, 31),
      amount: Math.max(0, normalizedMonthlyBill(row)),
      source: 'bill',
    })),
    ...cards.map((row) => ({
      day: clampInt(numberOr((row as any).dueDay, 20), 1, 31),
      amount: Math.max(0, numberOr((row as any).minimumPayment)),
      source: 'card',
    })),
    ...loans.map((row) => ({
      day: clampInt(numberOr((row as any).dueDay, 15), 1, 31),
      amount: Math.max(0, numberOr((row as any).minimumPayment)),
      source: 'loan',
    })),
  ]
  const paydayRows = incomes.map((row) => clampInt(numberOr((row as any).receivedDay, 1), 1, 31))
  const earlyWindowExposure = dueRows
    .filter((row) => row.day <= 10)
    .reduce((sum, row) => sum + row.amount, 0)
  const totalDue = dueRows.reduce((sum, row) => sum + row.amount, 0)
  const dueClusterShare = totalDue > 0 ? earlyWindowExposure / totalDue : 0
  const paydayBeforeTen = paydayRows.some((day) => day <= 10)
  const clusterPenalty = paydayBeforeTen ? dueClusterShare * 0.7 : dueClusterShare
  const dueClusterScore = Math.min(100, Math.round(clusterPenalty * 100))

  const dailyOutflow = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0
  const lowBufferDays = dailyOutflow > 0 ? liquidCash / dailyOutflow : 0
  const lowBufferScore =
    dailyOutflow <= 0
      ? 0
      : lowBufferDays < 7
        ? 95
        : lowBufferDays < 14
          ? 70
          : lowBufferDays < 30
            ? 45
            : 20

  const score = Math.round(dueClusterScore * 0.45 + lowBufferScore * 0.55)
  const level = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low'

  const insights: string[] = []
  if (dueClusterScore >= 55) {
    insights.push('Obligations are clustered early in the month; cash pressure spikes before mid-cycle.')
  }
  if (lowBufferDays > 0 && lowBufferDays < 14) {
    insights.push(`Liquid buffer covers about ${Math.max(1, Math.round(lowBufferDays))} days at current obligation pace.`)
  }
  if (paydayRows.length === 0) {
    insights.push('No paycheck cadence found for fragility balancing.')
  }

  return {
    score,
    level,
    dueClusterScore,
    lowBufferScore,
    lowBufferDays,
    dueDayClusters: dueRows
      .sort((a, b) => a.day - b.day)
      .slice(0, 12),
    insights,
  }
}

function computeSpendingLens({
  bills,
  cards,
  loans,
  envelopes,
  selectedCycleKey,
}: {
  bills: any[]
  cards: any[]
  loans: any[]
  envelopes: Array<ReturnType<typeof normalizeEnvelopeBudget>>
  selectedCycleKey: string
}) {
  const fixedBillCategories = ['rent', 'mortgage', 'insurance', 'tax', 'council', 'utilities']
  const fixedBills = bills.reduce((sum, row) => {
    const category = (optionalString((row as any).category) ?? '').toLowerCase()
    const amount = Math.max(0, normalizedMonthlyBill(row))
    return fixedBillCategories.some((entry) => category.includes(entry)) ? sum + amount : sum
  }, 0)
  const variableBills = bills.reduce((sum, row) => {
    const category = (optionalString((row as any).category) ?? '').toLowerCase()
    const amount = Math.max(0, normalizedMonthlyBill(row))
    return fixedBillCategories.some((entry) => category.includes(entry)) ? sum : sum + amount
  }, 0)
  const cardMinimums = cards.reduce((sum, row) => sum + Math.max(0, numberOr((row as any).minimumPayment)), 0)
  const loanMinimums = loans.reduce((sum, row) => sum + Math.max(0, numberOr((row as any).minimumPayment)), 0)
  const selectedEnvelopes = envelopes.filter((row) => row.cycleKey === selectedCycleKey)
  const plannedEnvelopeSpend = selectedEnvelopes.reduce((sum, row) => sum + Math.max(0, row.plannedAmount), 0)

  const fixed = fixedBills + cardMinimums + loanMinimums
  const variable = variableBills
  const controllable = Math.max(0, plannedEnvelopeSpend)
  const total = fixed + variable + controllable

  return {
    fixed,
    variable,
    controllable,
    total,
    shares: {
      fixed: total > 0 ? fixed / total : 0,
      variable: total > 0 ? variable / total : 0,
      controllable: total > 0 ? controllable / total : 0,
    },
  }
}

function normalizePlanningTask(row: any) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const dueAt = numberOr(row.dueAt ?? (payload as any).dueAt, 0)
  return {
    id: String(row._id),
    planningVersionId: optionalString(row.planningVersionId) ?? optionalString((payload as any).planningVersionId) ?? '',
    title: String(row.title ?? row.name ?? 'Planning task'),
    status: normalizePlanningTaskStatus(optionalString(row.status)),
    priority: normalizePriority(optionalString(row.priority)),
    ownerScope: normalizeOwnership(optionalString(row.ownerScope) ?? optionalString((payload as any).ownerScope) ?? DEFAULT_OWNERSHIP),
    dueAt: dueAt > 0 ? dueAt : null,
    impactMonthly: numberOr(row.impactMonthly ?? (payload as any).impactMonthly),
    note: optionalString(row.note) ?? optionalString((payload as any).note) ?? '',
    linkedEntityType: optionalString(row.linkedEntityType) ?? optionalString((payload as any).linkedEntityType) ?? '',
    linkedEntityId: optionalString(row.linkedEntityId) ?? optionalString((payload as any).linkedEntityId) ?? '',
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
  }
}

function normalizeFinanceState(row: any, baseCurrency: string) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const assets = numberOr(row.assets ?? (payload as any).assets)
  const liabilities = numberOr(row.liabilities ?? (payload as any).liabilities)
  const startingNetWorth = numberOr(
    row.startingNetWorth ?? (payload as any).startingNetWorth,
    assets - liabilities,
  )
  return {
    id: String(row._id),
    name: String(row.name ?? row.title ?? 'Scenario state'),
    stateKind: normalizeFinanceStateKind(optionalString(row.stateKind)),
    horizonMonths: clampInt(numberOr(row.horizonMonths ?? (payload as any).horizonMonths, 12), 1, 240),
    monthlyIncome: numberOr(row.monthlyIncome ?? (payload as any).monthlyIncome),
    monthlyExpenses: numberOr(row.monthlyExpenses ?? (payload as any).monthlyExpenses),
    liquidCash: numberOr(row.liquidCash ?? (payload as any).liquidCash),
    assets,
    liabilities,
    startingNetWorth,
    expectedReturnPct: numberOr(row.expectedReturnPct ?? (payload as any).expectedReturnPct),
    inflationPct: numberOr(row.inflationPct ?? (payload as any).inflationPct),
    currency: normalizeCurrencyCode(optionalString(row.currency) ?? optionalString((payload as any).currency) ?? baseCurrency),
    note: optionalString(row.note) ?? optionalString((payload as any).note) ?? '',
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
  }
}

function normalizeGoal(
  row: any,
  baseCurrency: string,
  recentEvents: Array<ReturnType<typeof normalizeGoalEvent>>,
) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const targetAmount = Math.max(0, numberOr(row.targetAmount ?? row.target ?? (payload as any).targetAmount))
  const currentAmount = Math.max(0, numberOr(row.currentAmount ?? row.current ?? (payload as any).currentAmount))
  const monthlyContribution = Math.max(
    0,
    numberOr(row.monthlyContribution ?? (payload as any).monthlyContribution),
  )
  const dueAt = numberOr(row.dueAt ?? row.targetDateAt ?? (payload as any).dueAt, 0)
  const progressPct = targetAmount > 0 ? Math.min(currentAmount / targetAmount, 1) : 0
  const remainingAmount = Math.max(targetAmount - currentAmount, 0)
  const monthsToTarget = monthlyContribution > 0 ? Math.ceil(remainingAmount / monthlyContribution) : null
  return {
    id: String(row._id),
    title: String(row.title ?? row.name ?? 'Goal'),
    category: optionalString(row.category) ?? optionalString((payload as any).category) ?? 'general',
    status: normalizeGoalStatus(optionalString(row.status)),
    priority: normalizePriority(optionalString(row.priority)),
    ownership: normalizeOwnership(optionalString(row.ownership) ?? optionalString((payload as any).ownership) ?? DEFAULT_OWNERSHIP),
    targetAmount,
    currentAmount,
    monthlyContribution,
    dueAt: dueAt > 0 ? dueAt : null,
    dueLabel:
      optionalString(row.dueLabel) ??
      optionalString(row.targetDateLabel) ??
      estimateGoalDueLabel(dueAt > 0 ? dueAt : null, monthsToTarget),
    currency: normalizeCurrencyCode(optionalString(row.currency) ?? optionalString((payload as any).currency) ?? baseCurrency),
    note: optionalString(row.note) ?? optionalString((payload as any).note) ?? '',
    progressPct,
    remainingAmount,
    monthsToTarget,
    lastEventAt:
      numberOr(row.lastGoalEventAt, 0) || recentEvents[0]?.occurredAt || recentEvents[0]?.createdAt || null,
    recentEvents,
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
  }
}

function normalizeGoalEvent(row: any) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const occurredAt = numberOr(row.occurredAt ?? (payload as any).occurredAt ?? row.createdAt ?? row._creationTime, 0)
  return {
    id: String(row._id),
    goalId: optionalString(row.goalId) ?? optionalString((payload as any).goalId) ?? '',
    eventType: normalizeGoalEventType(optionalString(row.eventType)),
    amount: numberOr(row.amount ?? (payload as any).amount),
    note: optionalString(row.note) ?? optionalString((payload as any).note) ?? '',
    occurredAt: occurredAt > 0 ? occurredAt : null,
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
  }
}

function normalizeEnvelopeBudget(row: any, baseCurrency: string) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const plannedAmount = Math.max(0, numberOr(row.plannedAmount ?? row.amount ?? (payload as any).plannedAmount))
  const actualAmount = Math.max(0, numberOr(row.actualAmount ?? (payload as any).actualAmount))
  const carryoverAmount = numberOr(row.carryoverAmount ?? (payload as any).carryoverAmount)
  const totalAvailable = plannedAmount + carryoverAmount
  const remainingAmount = totalAvailable - actualAmount
  return {
    id: String(row._id),
    cycleKey:
      normalizeCycleKey(optionalString(row.cycleKey) ?? optionalString((payload as any).cycleKey)) ??
      cycleKeyFromDate(new Date()),
    category: optionalString(row.category) ?? optionalString((payload as any).category) ?? 'general',
    plannedAmount,
    actualAmount,
    carryoverAmount,
    remainingAmount,
    utilizationPct: totalAvailable > 0 ? actualAmount / totalAvailable : 0,
    ownership: normalizeOwnership(optionalString(row.ownership) ?? optionalString((payload as any).ownership) ?? DEFAULT_OWNERSHIP),
    status: normalizeEnvelopeStatus(optionalString(row.status)),
    rollover: Boolean(row.rollover ?? (payload as any).rollover ?? false),
    note: optionalString(row.note) ?? optionalString((payload as any).note) ?? '',
    currency: normalizeCurrencyCode(optionalString(row.currency) ?? optionalString((payload as any).currency) ?? baseCurrency),
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
  }
}

function buildPlanningVersionPatch(values: Record<string, unknown>, now: number) {
  const cycleKey = normalizeCycleKey(optionalString(values.cycleKey)) ?? cycleKeyFromDate(new Date())
  const assumptions = safeParseJsonObject(values.assumptionsJson) ?? {}
  return {
    name: requiredString(values.name, 'Planning version name'),
    cycleKey,
    versionKey: optionalString(values.versionKey) ?? 'v1',
    status: normalizePlanningVersionStatus(optionalString(values.status)),
    scenarioType: normalizeScenarioType(optionalString(values.scenarioType)),
    plannedIncome: Math.max(0, numberOr(values.plannedIncome)),
    plannedExpenses: Math.max(0, numberOr(values.plannedExpenses)),
    plannedSavings: numberOr(values.plannedSavings),
    plannedNet: numberOr(values.plannedNet),
    horizonMonths: clampInt(numberOr(values.horizonMonths, 12), 1, 120),
    linkedStateId: optionalString(values.linkedStateId),
    note: optionalString(values.note),
    assumptionsJson: stringifyJsonObject(assumptions),
    payloadJson: stringifyJsonObject({
      cycleKey,
      versionKey: optionalString(values.versionKey) ?? 'v1',
      scenarioType: normalizeScenarioType(optionalString(values.scenarioType)),
      plannedIncome: Math.max(0, numberOr(values.plannedIncome)),
      plannedExpenses: Math.max(0, numberOr(values.plannedExpenses)),
      plannedSavings: numberOr(values.plannedSavings),
      plannedNet: numberOr(values.plannedNet),
      horizonMonths: clampInt(numberOr(values.horizonMonths, 12), 1, 120),
      linkedStateId: optionalString(values.linkedStateId),
      note: optionalString(values.note),
      assumptionsJson: assumptions,
    }),
    updatedAt: now,
  }
}

function buildPlanningTaskPatch(values: Record<string, unknown>, now: number) {
  const dueAt = numberOr(values.dueAt, 0)
  return {
    title: requiredString(values.title, 'Task title'),
    planningVersionId: optionalString(values.planningVersionId),
    status: normalizePlanningTaskStatus(optionalString(values.status)),
    priority: normalizePriority(optionalString(values.priority)),
    ownerScope: normalizeOwnership(optionalString(values.ownerScope) ?? DEFAULT_OWNERSHIP),
    dueAt: dueAt > 0 ? Math.trunc(dueAt) : undefined,
    impactMonthly: numberOr(values.impactMonthly),
    note: optionalString(values.note),
    linkedEntityType: optionalString(values.linkedEntityType),
    linkedEntityId: optionalString(values.linkedEntityId),
    payloadJson: stringifyJsonObject({
      planningVersionId: optionalString(values.planningVersionId),
      dueAt: dueAt > 0 ? Math.trunc(dueAt) : null,
      ownerScope: normalizeOwnership(optionalString(values.ownerScope) ?? DEFAULT_OWNERSHIP),
      impactMonthly: numberOr(values.impactMonthly),
      note: optionalString(values.note),
      linkedEntityType: optionalString(values.linkedEntityType),
      linkedEntityId: optionalString(values.linkedEntityId),
    }),
    updatedAt: now,
  }
}

function buildFinanceStatePatch(values: Record<string, unknown>, now: number) {
  const monthlyIncome = Math.max(0, numberOr(values.monthlyIncome))
  const monthlyExpenses = Math.max(0, numberOr(values.monthlyExpenses))
  const assets = Math.max(0, numberOr(values.assets))
  const liabilities = Math.max(0, numberOr(values.liabilities))
  const liquidCash = Math.max(0, numberOr(values.liquidCash))
  const expectedReturnPct = numberOr(values.expectedReturnPct)
  const inflationPct = numberOr(values.inflationPct)
  const currency = normalizeCurrencyCode(optionalString(values.currency) ?? DEFAULT_DISPLAY_CURRENCY)
  const startingNetWorth = numberOr(values.startingNetWorth, assets - liabilities)

  return {
    name: requiredString(values.name, 'State name'),
    stateKind: normalizeFinanceStateKind(optionalString(values.stateKind)),
    horizonMonths: clampInt(numberOr(values.horizonMonths, 12), 1, 240),
    monthlyIncome,
    monthlyExpenses,
    assets,
    liabilities,
    liquidCash,
    expectedReturnPct,
    inflationPct,
    startingNetWorth,
    currency,
    note: optionalString(values.note),
    payloadJson: stringifyJsonObject({
      monthlyIncome,
      monthlyExpenses,
      assets,
      liabilities,
      liquidCash,
      expectedReturnPct,
      inflationPct,
      startingNetWorth,
      currency,
      note: optionalString(values.note),
    }),
    updatedAt: now,
  }
}

function buildGoalPatch(values: Record<string, unknown>, now: number) {
  const targetAmount = Math.max(0, numberOr(values.targetAmount))
  const currentAmount = Math.max(0, numberOr(values.currentAmount))
  const monthlyContribution = Math.max(0, numberOr(values.monthlyContribution))
  const dueAt = numberOr(values.dueAt, 0)
  const currency = normalizeCurrencyCode(optionalString(values.currency) ?? DEFAULT_DISPLAY_CURRENCY)
  return {
    title: requiredString(values.title, 'Goal title'),
    name: requiredString(values.title, 'Goal title'),
    category: optionalString(values.category) ?? 'general',
    status: normalizeGoalStatus(optionalString(values.status)),
    priority: normalizePriority(optionalString(values.priority)),
    ownership: normalizeOwnership(optionalString(values.ownership) ?? DEFAULT_OWNERSHIP),
    targetAmount,
    currentAmount,
    monthlyContribution,
    dueAt: dueAt > 0 ? Math.trunc(dueAt) : undefined,
    dueLabel:
      optionalString(values.dueLabel) ??
      estimateGoalDueLabel(dueAt > 0 ? Math.trunc(dueAt) : null, monthlyContribution > 0 && targetAmount > currentAmount ? Math.ceil((targetAmount - currentAmount) / monthlyContribution) : null),
    currency,
    note: optionalString(values.note),
    payloadJson: stringifyJsonObject({
      category: optionalString(values.category) ?? 'general',
      status: normalizeGoalStatus(optionalString(values.status)),
      priority: normalizePriority(optionalString(values.priority)),
      ownership: normalizeOwnership(optionalString(values.ownership) ?? DEFAULT_OWNERSHIP),
      targetAmount,
      currentAmount,
      monthlyContribution,
      dueAt: dueAt > 0 ? Math.trunc(dueAt) : null,
      currency,
      note: optionalString(values.note),
    }),
    updatedAt: now,
  }
}

function buildEnvelopeBudgetPatch(values: Record<string, unknown>, now: number) {
  const cycleKey = normalizeCycleKey(optionalString(values.cycleKey)) ?? cycleKeyFromDate(new Date())
  const plannedAmount = Math.max(0, numberOr(values.plannedAmount))
  const actualAmount = Math.max(0, numberOr(values.actualAmount))
  const carryoverAmount = numberOr(values.carryoverAmount)
  const currency = normalizeCurrencyCode(optionalString(values.currency) ?? DEFAULT_DISPLAY_CURRENCY)
  const rollover = Boolean(values.rollover)
  const status = normalizeEnvelopeStatus(optionalString(values.status))
  return {
    cycleKey,
    category: requiredString(values.category, 'Envelope category'),
    plannedAmount,
    actualAmount,
    carryoverAmount,
    ownership: normalizeOwnership(optionalString(values.ownership) ?? DEFAULT_OWNERSHIP),
    status,
    rollover,
    currency,
    note: optionalString(values.note),
    payloadJson: stringifyJsonObject({
      cycleKey,
      plannedAmount,
      actualAmount,
      carryoverAmount,
      ownership: normalizeOwnership(optionalString(values.ownership) ?? DEFAULT_OWNERSHIP),
      status,
      rollover,
      currency,
      note: optionalString(values.note),
    }),
    updatedAt: now,
  }
}

function groupGoalEventsByGoalId(goalEvents: Array<ReturnType<typeof normalizeGoalEvent>>) {
  const byGoalId = new Map<string, Array<ReturnType<typeof normalizeGoalEvent>>>()
  for (const event of goalEvents) {
    if (!event.goalId) continue
    const group = byGoalId.get(event.goalId) ?? []
    group.push(event)
    byGoalId.set(event.goalId, group)
  }
  for (const [goalId, rows] of byGoalId) {
    byGoalId.set(goalId, rows.slice().sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0)))
  }
  return byGoalId
}

function normalizedMonthlyIncome(row: any) {
  const amount = Math.max(0, numberOr((row as any).amount))
  const cadence = (optionalString((row as any).cadence) ?? 'monthly').toLowerCase()
  if (cadence === 'weekly') return amount * 52 / 12
  if (cadence === 'biweekly') return amount * 26 / 12
  if (cadence === 'quarterly') return amount / 3
  if (cadence === 'yearly' || cadence === 'annual') return amount / 12
  if (cadence === 'custom') {
    const interval = Math.max(1, Math.trunc(numberOr((row as any).customInterval, 1)))
    const unit = (optionalString((row as any).customUnit) ?? 'weeks').toLowerCase()
    if (unit.startsWith('day')) return amount * (30.4375 / interval)
    if (unit.startsWith('month')) return amount / interval
    if (unit.startsWith('year')) return amount / (12 * interval)
    return amount * (4.34524 / interval)
  }
  return amount
}

function normalizedMonthlyBill(row: any) {
  const amount = Math.max(0, numberOr((row as any).amount))
  const cadence = (optionalString((row as any).cadence) ?? 'monthly').toLowerCase()
  if (cadence === 'weekly') return amount * 52 / 12
  if (cadence === 'biweekly') return amount * 26 / 12
  if (cadence === 'quarterly') return amount / 3
  if (cadence === 'yearly' || cadence === 'annual') return amount / 12
  if (cadence === 'custom') {
    const interval = Math.max(1, Math.trunc(numberOr((row as any).customInterval, 1)))
    const unit = (optionalString((row as any).customUnit) ?? 'weeks').toLowerCase()
    if (unit.startsWith('day')) return amount * (30.4375 / interval)
    if (unit.startsWith('month')) return amount / interval
    if (unit.startsWith('year')) return amount / (12 * interval)
    return amount * (4.34524 / interval)
  }
  return amount
}

function sortByUpdatedDesc(a: any, b: any) {
  return (
    numberOr((b as any)?.updatedAt ?? (b as any)?.createdAt ?? (b as any)?._creationTime) -
    numberOr((a as any)?.updatedAt ?? (a as any)?.createdAt ?? (a as any)?._creationTime)
  )
}

function sortPlanningTasks(a: any, b: any) {
  const priorityWeight = (value: string) => {
    if (value === 'high') return 0
    if (value === 'medium') return 1
    return 2
  }
  const aStatus = normalizePlanningTaskStatus(optionalString((a as any).status))
  const bStatus = normalizePlanningTaskStatus(optionalString((b as any).status))
  const statusWeight = (value: string) => {
    if (value === 'blocked') return 0
    if (value === 'in_progress') return 1
    if (value === 'todo') return 2
    return 3
  }
  const statusDiff = statusWeight(aStatus) - statusWeight(bStatus)
  if (statusDiff !== 0) return statusDiff
  const prDiff =
    priorityWeight(normalizePriority(optionalString((a as any).priority))) -
    priorityWeight(normalizePriority(optionalString((b as any).priority)))
  if (prDiff !== 0) return prDiff
  const aDue = numberOr((a as any).dueAt, Number.MAX_SAFE_INTEGER)
  const bDue = numberOr((b as any).dueAt, Number.MAX_SAFE_INTEGER)
  if (aDue !== bDue) return aDue - bDue
  return sortByUpdatedDesc(a, b)
}

function sortGoals(a: any, b: any) {
  const statusWeight = (value: string) => {
    if (value === 'active') return 0
    if (value === 'paused') return 1
    if (value === 'completed') return 2
    return 3
  }
  const aStatus = normalizeGoalStatus(optionalString((a as any).status))
  const bStatus = normalizeGoalStatus(optionalString((b as any).status))
  const statusDiff = statusWeight(aStatus) - statusWeight(bStatus)
  if (statusDiff !== 0) return statusDiff
  const prWeight = (value: string) => {
    if (value === 'high') return 0
    if (value === 'medium') return 1
    return 2
  }
  const prDiff =
    prWeight(normalizePriority(optionalString((a as any).priority))) -
    prWeight(normalizePriority(optionalString((b as any).priority)))
  if (prDiff !== 0) return prDiff
  return sortByUpdatedDesc(a, b)
}

function sortEnvelopes(a: any, b: any) {
  const aCycle = optionalString((a as any).cycleKey) ?? ''
  const bCycle = optionalString((b as any).cycleKey) ?? ''
  if (aCycle !== bCycle) return bCycle.localeCompare(aCycle)
  const aCategory = optionalString((a as any).category) ?? ''
  const bCategory = optionalString((b as any).category) ?? ''
  return aCategory.localeCompare(bCategory)
}

function estimateGoalDueLabel(dueAt: number | null, monthsToTarget: number | null) {
  if (dueAt) {
    const date = new Date(dueAt)
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }
  if (monthsToTarget == null) return 'Planned'
  if (monthsToTarget <= 1) return '1 month'
  if (monthsToTarget <= 3) return `${monthsToTarget} months`
  return `${Math.ceil(monthsToTarget / 3)}Q horizon`
}

function normalizePlanningVersionStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'active') return 'active'
  if (normalized === 'archived') return 'archived'
  if (normalized === 'locked') return 'locked'
  return 'draft'
}

function normalizePlanningTaskStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'in_progress' || normalized === 'in-progress') return 'in_progress'
  if (normalized === 'done' || normalized === 'completed') return 'done'
  if (normalized === 'blocked') return 'blocked'
  return 'todo'
}

function normalizeFinanceStateKind(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'current') return 'current'
  if (normalized === 'target') return 'target'
  return 'scenario'
}

function normalizeGoalStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'completed') return 'completed'
  if (normalized === 'paused') return 'paused'
  if (normalized === 'cancelled') return 'cancelled'
  return 'active'
}

function normalizeGoalEventType(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'withdrawal' || normalized === 'debit') return 'withdrawal'
  if (normalized === 'adjustment') return 'adjustment'
  if (normalized === 'milestone') return 'milestone'
  return 'contribution'
}

function normalizeEnvelopeStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'funded') return 'funded'
  if (normalized === 'at_risk' || normalized === 'atrisk') return 'at_risk'
  if (normalized === 'over') return 'over'
  return 'draft'
}

function normalizeScenarioType(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'stretch') return 'stretch'
  if (normalized === 'downside') return 'downside'
  if (normalized === 'recovery') return 'recovery'
  return 'base'
}

function normalizePriority(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'high') return 'high'
  if (normalized === 'low') return 'low'
  return 'medium'
}

function normalizeOwnership(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return DEFAULT_OWNERSHIP
  if (OWNERSHIP_OPTIONS.includes(normalized as any)) return normalized
  return normalized
}

function normalizeCycleKey(value?: string) {
  const candidate = (value ?? '').trim()
  if (!candidate) return null
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : null
}

function buildDefaultCycleKeys(now: Date) {
  const keys: string[] = []
  for (let offset = -3; offset <= 9; offset += 1) {
    keys.push(cycleKeyFromDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))))
  }
  return keys
}

function cycleKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthOffsetTimestamp(startMs: number, months: number) {
  const date = new Date(startMs)
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    Math.min(date.getUTCDate(), 28),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    0,
  )
}

async function findDashboardPreferencesDoc(db: any, userId: string) {
  try {
    const docs = await db.query('dashboardPreferences').collect()
    const ownerKey = `clerk:${userId}`
    return (Array.isArray(docs) ? docs : []).find((row: any) => row?.ownerKey === ownerKey) ?? null
  } catch {
    return null
  }
}

async function collectUserDocs(db: any, table: string, userId: string): Promise<any[]> {
  return await sharedCollectUserDocs(db, table, userId)
}

async function findUserDoc(db: any, table: string, userId: string): Promise<any | null> {
  const docs = await collectUserDocs(db, table, userId)
  if (docs.length === 0) return null
  return docs.slice().sort(sortByUpdatedDesc)[0] ?? null
}

async function safeCollectDocs(db: any, table: string): Promise<any[]> {
  return await sharedSafeCollectDocs(db, table)
}

async function getOwnedDocOrThrow(db: any, table: string, id: string, userId: string) {
  return await sharedAssertOwnedDocOrThrow(db, table, id, userId)
}

async function viewerUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  return await sharedViewerUserId(ctx)
}

async function recordFinanceAuditEventSafe(
  db: any,
  {
    action,
    entityId,
    entityType,
    userId,
    beforeJson,
    afterJson,
    metadataJson,
  }: {
    action: string
    entityId: string
    entityType: string
    userId: string
    beforeJson?: string
    afterJson?: string
    metadataJson?: string
  },
) {
  await sharedAuditWriteSafe(db, {
    action,
    entityId,
    entityType,
    userId,
    beforeJson,
    afterJson,
    metadataJson,
  })
}

function safeParseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isRecord(value) ? value : null
}

function stringifyJsonObject(value: Record<string, unknown>) {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}

function requiredString(value: unknown, label: string) {
  const parsed = optionalString(value)
  if (!parsed) throw new Error(`${label} is required`)
  return parsed
}

function optionalString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function numberOr(value: unknown, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCurrencyCode(value?: string) {
  const candidate = (value ?? DEFAULT_DISPLAY_CURRENCY).trim().toUpperCase()
  return candidate || DEFAULT_DISPLAY_CURRENCY
}

function sanitizeLocale(locale?: string) {
  const candidate = (locale ?? DEFAULT_LOCALE).trim()
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}
