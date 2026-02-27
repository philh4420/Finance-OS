/* eslint-disable @typescript-eslint/no-explicit-any */
import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { v } from 'convex/values'
import {
  cycleKeyFromTimestampInTimeZone,
  nextDueAtFromDayInTimeZone,
  nextMonthlyRunAtInTimeZone,
  normalizeTimeZone,
} from './_shared/timezone'
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
const PHASE_FOUR_OWNERSHIP_OPTIONS = ['personal', 'shared', 'business', 'household'] as const

const RULE_TABLE_BY_TYPE = {
  transaction: 'transactionRules',
  income_allocation: 'incomeAllocationRules',
} as const

type PhaseFourSuggestionDecision = 'accept' | 'dismiss' | 'snooze'
type PhaseFourAlertSeverity = 'low' | 'medium' | 'high'
type PhaseFourAlertStatus = 'open' | 'snoozed' | 'resolved'

type PhaseFourSweepOptions = {
  mode: string
  respectMonthlyAutomationGate: boolean
}

export const getPhaseFourAutomationWorkspace = query({
  args: {
    displayCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await viewerUserId(ctx)
    const financeDb = ctx.db as any
    if (!userId) {
      return {
        viewerAuthenticated: false,
        viewerUserId: null,
        displayCurrency: DEFAULT_DISPLAY_CURRENCY,
        locale: DEFAULT_LOCALE,
        timezone: 'UTC',
        preferences: buildEmptyPhaseFourPreferences(),
        stats: {
          transactionRuleCount: 0,
          incomeAllocationRuleCount: 0,
          openSuggestionCount: 0,
          openAlertCount: 0,
          lastCycleRunAt: null,
          lastCycleRunStatus: null,
          nextMonthlyRunHint: null,
        },
        options: {
          categories: [] as string[],
          ownershipOptions: Array.from(PHASE_FOUR_OWNERSHIP_OPTIONS),
          incomeSources: [] as string[],
          accountOptions: [] as Array<{ id: string; name: string; type: string }>,
          billOptions: [] as Array<{ id: string; name: string; amount: number; isSubscription: boolean }>,
          transactionRuleMatchFields: ['merchant', 'category', 'note', 'account'],
          matchModes: ['contains', 'equals', 'starts_with', 'ends_with', 'regex'],
          transactionTypes: ['all', 'expense', 'income', 'transfer'],
          cycleKeys: [] as string[],
        },
        transactionRules: [] as any[],
        incomeAllocationRules: [] as any[],
        incomeAllocationSuggestions: [] as any[],
        subscriptionPriceChanges: [] as any[],
        cycleAlerts: [] as any[],
      }
    }

    const [prefDoc, dashboardPrefDoc, transactionRules, incomeRules, incomeSuggestions, subscriptionPriceChanges, cycleAlerts, incomes, bills, accounts, cards, loans, monthlyCycleRuns] =
      await Promise.all([
        findUserDoc(financeDb, 'financePreferences', userId),
        findDashboardPreferencesDoc(ctx.db as any, userId),
        collectUserDocs(financeDb, 'transactionRules', userId),
        collectUserDocs(financeDb, 'incomeAllocationRules', userId),
        collectUserDocs(financeDb, 'incomeAllocationSuggestions', userId),
        collectUserDocs(financeDb, 'subscriptionPriceChanges', userId),
        collectUserDocs(financeDb, 'cycleStepAlerts', userId),
        collectUserDocs(financeDb, 'incomes', userId),
        collectUserDocs(financeDb, 'bills', userId),
        collectUserDocs(financeDb, 'accounts', userId),
        collectUserDocs(financeDb, 'cards', userId),
        collectUserDocs(financeDb, 'loans', userId),
        collectUserDocs(financeDb, 'monthlyCycleRuns', userId),
      ])

    const displayCurrency = normalizeCurrencyCode(
      args.displayCurrency ??
        optionalString((dashboardPrefDoc as any)?.displayCurrency) ??
        optionalString((prefDoc as any)?.currency) ??
        DEFAULT_DISPLAY_CURRENCY,
    )
    const locale = sanitizeLocale(
      args.locale ??
        optionalString((dashboardPrefDoc as any)?.locale) ??
        optionalString((prefDoc as any)?.locale) ??
        DEFAULT_LOCALE,
    )
    const timezone = normalizeTimeZone(optionalString((prefDoc as any)?.timezone) ?? 'UTC')

    const preferences = normalizePhaseFourPreferences(prefDoc)

    const accountOptions = [
      ...accounts.map((row: any) => ({ id: String(row._id), name: String(row.name ?? 'Account'), type: String(row.type ?? 'account') })),
      ...cards.map((row: any) => ({ id: String(row._id), name: String(row.name ?? 'Card'), type: 'card' })),
      ...loans.map((row: any) => ({ id: String(row._id), name: String(row.name ?? 'Loan'), type: 'loan' })),
    ].sort((a, b) => a.name.localeCompare(b.name))

    const categories = Array.from(
      new Set(
        bills
          .map((row: any) => optionalString(row.category))
          .filter(Boolean) as string[],
      ),
    ).sort((a, b) => a.localeCompare(b))

    const incomeSources = Array.from(
      new Set(
        incomes
          .map((row: any) => optionalString(row.source))
          .filter(Boolean) as string[],
      ),
    ).sort((a, b) => a.localeCompare(b))

    const billOptions = bills
      .map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? 'Bill'),
        amount: numberOr(row.amount),
        isSubscription: Boolean(row.isSubscription),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const mappedTransactionRules = transactionRules
      .slice()
      .sort(sortByUpdatedDesc)
      .map((row: any) => normalizePhaseFourTransactionRule(row))

    const mappedIncomeRules = incomeRules
      .slice()
      .sort(sortByUpdatedDesc)
      .map((row: any) => normalizePhaseFourIncomeAllocationRule(row))

    const mappedIncomeSuggestions = incomeSuggestions
      .slice()
      .sort(sortSuggestions)
      .map((row: any) => normalizePhaseFourIncomeAllocationSuggestion(row))

    const mappedSubscriptionChanges = subscriptionPriceChanges
      .slice()
      .sort(sortSuggestions)
      .map((row: any) => normalizePhaseFourSubscriptionPriceChange(row, displayCurrency))

    const mappedCycleAlerts = cycleAlerts
      .slice()
      .sort(sortAlerts)
      .map((row: any) => normalizePhaseFourCycleAlert(row))

    const openSuggestionCount =
      mappedIncomeSuggestions.filter((row) => row.status === 'open').length +
      mappedSubscriptionChanges.filter((row) => row.status === 'open').length
    const openAlertCount = mappedCycleAlerts.filter((row) => row.status === 'open').length

    const latestCycleRun = monthlyCycleRuns.slice().sort(sortByUpdatedDesc)[0] ?? null
    const nextMonthlyRunHint = buildMonthlyRunHint(preferences)

    return {
      viewerAuthenticated: true,
      viewerUserId: userId,
      displayCurrency,
      locale,
      timezone,
      preferences,
      stats: {
        transactionRuleCount: mappedTransactionRules.length,
        incomeAllocationRuleCount: mappedIncomeRules.length,
        openSuggestionCount,
        openAlertCount,
        lastCycleRunAt: latestCycleRun ? Math.trunc(numberOr((latestCycleRun as any).ranAt ?? latestCycleRun._creationTime)) : null,
        lastCycleRunStatus: latestCycleRun ? optionalString((latestCycleRun as any).status) ?? 'unknown' : null,
        nextMonthlyRunHint,
      },
      options: {
        categories,
        ownershipOptions: Array.from(PHASE_FOUR_OWNERSHIP_OPTIONS),
        incomeSources,
        accountOptions,
        billOptions,
        transactionRuleMatchFields: ['merchant', 'category', 'note', 'account'],
        matchModes: ['contains', 'equals', 'starts_with', 'ends_with', 'regex'],
        transactionTypes: ['all', 'expense', 'income', 'transfer'],
        cycleKeys: Array.from(
          new Set(
            monthlyCycleRuns
              .map((row: any) => optionalString(row.cycleKey))
              .filter(Boolean) as string[],
          ),
        )
          .sort()
          .reverse(),
      },
      transactionRules: mappedTransactionRules,
      incomeAllocationRules: mappedIncomeRules,
      incomeAllocationSuggestions: mappedIncomeSuggestions,
      subscriptionPriceChanges: mappedSubscriptionChanges,
      cycleAlerts: mappedCycleAlerts,
    }
  },
})

export const upsertPhaseFourRule = mutation({
  args: {
    ruleType: v.union(v.literal('transaction'), v.literal('income_allocation')),
    id: v.optional(v.string()),
    name: v.string(),
    enabled: v.optional(v.boolean()),
    priority: v.optional(v.number()),
    note: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const table = RULE_TABLE_BY_TYPE[args.ruleType]
    const enabled = args.enabled ?? true
    const priority = clampPriority(args.priority)
    const payload = safeParseJsonObject(args.payloadJson) ?? {}
    const payloadJson = JSON.stringify(payload)

    const basePatch = compactObject({
      userId,
      name: requiredString(args.name, 'Rule name'),
      enabled,
      status: enabled ? 'active' : 'disabled',
      priority,
      note: optionalString(args.note),
      payloadJson,
      updatedAt: now,
      ruleType: args.ruleType,
    })

    let id = ''
    let mode: 'created' | 'updated' = 'created'
    let before: any = null

    if (args.id) {
      const existing = await getOwnedDocOrThrow(financeDb, table, args.id, userId)
      before = existing
      await financeDb.patch(existing._id, basePatch)
      id = String(existing._id)
      mode = 'updated'
    } else {
      id = String(
        await financeDb.insert(table, {
          ...basePatch,
          createdAt: now,
          lastMatchedAt: null,
          lastAppliedAt: null,
          source: 'phase4_rules_ui',
        }),
      )
    }

    await recordFinanceAuditEventSafe(financeDb, {
      action: mode === 'created' ? 'phase4_rule_create' : 'phase4_rule_update',
      entityId: id,
      entityType: args.ruleType === 'transaction' ? 'transaction_rule' : 'income_allocation_rule',
      userId,
      beforeJson: before ? JSON.stringify(before) : undefined,
      afterJson: JSON.stringify({ ...basePatch, id }),
      metadataJson: JSON.stringify({ source: 'phase4_rules_automation_tab', recordedAt: now }),
    })

    return { ok: true, id, mode, ruleType: args.ruleType }
  },
})

export const deletePhaseFourRule = mutation({
  args: {
    ruleType: v.union(v.literal('transaction'), v.literal('income_allocation')),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const financeDb = ctx.db as any
    const table = RULE_TABLE_BY_TYPE[args.ruleType]
    const existing = await getOwnedDocOrThrow(financeDb, table, args.id, userId)
    await financeDb.delete(existing._id)

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_rule_delete',
      entityId: args.id,
      entityType: args.ruleType === 'transaction' ? 'transaction_rule' : 'income_allocation_rule',
      userId,
      beforeJson: JSON.stringify(existing),
      metadataJson: JSON.stringify({ source: 'phase4_rules_automation_tab', recordedAt: Date.now() }),
    })

    return { ok: true, id: args.id, ruleType: args.ruleType }
  },
})

export const updatePhaseFourAutomationPreferences = mutation({
  args: {
    monthlyAutomationEnabled: v.optional(v.boolean()),
    monthlyAutomationRunDay: v.optional(v.number()),
    monthlyAutomationRunHour: v.optional(v.number()),
    monthlyAutomationRunMinute: v.optional(v.number()),
    monthlyAutomationMaxRetries: v.optional(v.number()),
    monthlyAutomationRetryStrategy: v.optional(v.string()),
    monthlyCycleAlertsEnabled: v.optional(v.boolean()),
    dueRemindersEnabled: v.optional(v.boolean()),
    dueReminderDays: v.optional(v.number()),
    reconciliationRemindersEnabled: v.optional(v.boolean()),
    goalAlertsEnabled: v.optional(v.boolean()),
    alertEscalationFailedStepsThreshold: v.optional(v.number()),
    alertEscalationFailureStreakThreshold: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const ownerKey = `clerk:${userId}`
    const [existing, dashboardPreferences] = await Promise.all([
      findUserDoc(financeDb, 'financePreferences', userId),
      financeDb
        .query('dashboardPreferences')
        .withIndex('by_owner', (q: any) => q.eq('ownerKey', ownerKey))
        .unique(),
    ])
    const inferredCurrency = normalizeCurrencyCode(
      optionalString(existing?.currency) ??
        optionalString((dashboardPreferences as any)?.displayCurrency) ??
        DEFAULT_DISPLAY_CURRENCY,
    )
    const inferredLocale = sanitizeLocale(
      optionalString(existing?.locale) ??
        optionalString((dashboardPreferences as any)?.locale) ??
        DEFAULT_LOCALE,
    )

    const patch = compactObject({
      userId,
      updatedAt: now,
      monthlyAutomationEnabled: args.monthlyAutomationEnabled,
      monthlyAutomationRunDay: clampDay(args.monthlyAutomationRunDay ?? existing?.monthlyAutomationRunDay ?? 1),
      monthlyAutomationRunHour: clampHour(args.monthlyAutomationRunHour ?? existing?.monthlyAutomationRunHour ?? 9),
      monthlyAutomationRunMinute: clampMinute(args.monthlyAutomationRunMinute ?? existing?.monthlyAutomationRunMinute ?? 0),
      monthlyAutomationMaxRetries: clampInt(args.monthlyAutomationMaxRetries ?? existing?.monthlyAutomationMaxRetries ?? 2, 0, 10),
      monthlyAutomationRetryStrategy: optionalString(args.monthlyAutomationRetryStrategy) ?? optionalString(existing?.monthlyAutomationRetryStrategy) ?? 'same_day_backoff',
      monthlyCycleAlertsEnabled: args.monthlyCycleAlertsEnabled,
      dueRemindersEnabled: args.dueRemindersEnabled,
      dueReminderDays: clampInt(args.dueReminderDays ?? existing?.dueReminderDays ?? 3, 0, 30),
      reconciliationRemindersEnabled: args.reconciliationRemindersEnabled,
      goalAlertsEnabled: args.goalAlertsEnabled,
      alertEscalationFailedStepsThreshold: clampInt(
        args.alertEscalationFailedStepsThreshold ?? existing?.alertEscalationFailedStepsThreshold ?? 1,
        1,
        10,
      ),
      alertEscalationFailureStreakThreshold: clampInt(
        args.alertEscalationFailureStreakThreshold ?? existing?.alertEscalationFailureStreakThreshold ?? 2,
        1,
        10,
      ),
      timezone: normalizeTimeZone(
        optionalString(args.timezone) ?? optionalString(existing?.timezone) ?? 'UTC',
      ),
      currency: inferredCurrency,
      locale: inferredLocale,
    })

    let prefId: string
    if (existing) {
      await financeDb.patch(existing._id, patch)
      prefId = String(existing._id)
    } else {
      prefId = String(await financeDb.insert('financePreferences', patch))
    }

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_automation_preferences_update',
      entityId: prefId,
      entityType: 'finance_preferences',
      userId,
      afterJson: JSON.stringify(patch),
      metadataJson: JSON.stringify({ source: 'phase4_rules_automation_tab', recordedAt: now }),
    })

    return {
      ok: true,
      preferences: normalizePhaseFourPreferences({ ...(existing ?? {}), ...patch }),
    }
  },
})

export const reviewPhaseFourSuggestion = mutation({
  args: {
    kind: v.union(v.literal('income_allocation'), v.literal('subscription_price')),
    id: v.string(),
    decision: v.union(v.literal('accept'), v.literal('dismiss'), v.literal('snooze')),
    applyEffects: v.optional(v.boolean()),
    snoozeDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const table = args.kind === 'income_allocation' ? 'incomeAllocationSuggestions' : 'subscriptionPriceChanges'
    const existing = await getOwnedDocOrThrow(financeDb, table, args.id, userId)
    const decision = normalizeSuggestionDecision(args.decision)
    const status =
      decision === 'accept' ? 'accepted' : decision === 'dismiss' ? 'dismissed' : 'snoozed'

    const patch: Record<string, unknown> = {
      status,
      reviewedAt: now,
      updatedAt: now,
      decision,
      reviewerUserId: userId,
    }
    if (decision === 'snooze') {
      patch.snoozeUntil = now + clampInt(args.snoozeDays ?? 7, 1, 90) * 24 * 60 * 60 * 1000
    }

    let sideEffect: Record<string, unknown> | null = null
    if (decision === 'accept' && args.applyEffects !== false) {
      if (args.kind === 'income_allocation') {
        sideEffect = await applyAcceptedIncomeAllocationSuggestion(financeDb, userId, existing, now)
      } else {
        sideEffect = await applyAcceptedSubscriptionPriceSuggestion(financeDb, userId, existing, now)
      }
    }

    await financeDb.patch(existing._id, patch)

    await recordFinanceAuditEventSafe(financeDb, {
      action: `phase4_suggestion_${decision}`,
      entityId: args.id,
      entityType: args.kind === 'income_allocation' ? 'income_allocation_suggestion' : 'subscription_price_change',
      userId,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify({ ...existing, ...patch }),
      metadataJson: JSON.stringify({ source: 'phase4_rules_automation_tab', sideEffect, recordedAt: now }),
    })

    return {
      ok: true,
      id: args.id,
      kind: args.kind,
      status,
      sideEffect,
    }
  },
})

export const runPhaseFourAutomationSweep = mutation({
  args: {
    mode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const financeDb = ctx.db as any
    const result = await phaseFourRunAutomationSweepForUser(financeDb, userId, {
      mode: optionalString(args.mode) ?? 'manual',
      respectMonthlyAutomationGate: false,
    })
    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_automation_sweep_run',
      entityId: userId,
      entityType: 'automation_sweep',
      userId,
      afterJson: JSON.stringify(result),
      metadataJson: JSON.stringify({
        source: 'phase4_rules_automation_tab',
        requestedMode: optionalString(args.mode) ?? 'manual',
        recordedAt: Date.now(),
      }),
    })
    return result
  },
})

export const phaseFourScheduledSweep = internalMutation({
  args: {
    mode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const financeDb = ctx.db as any
    const mode = optionalString(args.mode) ?? 'hourly'
    const userIds = await collectPhaseFourUserIds(financeDb)
    const results: Array<{ userId: string; skipped: boolean; alertsCreated: number; suggestionsCreated: number }> = []

    for (const userId of userIds) {
      const result = await phaseFourRunAutomationSweepForUser(financeDb, userId, {
        mode,
        respectMonthlyAutomationGate: true,
      })
      results.push({
        userId,
        skipped: Boolean((result as any).skipped),
        alertsCreated: Math.trunc(numberOr((result as any).alertsCreated)),
        suggestionsCreated:
          Math.trunc(numberOr((result as any).incomeSuggestionsCreated)) +
          Math.trunc(numberOr((result as any).subscriptionSuggestionsCreated)),
      })
    }

    return {
      ok: true,
      mode,
      userCount: userIds.length,
      processedCount: results.filter((row) => !row.skipped).length,
      skippedCount: results.filter((row) => row.skipped).length,
      totalAlertsCreated: results.reduce((sum, row) => sum + row.alertsCreated, 0),
      totalSuggestionsCreated: results.reduce((sum, row) => sum + row.suggestionsCreated, 0),
      results,
    }
  },
})

export const phaseFourScheduledSweepRunner = internalAction({
  args: {
    mode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const mode = optionalString(args.mode) ?? 'hourly'
    await ctx.runMutation((internal as any).automation.phaseFourScheduledSweep, { mode })
    return null
  },
})

async function phaseFourRunAutomationSweepForUser(
  financeDb: any,
  userId: string,
  options: PhaseFourSweepOptions,
) {
  const now = Date.now()
  const [prefDoc, incomes, bills, cards, loans, monthlyCycleRuns, incomeRules, incomeSuggestions, subscriptionChanges, cycleAlerts] =
    await Promise.all([
      findUserDoc(financeDb, 'financePreferences', userId),
      collectUserDocs(financeDb, 'incomes', userId),
      collectUserDocs(financeDb, 'bills', userId),
      collectUserDocs(financeDb, 'cards', userId),
      collectUserDocs(financeDb, 'loans', userId),
      collectUserDocs(financeDb, 'monthlyCycleRuns', userId),
      collectUserDocs(financeDb, 'incomeAllocationRules', userId),
      collectUserDocs(financeDb, 'incomeAllocationSuggestions', userId),
      collectUserDocs(financeDb, 'subscriptionPriceChanges', userId),
      collectUserDocs(financeDb, 'cycleStepAlerts', userId),
    ])

  const prefs = normalizePhaseFourPreferences(prefDoc)
  if (options.respectMonthlyAutomationGate && !prefs.monthlyAutomationEnabled && options.mode === 'monthly') {
    return {
      ok: true,
      userId,
      skipped: true,
      reason: 'monthly_automation_disabled',
      alertsCreated: 0,
      alertsUpdated: 0,
      alertsResolved: 0,
      incomeSuggestionsCreated: 0,
      subscriptionSuggestionsCreated: 0,
    }
  }

  const existingIncomeRules = incomeRules.map(normalizePhaseFourIncomeAllocationRule)
  const openIncomeSuggestionFingerprints = new Set(
    incomeSuggestions
      .filter((row: any) => normalizeSuggestionStatus(optionalString(row.status)) === 'open')
      .map((row: any) => optionalString(row.fingerprint))
      .filter(Boolean) as string[],
  )

  let incomeSuggestionsCreated = 0
  for (const income of incomes) {
    const incomeSource = optionalString((income as any).source) ?? 'Income source'
    const incomeId = String((income as any)._id)
    const amount = Math.max(0, numberOr((income as any).amount))
    if (amount <= 0) continue

    const coveredByRule = existingIncomeRules.some((rule) =>
      rule.enabled && phaseFourIncomeRuleMatchesSource(rule, incomeSource),
    )
    if (coveredByRule) continue

    const fingerprint = `income-allocation:${incomeId}`
    if (openIncomeSuggestionFingerprints.has(fingerprint)) continue

    const suggestedAllocations = buildDefaultIncomeAllocations({
      incomeAmount: amount,
      monthlyBillsTotal: bills.reduce((sum, bill) => sum + Math.max(0, numberOr((bill as any).amount)), 0),
      destinationAccountId: optionalString((income as any).destinationAccountId),
    })

    const suggestionId = String(
      await financeDb.insert(
        'incomeAllocationSuggestions',
        compactObject({
          userId,
          status: 'open',
          fingerprint,
          title: `Create allocation rule for ${incomeSource}`,
          summary: 'No income allocation rule exists for this income source.',
          reason: 'uncovered_income_source',
          incomeId,
          incomeSource,
          amount,
          createdAt: now,
          updatedAt: now,
          source: `phase4_sweep:${options.mode}`,
          payloadJson: JSON.stringify({
            incomeId,
            incomeSource,
            amount,
            matchMode: 'contains',
            incomeSourcePattern: incomeSource,
            allocations: suggestedAllocations,
          }),
        }),
      ),
    )
    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_income_allocation_suggestion_create',
      entityId: suggestionId,
      entityType: 'income_allocation_suggestion',
      userId,
      afterJson: JSON.stringify({
        suggestionId,
        incomeId,
        incomeSource,
        amount,
        fingerprint,
        status: 'open',
      }),
      metadataJson: JSON.stringify({
        source: `phase4_sweep:${options.mode}`,
        recordedAt: now,
      }),
    })
    openIncomeSuggestionFingerprints.add(fingerprint)
    incomeSuggestionsCreated += 1
  }

  const normalizedSubscriptionRows = subscriptionChanges
    .slice()
    .sort(sortByUpdatedDesc)
    .map((row: any) => ({
      row,
      billId: optionalString(row.billId),
      latestAmount: numberOr(row.latestAmount),
      fingerprint: optionalString(row.fingerprint),
      status: normalizeSuggestionStatus(optionalString(row.status)),
    }))

  const openSubscriptionFingerprints = new Set(
    normalizedSubscriptionRows
      .filter((row) => row.status === 'open')
      .map((row) => row.fingerprint)
      .filter(Boolean) as string[],
  )

  let subscriptionSuggestionsCreated = 0
  for (const bill of bills) {
    const isSubscription =
      Boolean((bill as any).isSubscription) ||
      (optionalString((bill as any).category) ?? '').toLowerCase().includes('subscription')
    if (!isSubscription) continue

    const billId = String((bill as any)._id)
    const billName = optionalString((bill as any).name) ?? 'Subscription'
    const latestAmount = Math.max(0, numberOr((bill as any).amount))
    const sameBillRows = normalizedSubscriptionRows.filter((row) => row.billId === billId)
    const latestKnown = sameBillRows[0] ?? null

    if (!latestKnown) {
      const fingerprint = `subscription:${billId}:baseline:${latestAmount.toFixed(2)}`
      if (openSubscriptionFingerprints.has(fingerprint)) continue
      const suggestionId = String(
        await financeDb.insert(
          'subscriptionPriceChanges',
          compactObject({
            userId,
            status: 'open',
            fingerprint,
            billId,
            billName,
            latestAmount,
            currency: optionalString((prefDoc as any)?.currency) ?? DEFAULT_DISPLAY_CURRENCY,
            changeType: 'baseline',
            title: `Start price monitoring for ${billName}`,
            summary: 'Baseline subscription amount captured. Confirm to begin change tracking.',
            reason: 'baseline_subscription_monitoring',
            createdAt: now,
            updatedAt: now,
            source: `phase4_sweep:${options.mode}`,
            payloadJson: JSON.stringify({ billId, billName, latestAmount, changeType: 'baseline' }),
          }),
        ),
      )
      await recordFinanceAuditEventSafe(financeDb, {
        action: 'phase4_subscription_price_suggestion_create',
        entityId: suggestionId,
        entityType: 'subscription_price_change',
        userId,
        afterJson: JSON.stringify({
          suggestionId,
          billId,
          billName,
          latestAmount,
          fingerprint,
          changeType: 'baseline',
          status: 'open',
        }),
        metadataJson: JSON.stringify({
          source: `phase4_sweep:${options.mode}`,
          recordedAt: now,
        }),
      })
      openSubscriptionFingerprints.add(fingerprint)
      subscriptionSuggestionsCreated += 1
      continue
    }

    if (Math.abs(latestKnown.latestAmount - latestAmount) < 0.005) continue
    const fingerprint = `subscription:${billId}:change:${latestAmount.toFixed(2)}`
    if (openSubscriptionFingerprints.has(fingerprint)) continue

    const suggestionId = String(
      await financeDb.insert(
        'subscriptionPriceChanges',
        compactObject({
          userId,
          status: 'open',
          fingerprint,
          billId,
          billName,
          previousAmount: latestKnown.latestAmount,
          latestAmount,
          deltaAmount: latestAmount - latestKnown.latestAmount,
          deltaPct:
            latestKnown.latestAmount > 0
              ? ((latestAmount - latestKnown.latestAmount) / latestKnown.latestAmount) * 100
              : null,
          currency: optionalString((prefDoc as any)?.currency) ?? DEFAULT_DISPLAY_CURRENCY,
          changeType: 'change',
          title: `${billName} amount changed`,
          summary: `Detected a subscription amount change from ${latestKnown.latestAmount.toFixed(2)} to ${latestAmount.toFixed(2)}.`,
          reason: 'subscription_amount_changed',
          createdAt: now,
          updatedAt: now,
          source: `phase4_sweep:${options.mode}`,
          payloadJson: JSON.stringify({
            billId,
            billName,
            previousAmount: latestKnown.latestAmount,
            latestAmount,
            deltaAmount: latestAmount - latestKnown.latestAmount,
            deltaPct:
              latestKnown.latestAmount > 0
                ? ((latestAmount - latestKnown.latestAmount) / latestKnown.latestAmount) * 100
                : null,
            changeType: 'change',
          }),
        }),
      ),
    )
    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_subscription_price_suggestion_create',
      entityId: suggestionId,
      entityType: 'subscription_price_change',
      userId,
      afterJson: JSON.stringify({
        suggestionId,
        billId,
        billName,
        previousAmount: latestKnown.latestAmount,
        latestAmount,
        fingerprint,
        changeType: 'change',
        status: 'open',
      }),
      metadataJson: JSON.stringify({
        source: `phase4_sweep:${options.mode}`,
        recordedAt: now,
      }),
    })
    openSubscriptionFingerprints.add(fingerprint)
    subscriptionSuggestionsCreated += 1
  }

  const alertDesired = buildPhaseFourDesiredAlerts({
    userId,
    now,
    prefs,
    bills,
    cards,
    loans,
    monthlyCycleRuns,
    mode: options.mode,
  })

  const openGeneratedAlerts = cycleAlerts.filter((row: any) => {
    const source = optionalString(row.source) ?? ''
    const status = normalizeAlertStatus(optionalString(row.status))
    return status !== 'resolved' && source.startsWith('phase4_sweep:')
  })

  const byFingerprint = new Map<string, any>()
  for (const row of openGeneratedAlerts) {
    const fingerprint = optionalString((row as any).fingerprint)
    if (fingerprint) byFingerprint.set(fingerprint, row)
  }

  let alertsCreated = 0
  let alertsUpdated = 0
  const desiredFingerprints = new Set<string>()
  for (const alert of alertDesired) {
    const alertFingerprint = optionalString((alert as any).fingerprint)
    if (!alertFingerprint) continue
    desiredFingerprints.add(alertFingerprint)
    const existing = byFingerprint.get(alertFingerprint)
    if (existing) {
      const before = JSON.stringify(existing)
      await financeDb.patch(existing._id, {
        ...compactObject(alert),
        updatedAt: now,
        status: 'open',
      })
      await recordFinanceAuditEventSafe(financeDb, {
        action: 'phase4_cycle_alert_update',
        entityId: String(existing._id),
        entityType: 'cycle_step_alert',
        userId,
        beforeJson: before,
        afterJson: JSON.stringify({
          ...existing,
          ...compactObject(alert),
          updatedAt: now,
          status: 'open',
        }),
        metadataJson: JSON.stringify({
          source: `phase4_sweep:${options.mode}`,
          recordedAt: now,
        }),
      })
      alertsUpdated += 1
      continue
    }

    const createdAlertId = String(
      await financeDb.insert('cycleStepAlerts', {
        ...compactObject(alert),
        userId,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        source: `phase4_sweep:${options.mode}`,
      }),
    )
    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_cycle_alert_create',
      entityId: createdAlertId,
      entityType: 'cycle_step_alert',
      userId,
      afterJson: JSON.stringify({
        ...compactObject(alert),
        id: createdAlertId,
        status: 'open',
      }),
      metadataJson: JSON.stringify({
        source: `phase4_sweep:${options.mode}`,
        recordedAt: now,
      }),
    })
    alertsCreated += 1
  }

  let alertsResolved = 0
  for (const row of openGeneratedAlerts) {
    const fingerprint = optionalString((row as any).fingerprint)
    if (!fingerprint || desiredFingerprints.has(fingerprint)) continue
    const before = JSON.stringify(row)
    await financeDb.patch(row._id, {
      status: 'resolved',
      resolvedAt: now,
      updatedAt: now,
    })
    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_cycle_alert_resolve',
      entityId: String((row as any)._id),
      entityType: 'cycle_step_alert',
      userId,
      beforeJson: before,
      afterJson: JSON.stringify({
        ...(row as any),
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
      }),
      metadataJson: JSON.stringify({
        source: `phase4_sweep:${options.mode}`,
        recordedAt: now,
      }),
    })
    alertsResolved += 1
  }

  return {
    ok: true,
    userId,
    skipped: false,
    mode: options.mode,
    alertsCreated,
    alertsUpdated,
    alertsResolved,
    incomeSuggestionsCreated,
    subscriptionSuggestionsCreated,
  }
}

function buildPhaseFourDesiredAlerts({
  userId,
  now,
  prefs,
  bills,
  cards,
  loans,
  monthlyCycleRuns,
  mode,
}: {
  userId: string
  now: number
  prefs: ReturnType<typeof normalizePhaseFourPreferences>
  bills: any[]
  cards: any[]
  loans: any[]
  monthlyCycleRuns: any[]
  mode: string
}) {
  const alerts: Array<Record<string, unknown>> = []
  const timezone = normalizeTimeZone(prefs.timezone)

  if (prefs.dueRemindersEnabled) {
    for (const bill of bills) {
      const dueDay = clampDay(numberOr((bill as any).dueDay, 1))
      const dueAt = nextDueAtFromDayInTimeZone(now, dueDay, timezone, 9, 0)
      const daysUntil = Math.ceil((dueAt - now) / (24 * 60 * 60 * 1000))
      if (daysUntil < 0 || daysUntil > prefs.dueReminderDays) continue
      const billName = optionalString((bill as any).name) ?? 'Bill'
      const amount = Math.max(0, numberOr((bill as any).amount))
      const severity: PhaseFourAlertSeverity = daysUntil <= 1 ? 'high' : 'medium'
      alerts.push({
        fingerprint: `bill-due:${String((bill as any)._id)}:${dueDay}`,
        title: `${billName} due ${daysUntil === 0 ? 'today' : `in ${daysUntil}d`}`,
        detail: `Bill reminder for ${billName}${amount ? ` (${amount.toFixed(2)} local amount)` : ''}.`,
        severity,
        entityType: 'bill',
        entityId: String((bill as any)._id),
        dueAt,
        cycleKey: cycleKeyFromTimestampInTimeZone(dueAt, timezone),
        actionLabel: 'Review bill',
        actionHref: '/?view=bills',
        userId,
        sourceMode: mode,
      })
    }

    for (const loan of loans) {
      const dueDay = clampDay(numberOr((loan as any).dueDay, 1))
      const dueAt = nextDueAtFromDayInTimeZone(now, dueDay, timezone, 9, 0)
      const daysUntil = Math.ceil((dueAt - now) / (24 * 60 * 60 * 1000))
      if (daysUntil < 0 || daysUntil > prefs.dueReminderDays) continue
      const loanName = optionalString((loan as any).name) ?? 'Loan'
      const minPayment = Math.max(0, numberOr((loan as any).minimumPayment))
      alerts.push({
        fingerprint: `loan-due:${String((loan as any)._id)}:${dueDay}`,
        title: `${loanName} payment due ${daysUntil === 0 ? 'today' : `in ${daysUntil}d`}`,
        detail: `Minimum payment ${minPayment.toFixed(2)} due soon.`,
        severity: daysUntil <= 1 ? 'high' : 'medium',
        entityType: 'loan',
        entityId: String((loan as any)._id),
        dueAt,
        cycleKey: cycleKeyFromTimestampInTimeZone(dueAt, timezone),
        actionLabel: 'Review loan',
        actionHref: '/?view=loans',
        userId,
        sourceMode: mode,
      })
    }
  }

  if (prefs.monthlyCycleAlertsEnabled) {
    for (const card of cards) {
      const creditLimit = Math.max(0, numberOr((card as any).creditLimit))
      const usedLimit = Math.max(0, numberOr((card as any).usedLimit))
      if (creditLimit <= 0) continue
      const utilization = usedLimit / creditLimit
      if (utilization < 0.85) continue
      alerts.push({
        fingerprint: `card-utilization:${String((card as any)._id)}:${Math.round(utilization * 100)}`,
        title: `${optionalString((card as any).name) ?? 'Card'} utilization at ${(utilization * 100).toFixed(0)}%`,
        detail: 'High utilization can increase repayment pressure and affect score stability.',
        severity: utilization >= 0.95 ? 'high' : 'medium',
        entityType: 'card',
        entityId: String((card as any)._id),
        dueAt: now,
        cycleKey: cycleKeyFromTimestampInTimeZone(now, timezone),
        actionLabel: 'Review cards',
        actionHref: '/?view=cards',
        userId,
        sourceMode: mode,
      })
    }
  }

  const latestCycleRun = monthlyCycleRuns.slice().sort(sortByUpdatedDesc)[0] ?? null
  const currentCycleKey = cycleKeyFromTimestampInTimeZone(now, timezone)
  const latestCycleKey = optionalString((latestCycleRun as any)?.cycleKey)
  const latestCycleStatus = optionalString((latestCycleRun as any)?.status) ?? 'unknown'
  const latestCycleRanAt = Math.trunc(numberOr((latestCycleRun as any)?.ranAt ?? (latestCycleRun as any)?._creationTime))

  if (prefs.monthlyAutomationEnabled) {
    const currentMonthRunComplete = monthlyCycleRuns.some((row: any) => {
      const cycleKey = optionalString(row.cycleKey)
      const status = (optionalString(row.status) ?? '').toLowerCase()
      return cycleKey === currentCycleKey && status === 'completed'
    })

    if (!currentMonthRunComplete) {
      alerts.push({
        fingerprint: `monthly-cycle-missing:${currentCycleKey}`,
        title: `Monthly cycle not completed for ${currentCycleKey}`,
        detail: 'Automation is enabled but no completed monthly cycle run was found for the current cycle.',
        severity: 'high',
        entityType: 'monthly_cycle',
        entityId: currentCycleKey,
        dueAt: nextMonthlyRunTimestamp(now, prefs),
        cycleKey: currentCycleKey,
        actionLabel: 'Review cycle',
        actionHref: '/?view=automation',
        userId,
        sourceMode: mode,
      })
    }
  }

  if (prefs.reconciliationRemindersEnabled && latestCycleRun) {
    const ageDays = latestCycleRanAt > 0 ? Math.floor((now - latestCycleRanAt) / (24 * 60 * 60 * 1000)) : 999
    if (ageDays >= 30) {
      alerts.push({
        fingerprint: `reconciliation-reminder:${currentCycleKey}:${ageDays}`,
        title: 'Reconciliation review overdue',
        detail: `Last cycle run (${latestCycleKey ?? 'unknown'}) is ${ageDays} days old (${latestCycleStatus}).`,
        severity: 'medium',
        entityType: 'reconciliation',
        entityId: latestCycleKey ?? 'unknown',
        dueAt: now,
        cycleKey: currentCycleKey,
        actionLabel: 'Review alerts',
        actionHref: '/?view=automation',
        userId,
        sourceMode: mode,
      })
    }
  }

  return alerts
}

async function applyAcceptedIncomeAllocationSuggestion(
  financeDb: any,
  userId: string,
  suggestionDoc: any,
  now: number,
) {
  const payload = safeParseJsonObject((suggestionDoc as any).payloadJson) ?? {}
  const allocations = Array.isArray((payload as any).allocations)
    ? ((payload as any).allocations as unknown[]).filter(isRecord)
    : []

  const rulePayload = {
    incomeSourcePattern:
      optionalString((payload as any).incomeSourcePattern) ??
      optionalString((suggestionDoc as any).incomeSource) ??
      'Income',
    matchMode: optionalString((payload as any).matchMode) ?? 'contains',
    allocations:
      allocations.length > 0
        ? allocations.map((row) => ({
            label: optionalString((row as any).label) ?? 'Allocation',
            percent: Number.isFinite(numberOr((row as any).percent, Number.NaN))
              ? numberOr((row as any).percent, Number.NaN)
              : undefined,
            fixedAmount: Number.isFinite(numberOr((row as any).fixedAmount, Number.NaN))
              ? numberOr((row as any).fixedAmount, Number.NaN)
              : undefined,
            category: optionalString((row as any).category),
            ownership: optionalString((row as any).ownership),
            destinationAccountId: optionalString((row as any).destinationAccountId),
            note: optionalString((row as any).note),
          }))
        : [{ label: 'General', percent: 100 }],
  }

  const ruleId = String(
    await financeDb.insert('incomeAllocationRules', {
      userId,
      name: `Auto rule · ${optionalString((suggestionDoc as any).incomeSource) ?? 'Income'}`,
      enabled: true,
      status: 'active',
      priority: 100,
      createdAt: now,
      updatedAt: now,
      source: 'phase4_suggestion_accept',
      sourceSuggestionId: String((suggestionDoc as any)._id),
      payloadJson: JSON.stringify(rulePayload),
      ruleType: 'income_allocation',
    }),
  )

  await recordFinanceAuditEventSafe(financeDb, {
    action: 'phase4_income_allocation_rule_created_from_suggestion',
    entityId: ruleId,
    entityType: 'income_allocation_rule',
    userId,
    afterJson: JSON.stringify(rulePayload),
    metadataJson: JSON.stringify({ sourceSuggestionId: String((suggestionDoc as any)._id), recordedAt: now }),
  })

  return { kind: 'income_rule_created', ruleId }
}

async function applyAcceptedSubscriptionPriceSuggestion(
  financeDb: any,
  userId: string,
  suggestionDoc: any,
  now: number,
) {
  const payload = safeParseJsonObject((suggestionDoc as any).payloadJson) ?? {}
  const billId =
    optionalString((payload as any).billId) ?? optionalString((suggestionDoc as any).billId)
  const latestAmount = numberOr(
    (payload as any).latestAmount ?? (suggestionDoc as any).latestAmount,
    Number.NaN,
  )

  if (!billId || !Number.isFinite(latestAmount)) {
    return { kind: 'subscription_acknowledged', updatedBill: false }
  }

  try {
    const bill = await getOwnedDocOrThrow(financeDb, 'bills', billId, userId)
    await financeDb.patch(bill._id, {
      amount: Math.max(0, latestAmount),
      updatedAt: now,
    })
    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase4_subscription_bill_amount_applied',
      entityId: billId,
      entityType: 'bill',
      userId,
      beforeJson: JSON.stringify(bill),
      afterJson: JSON.stringify({ ...bill, amount: Math.max(0, latestAmount) }),
      metadataJson: JSON.stringify({ sourceSuggestionId: String((suggestionDoc as any)._id), recordedAt: now }),
    })
    return { kind: 'subscription_bill_updated', billId, amount: Math.max(0, latestAmount) }
  } catch {
    return { kind: 'subscription_acknowledged', updatedBill: false, billId }
  }
}

function buildDefaultIncomeAllocations({
  incomeAmount,
  monthlyBillsTotal,
  destinationAccountId,
}: {
  incomeAmount: number
  monthlyBillsTotal: number
  destinationAccountId?: string
}) {
  const needsShare = Math.min(70, Math.max(20, Math.round((monthlyBillsTotal / Math.max(incomeAmount, 1)) * 100)))
  const bufferShare = Math.max(10, Math.round((100 - needsShare) * 0.4))
  const flexShare = Math.max(0, 100 - needsShare - bufferShare)

  return [
    {
      label: 'Bills & essentials',
      percent: needsShare,
      category: 'bills',
      ownership: 'shared',
      destinationAccountId,
    },
    {
      label: 'Buffer / savings',
      percent: bufferShare,
      category: 'savings',
      ownership: 'household',
      destinationAccountId,
    },
    {
      label: 'Flexible spend',
      percent: flexShare,
      category: 'personal',
      ownership: 'personal',
      destinationAccountId,
    },
  ].filter((row) => numberOr((row as any).percent) > 0)
}

function phaseFourIncomeRuleMatchesSource(
  rule: ReturnType<typeof normalizePhaseFourIncomeAllocationRule>,
  source: string,
) {
  const pattern = rule.incomeSourcePattern.trim().toLowerCase()
  const value = source.trim().toLowerCase()
  if (!pattern) return false
  switch (rule.matchMode) {
    case 'equals':
      return value === pattern
    case 'starts_with':
      return value.startsWith(pattern)
    case 'ends_with':
      return value.endsWith(pattern)
    case 'regex':
      try {
        return new RegExp(pattern, 'i').test(source)
      } catch {
        return false
      }
    default:
      return value.includes(pattern)
  }
}

function normalizePhaseFourTransactionRule(row: any) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  return {
    id: String(row._id),
    name: String(row.name ?? 'Transaction rule'),
    enabled: Boolean(row.enabled ?? true),
    status: optionalString(row.status) ?? (row.enabled === false ? 'disabled' : 'active'),
    priority: clampPriority(row.priority),
    note: optionalString(row.note) ?? '',
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
    lastMatchedAt: numberOr(row.lastMatchedAt, 0) || null,
    lastAppliedAt: numberOr(row.lastAppliedAt, 0) || null,
    matchField: optionalString((payload as any).matchField) ?? 'merchant',
    matchMode: normalizeMatchMode(optionalString((payload as any).matchMode)),
    matchValue: optionalString((payload as any).matchValue) ?? '',
    appliesToType: normalizeTransactionTypeFilter(optionalString((payload as any).appliesToType)),
    category: optionalString((payload as any).category) ?? '',
    ownership: normalizeOwnership(optionalString((payload as any).ownership) ?? 'shared'),
    linkedAccountId: optionalString((payload as any).linkedAccountId) ?? '',
    minAmount: Number.isFinite(numberOr((payload as any).minAmount, Number.NaN))
      ? numberOr((payload as any).minAmount, Number.NaN)
      : null,
    maxAmount: Number.isFinite(numberOr((payload as any).maxAmount, Number.NaN))
      ? numberOr((payload as any).maxAmount, Number.NaN)
      : null,
    payload,
  }
}

function normalizePhaseFourIncomeAllocationRule(row: any) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const rawAllocations = Array.isArray((payload as any).allocations)
    ? ((payload as any).allocations as unknown[])
    : []
  const allocations = rawAllocations.filter(isRecord).map((item, index) => ({
    id: String((item as any).id ?? `alloc-${index + 1}`),
    label: optionalString((item as any).label) ?? `Allocation ${index + 1}`,
    percent: Number.isFinite(numberOr((item as any).percent, Number.NaN))
      ? numberOr((item as any).percent, Number.NaN)
      : null,
    fixedAmount: Number.isFinite(numberOr((item as any).fixedAmount, Number.NaN))
      ? numberOr((item as any).fixedAmount, Number.NaN)
      : null,
    category: optionalString((item as any).category) ?? '',
    ownership: normalizeOwnership(optionalString((item as any).ownership) ?? 'shared'),
    destinationAccountId: optionalString((item as any).destinationAccountId) ?? '',
    note: optionalString((item as any).note) ?? '',
  }))

  return {
    id: String(row._id),
    name: String(row.name ?? 'Income allocation rule'),
    enabled: Boolean(row.enabled ?? true),
    status: optionalString(row.status) ?? (row.enabled === false ? 'disabled' : 'active'),
    priority: clampPriority(row.priority),
    note: optionalString(row.note) ?? '',
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
    lastMatchedAt: numberOr(row.lastMatchedAt, 0) || null,
    lastAppliedAt: numberOr(row.lastAppliedAt, 0) || null,
    incomeSourcePattern: optionalString((payload as any).incomeSourcePattern) ?? '',
    matchMode: normalizeMatchMode(optionalString((payload as any).matchMode)),
    allocations,
    payload,
  }
}

function normalizePhaseFourIncomeAllocationSuggestion(row: any) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const allocations = Array.isArray((payload as any).allocations)
    ? ((payload as any).allocations as unknown[])
        .filter(isRecord)
        .map((item, index) => ({
          id: String((item as any).id ?? `alloc-${index + 1}`),
          label: optionalString((item as any).label) ?? `Allocation ${index + 1}`,
          percent: Number.isFinite(numberOr((item as any).percent, Number.NaN))
            ? numberOr((item as any).percent, Number.NaN)
            : null,
          fixedAmount: Number.isFinite(numberOr((item as any).fixedAmount, Number.NaN))
            ? numberOr((item as any).fixedAmount, Number.NaN)
            : null,
          category: optionalString((item as any).category) ?? '',
          ownership: normalizeOwnership(optionalString((item as any).ownership) ?? 'shared'),
          destinationAccountId: optionalString((item as any).destinationAccountId) ?? '',
          note: optionalString((item as any).note) ?? '',
        }))
    : []

  return {
    id: String(row._id),
    status: normalizeSuggestionStatus(optionalString(row.status)),
    decision: normalizeSuggestionDecision(optionalString(row.decision)),
    title: optionalString(row.title) ?? 'Income allocation suggestion',
    summary: optionalString(row.summary) ?? '',
    reason: optionalString(row.reason) ?? '',
    incomeId: optionalString(row.incomeId) ?? optionalString((payload as any).incomeId) ?? '',
    incomeSource:
      optionalString(row.incomeSource) ?? optionalString((payload as any).incomeSource) ?? 'Income source',
    amount: numberOr(row.amount ?? (payload as any).amount),
    fingerprint: optionalString(row.fingerprint) ?? '',
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
    reviewedAt: numberOr(row.reviewedAt, 0) || null,
    snoozeUntil: numberOr(row.snoozeUntil, 0) || null,
    allocations,
  }
}

function normalizePhaseFourSubscriptionPriceChange(row: any, displayCurrency: string) {
  const payload = safeParseJsonObject(row.payloadJson) ?? {}
  const previousAmount = numberOr(row.previousAmount ?? (payload as any).previousAmount, Number.NaN)
  const latestAmount = numberOr(row.latestAmount ?? (payload as any).latestAmount, Number.NaN)
  const deltaAmount = numberOr(
    row.deltaAmount ?? (payload as any).deltaAmount,
    Number.isFinite(previousAmount) && Number.isFinite(latestAmount)
      ? latestAmount - previousAmount
      : 0,
  )
  const deltaPct = numberOr(
    row.deltaPct ?? (payload as any).deltaPct,
    Number.isFinite(previousAmount) && previousAmount > 0 && Number.isFinite(latestAmount)
      ? ((latestAmount - previousAmount) / previousAmount) * 100
      : Number.NaN,
  )

  return {
    id: String(row._id),
    status: normalizeSuggestionStatus(optionalString(row.status)),
    decision: normalizeSuggestionDecision(optionalString(row.decision)),
    title:
      optionalString(row.title) ??
      `${optionalString(row.billName) ?? optionalString((payload as any).billName) ?? 'Subscription'} price change`,
    summary: optionalString(row.summary) ?? '',
    reason: optionalString(row.reason) ?? '',
    fingerprint: optionalString(row.fingerprint) ?? '',
    billId: optionalString(row.billId) ?? optionalString((payload as any).billId) ?? '',
    billName: optionalString(row.billName) ?? optionalString((payload as any).billName) ?? 'Subscription',
    changeType: optionalString(row.changeType) ?? optionalString((payload as any).changeType) ?? 'change',
    previousAmount: Number.isFinite(previousAmount) ? previousAmount : null,
    latestAmount: Number.isFinite(latestAmount) ? latestAmount : 0,
    deltaAmount: Number.isFinite(deltaAmount) ? deltaAmount : 0,
    deltaPct: Number.isFinite(deltaPct) ? deltaPct : null,
    currency: normalizeCurrencyCode(optionalString(row.currency) ?? displayCurrency),
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
    reviewedAt: numberOr(row.reviewedAt, 0) || null,
    snoozeUntil: numberOr(row.snoozeUntil, 0) || null,
  }
}

function normalizePhaseFourCycleAlert(row: any) {
  return {
    id: String(row._id),
    status: normalizeAlertStatus(optionalString(row.status)),
    severity: normalizeAlertSeverity(optionalString(row.severity)),
    title: optionalString(row.title) ?? 'Cycle alert',
    detail: optionalString(row.detail) ?? '',
    fingerprint: optionalString(row.fingerprint) ?? '',
    cycleKey: optionalString(row.cycleKey) ?? '',
    entityType: optionalString(row.entityType) ?? '',
    entityId: optionalString(row.entityId) ?? '',
    dueAt: numberOr(row.dueAt, 0) || null,
    actionLabel: optionalString(row.actionLabel) ?? '',
    actionHref: optionalString(row.actionHref) ?? '',
    createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
    updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
    resolvedAt: numberOr(row.resolvedAt, 0) || null,
    snoozeUntil: numberOr(row.snoozeUntil, 0) || null,
  }
}

function buildEmptyPhaseFourPreferences() {
  return {
    monthlyAutomationEnabled: false,
    monthlyAutomationRunDay: 1,
    monthlyAutomationRunHour: 9,
    monthlyAutomationRunMinute: 0,
    monthlyAutomationMaxRetries: 2,
    monthlyAutomationRetryStrategy: 'same_day_backoff',
    monthlyCycleAlertsEnabled: true,
    dueRemindersEnabled: true,
    dueReminderDays: 3,
    reconciliationRemindersEnabled: true,
    goalAlertsEnabled: true,
    alertEscalationFailedStepsThreshold: 1,
    alertEscalationFailureStreakThreshold: 2,
    timezone: 'UTC',
  }
}

function normalizePhaseFourPreferences(doc: any) {
  return {
    monthlyAutomationEnabled: Boolean(doc?.monthlyAutomationEnabled),
    monthlyAutomationRunDay: clampDay(numberOr(doc?.monthlyAutomationRunDay, 1)),
    monthlyAutomationRunHour: clampHour(numberOr(doc?.monthlyAutomationRunHour, 9)),
    monthlyAutomationRunMinute: clampMinute(numberOr(doc?.monthlyAutomationRunMinute, 0)),
    monthlyAutomationMaxRetries: clampInt(numberOr(doc?.monthlyAutomationMaxRetries, 2), 0, 10),
    monthlyAutomationRetryStrategy:
      optionalString(doc?.monthlyAutomationRetryStrategy) ?? 'same_day_backoff',
    monthlyCycleAlertsEnabled: doc?.monthlyCycleAlertsEnabled !== false,
    dueRemindersEnabled: doc?.dueRemindersEnabled !== false,
    dueReminderDays: clampInt(numberOr(doc?.dueReminderDays, 3), 0, 30),
    reconciliationRemindersEnabled: doc?.reconciliationRemindersEnabled !== false,
    goalAlertsEnabled: doc?.goalAlertsEnabled !== false,
    alertEscalationFailedStepsThreshold: clampInt(
      numberOr(doc?.alertEscalationFailedStepsThreshold, 1),
      1,
      10,
    ),
    alertEscalationFailureStreakThreshold: clampInt(
      numberOr(doc?.alertEscalationFailureStreakThreshold, 2),
      1,
      10,
    ),
    timezone: normalizeTimeZone(optionalString(doc?.timezone) ?? 'UTC'),
  }
}

async function collectPhaseFourUserIds(financeDb: any) {
  const tables = ['financePreferences', 'accounts', 'incomes', 'bills', 'cards', 'loans']
  const docsByTable = await Promise.all(tables.map((table) => safeCollectDocs(financeDb, table)))
  return Array.from(
    new Set(
      docsByTable
        .flat()
        .map((row) => optionalString((row as any).userId))
        .filter(Boolean) as string[],
    ),
  )
}

async function findDashboardPreferencesDoc(db: any, userId: string) {
  try {
    const docs = await db.query('dashboardPreferences').collect()
    const ownerKey = `clerk:${userId}`
    return (Array.isArray(docs) ? docs : []).find((doc: any) => doc?.ownerKey === ownerKey) ?? null
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
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeOwnership(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'shared'
  if (PHASE_FOUR_OWNERSHIP_OPTIONS.includes(normalized as any)) return normalized
  return normalized
}

function normalizeMatchMode(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'equals') return 'equals'
  if (normalized === 'starts_with' || normalized === 'startswith') return 'starts_with'
  if (normalized === 'ends_with' || normalized === 'endswith') return 'ends_with'
  if (normalized === 'regex') return 'regex'
  return 'contains'
}

function normalizeTransactionTypeFilter(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'income') return 'income'
  if (normalized === 'expense') return 'expense'
  if (normalized === 'transfer') return 'transfer'
  return 'all'
}

function normalizeSuggestionStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'accepted') return 'accepted'
  if (normalized === 'dismissed') return 'dismissed'
  if (normalized === 'snoozed') return 'snoozed'
  if (normalized === 'resolved') return 'resolved'
  return 'open'
}

function normalizeSuggestionDecision(value?: string): PhaseFourSuggestionDecision | null {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'accept' || normalized === 'accepted') return 'accept'
  if (normalized === 'dismiss' || normalized === 'dismissed') return 'dismiss'
  if (normalized === 'snooze' || normalized === 'snoozed') return 'snooze'
  return null
}

function normalizeAlertSeverity(value?: string): PhaseFourAlertSeverity {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'high') return 'high'
  if (normalized === 'low') return 'low'
  return 'medium'
}

function normalizeAlertStatus(value?: string): PhaseFourAlertStatus {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'resolved') return 'resolved'
  if (normalized === 'snoozed') return 'snoozed'
  return 'open'
}

function sortByUpdatedDesc(a: any, b: any) {
  return (
    numberOr(b?.updatedAt ?? b?.reviewedAt ?? b?.createdAt ?? b?._creationTime) -
    numberOr(a?.updatedAt ?? a?.reviewedAt ?? a?.createdAt ?? a?._creationTime)
  )
}

function sortSuggestions(a: any, b: any) {
  const aOpen = normalizeSuggestionStatus(optionalString(a?.status)) === 'open' ? 0 : 1
  const bOpen = normalizeSuggestionStatus(optionalString(b?.status)) === 'open' ? 0 : 1
  if (aOpen !== bOpen) return aOpen - bOpen
  return sortByUpdatedDesc(a, b)
}

function sortAlerts(a: any, b: any) {
  const statusOrder = (status: PhaseFourAlertStatus) =>
    status === 'open' ? 0 : status === 'snoozed' ? 1 : 2
  const aStatus = statusOrder(normalizeAlertStatus(optionalString(a?.status)))
  const bStatus = statusOrder(normalizeAlertStatus(optionalString(b?.status)))
  if (aStatus !== bStatus) return aStatus - bStatus
  const aDue = numberOr(a?.dueAt, 0)
  const bDue = numberOr(b?.dueAt, 0)
  if (aDue !== bDue) return aDue - bDue
  return sortByUpdatedDesc(a, b)
}

function buildMonthlyRunHint(prefs: ReturnType<typeof normalizePhaseFourPreferences>) {
  return `Day ${prefs.monthlyAutomationRunDay} at ${String(prefs.monthlyAutomationRunHour).padStart(2, '0')}:${String(prefs.monthlyAutomationRunMinute).padStart(2, '0')} (${prefs.timezone})`
}

function nextMonthlyRunTimestamp(nowMs: number, prefs: ReturnType<typeof normalizePhaseFourPreferences>) {
  return nextMonthlyRunAtInTimeZone(
    nowMs,
    {
      day: prefs.monthlyAutomationRunDay,
      hour: prefs.monthlyAutomationRunHour,
      minute: prefs.monthlyAutomationRunMinute,
    },
    prefs.timezone,
  )
}

function clampPriority(value: unknown) {
  return clampInt(numberOr(value, 100), 0, 1000)
}

function clampDay(value: unknown) {
  return clampInt(numberOr(value, 1), 1, 28)
}

function clampHour(value: unknown) {
  return clampInt(numberOr(value, 9), 0, 23)
}

function clampMinute(value: unknown) {
  return clampInt(numberOr(value, 0), 0, 59)
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function normalizeCurrencyCode(code?: string) {
  return (code ?? DEFAULT_DISPLAY_CURRENCY).trim().toUpperCase() || DEFAULT_DISPLAY_CURRENCY
}

function sanitizeLocale(locale?: string) {
  const candidate = (locale ?? DEFAULT_LOCALE).trim()
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}
