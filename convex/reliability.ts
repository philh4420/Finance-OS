/* eslint-disable @typescript-eslint/no-explicit-any */
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import {
  cycleKeyFromTimestampInTimeZone,
  nextDueAtFromDayInTimeZone,
  normalizeTimeZone,
} from './_shared/timezone'
import {
  collectUserDocs as sharedCollectUserDocs,
  viewerUserId as sharedViewerUserId,
} from './_shared/guardrails'

const DEFAULT_LOCALE = 'en-US'
const DEFAULT_TIMEZONE = 'UTC'

export const getNotificationReminderFeed = query({
  args: {
    lookaheadDays: v.optional(v.number()),
    limit: v.optional(v.number()),
    minuteBucket: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await buildNotificationReminderFeed(ctx, args)
  },
})

export const getPhaseSevenReliabilityWorkspace = query({
  args: {
    telemetryLimit: v.optional(v.number()),
    telemetryFrom: v.optional(v.number()),
    telemetryTo: v.optional(v.number()),
    telemetryCategory: v.optional(v.string()),
    telemetrySearch: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reminderFeed = await buildNotificationReminderFeed(ctx, {
      lookaheadDays: 3,
      limit: 12,
      minuteBucket: undefined,
    })

    const userId = reminderFeed.viewerUserId
    const db = ctx.db as any
    if (!userId) {
      return {
        viewerAuthenticated: false,
        viewerUserId: null,
        locale: DEFAULT_LOCALE,
        notifications: reminderFeed,
        telemetry: {
          rows: [] as any[],
          stats: {
            totalRows: 0,
            filteredRows: 0,
            errorRows: 0,
            offlineRows: 0,
            syncRows: 0,
            lastEventAt: null,
          },
          filterOptions: {
            categories: [] as string[],
            eventTypes: [] as string[],
            features: [] as string[],
          },
          appliedFilters: {
            telemetryLimit: clampInt(numberOr(args.telemetryLimit, 200), 50, 1000),
            telemetryFrom: null,
            telemetryTo: null,
            telemetryCategory: null,
            telemetrySearch: '',
          },
        },
      }
    }

    const locale = sanitizeLocale(args.locale ?? DEFAULT_LOCALE)
    const telemetryLimit = clampInt(numberOr(args.telemetryLimit, 200), 50, 1000)
    const telemetryFrom = parseTimestamp(args.telemetryFrom)
    const telemetryTo = parseTimestamp(args.telemetryTo)
    const telemetryCategory = optionalString(args.telemetryCategory)
    const telemetrySearch = optionalString(args.telemetrySearch)?.toLowerCase() ?? ''

    const telemetryDocs = await collectUserDocs(db, 'clientOpsMetrics', userId)
    const sortedTelemetry = telemetryDocs.slice().sort(sortByCreatedDesc)
    const filterOptions = {
      categories: Array.from(
        new Set(
          sortedTelemetry
            .map((row: any) => optionalString((row as any).category) ?? optionalString((row as any).metricCategory))
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
      eventTypes: Array.from(
        new Set(
          sortedTelemetry
            .map((row: any) => optionalString((row as any).eventType) ?? optionalString((row as any).metricKey))
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
      features: Array.from(
        new Set(
          sortedTelemetry
            .map((row: any) => optionalString((row as any).feature))
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
    }

    const filtered = sortedTelemetry.filter((row: any) => {
      const createdAt = Math.trunc(
        numberOr((row as any).createdAt ?? (row as any).clientTs ?? (row as any)._creationTime),
      )
      if (telemetryFrom && createdAt < telemetryFrom) return false
      if (telemetryTo && createdAt > telemetryTo) return false
      const category =
        optionalString((row as any).category) ?? optionalString((row as any).metricCategory) ?? ''
      if (telemetryCategory && category !== telemetryCategory) return false
      if (!telemetrySearch) return true
      const metadataJson =
        optionalString((row as any).payloadJson) ??
        optionalString((row as any).metadataJson) ??
        optionalString((row as any).tagsJson) ??
        ''
      const haystack = [
        category,
        optionalString((row as any).eventType),
        optionalString((row as any).metricKey),
        optionalString((row as any).feature),
        optionalString((row as any).message),
        optionalString((row as any).status),
        metadataJson,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(telemetrySearch)
    })

    const telemetryRows = filtered.slice(0, telemetryLimit).map((row: any) => normalizeClientOpsMetric(row))
    const errorRows = filtered.filter((row: any) => {
      const severity = (optionalString((row as any).severity) ?? '').toLowerCase()
      const status = (optionalString((row as any).status) ?? '').toLowerCase()
      return severity === 'error' || status === 'error' || status === 'failed'
    }).length
    const offlineRows = filtered.filter((row: any) => (row as any).online === false).length
    const syncRows = filtered.filter((row: any) => {
      const category = (optionalString((row as any).category) ?? '').toLowerCase()
      return category.includes('sync') || category === 'offline_queue'
    }).length

    return {
      viewerAuthenticated: true,
      viewerUserId: userId,
      locale,
      notifications: reminderFeed,
      telemetry: {
        rows: telemetryRows,
        stats: {
          totalRows: sortedTelemetry.length,
          filteredRows: filtered.length,
          errorRows,
          offlineRows,
          syncRows,
          lastEventAt: telemetryRows[0]?.createdAt ?? null,
        },
        filterOptions,
        appliedFilters: {
          telemetryLimit,
          telemetryFrom: telemetryFrom ?? null,
          telemetryTo: telemetryTo ?? null,
          telemetryCategory: telemetryCategory ?? null,
          telemetrySearch,
        },
      },
    }
  },
})

export const ingestClientOpsMetricsBatch = mutation({
  args: {
    eventsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await viewerUserId(ctx)
    if (!userId) {
      return {
        ok: false,
        reason: 'unauthorized',
        acceptedCount: 0,
        insertedCount: 0,
        failedCount: 0,
      }
    }

    const db = ctx.db as any
    const events = safeParseJsonArray(args.eventsJson)
    const accepted = events.slice(0, 200).filter(isRecord)
    let insertedCount = 0
    let failedCount = 0

    for (const event of accepted) {
      const ok = await insertClientOpsMetricSafe(db, userId, event)
      if (ok) insertedCount += 1
      else failedCount += 1
    }

    return {
      ok: true,
      acceptedCount: accepted.length,
      insertedCount,
      failedCount,
    }
  },
})

async function buildNotificationReminderFeed(
  ctx: QueryCtx,
  args: {
    lookaheadDays?: number
    limit?: number
    minuteBucket?: number
  },
) {
  void args.minuteBucket
  const userId = await viewerUserId(ctx)
  const db = ctx.db as any
  if (!userId) {
    return {
      viewerAuthenticated: false,
      viewerUserId: null,
      timezone: DEFAULT_TIMEZONE,
      preferences: {
        dueRemindersEnabled: true,
        monthlyCycleAlertsEnabled: true,
        goalAlertsEnabled: true,
      },
      reminders: [] as any[],
    }
  }

  const lookaheadDays = clampInt(numberOr(args.lookaheadDays, 3), 1, 14)
  const limit = clampInt(numberOr(args.limit, 12), 1, 50)
  const now = Date.now()

  const [prefDoc, cycleAlerts, bills, loans] = await Promise.all([
    findUserDoc(db, 'financePreferences', userId),
    collectUserDocs(db, 'cycleStepAlerts', userId),
    collectUserDocs(db, 'bills', userId),
    collectUserDocs(db, 'loans', userId),
  ])

  const prefs = {
    dueRemindersEnabled: prefDoc?.dueRemindersEnabled !== false,
    monthlyCycleAlertsEnabled: prefDoc?.monthlyCycleAlertsEnabled !== false,
    goalAlertsEnabled: prefDoc?.goalAlertsEnabled !== false,
  }
  const timezone = normalizeTimeZone(optionalString((prefDoc as any)?.timezone) ?? DEFAULT_TIMEZONE)

  const reminders: Array<{
    id: string
    kind: 'cycle_alert' | 'bill_due' | 'loan_due'
    title: string
    body: string
    dueAt: number | null
    route: string
    severity: 'low' | 'medium' | 'high'
    dedupeKey: string
  }> = []

  if (prefs.monthlyCycleAlertsEnabled) {
    for (const row of cycleAlerts) {
      const status = (optionalString((row as any).status) ?? '').toLowerCase()
      if (status && status !== 'open') continue
      const dueAt = numberOr((row as any).dueAt, 0) || null
      if (dueAt && dueAt > now + lookaheadDays * 24 * 60 * 60 * 1000) continue
      reminders.push({
        id: String((row as any)._id),
        kind: 'cycle_alert',
        title: optionalString((row as any).title) ?? 'Cycle alert',
        body: optionalString((row as any).detail) ?? 'A finance workflow alert needs attention.',
        dueAt,
        route: optionalString((row as any).actionHref) ?? '/?view=automation',
        severity: normalizeAlertSeverity(optionalString((row as any).severity)),
        dedupeKey:
          optionalString((row as any).fingerprint) ?? `cycle-alert:${String((row as any)._id)}`,
      })
    }
  }

  if (prefs.dueRemindersEnabled) {
    for (const bill of bills) {
      const dueDay = clampDay(numberOr((bill as any).dueDay, 1))
      const dueAt = nextDueAtFromDayInTimeZone(now, dueDay, timezone, 9, 0)
      if (dueAt > now + lookaheadDays * 24 * 60 * 60 * 1000) continue
      const amount = Math.max(0, numberOr((bill as any).amount))
      const billName = optionalString((bill as any).name) ?? 'Bill'
      reminders.push({
        id: String((bill as any)._id),
        kind: 'bill_due',
        title: `${billName} due soon`,
        body:
          amount > 0
            ? `Bill payment ${amount.toFixed(2)} due on day ${dueDay}.`
            : `Bill payment due on day ${dueDay}.`,
        dueAt,
        route: '/?view=bills',
        severity: dueAt - now <= 24 * 60 * 60 * 1000 ? 'high' : 'medium',
        dedupeKey: `bill-due:${String((bill as any)._id)}:${cycleKeyFromTimestampInTimeZone(dueAt, timezone)}`,
      })
    }
    for (const loan of loans) {
      const dueDay = clampDay(numberOr((loan as any).dueDay, 1))
      const dueAt = nextDueAtFromDayInTimeZone(now, dueDay, timezone, 9, 0)
      if (dueAt > now + lookaheadDays * 24 * 60 * 60 * 1000) continue
      const minPayment = Math.max(0, numberOr((loan as any).minimumPayment))
      const loanName = optionalString((loan as any).name) ?? 'Loan'
      reminders.push({
        id: String((loan as any)._id),
        kind: 'loan_due',
        title: `${loanName} payment due soon`,
        body:
          minPayment > 0
            ? `Minimum payment ${minPayment.toFixed(2)} due on day ${dueDay}.`
            : `Loan payment due on day ${dueDay}.`,
        dueAt,
        route: '/?view=loans',
        severity: dueAt - now <= 24 * 60 * 60 * 1000 ? 'high' : 'medium',
        dedupeKey: `loan-due:${String((loan as any)._id)}:${cycleKeyFromTimestampInTimeZone(dueAt, timezone)}`,
      })
    }
  }

  return {
    viewerAuthenticated: true,
    viewerUserId: userId,
    timezone,
    preferences: prefs,
    reminders: reminders
      .slice()
      .sort(sortReminderRows)
      .slice(0, limit),
  }
}

async function insertClientOpsMetricSafe(
  db: any,
  userId: string,
  rawEvent: Record<string, unknown>,
) {
  const now = Date.now()
  const category = optionalString(rawEvent.category) ?? 'client'
  const eventType = optionalString(rawEvent.eventType) ?? 'event'
  const severity = normalizeSeverity(optionalString(rawEvent.severity))
  const status = optionalString(rawEvent.status)
  const feature = optionalString(rawEvent.feature)
  const message = optionalString(rawEvent.message)
  const sessionId = optionalString(rawEvent.sessionId)
  const appVersion = optionalString(rawEvent.appVersion)
  const online = typeof rawEvent.online === 'boolean' ? rawEvent.online : undefined
  const visibilityState = optionalString(rawEvent.visibilityState)
  const route = optionalString(rawEvent.route)
  const source = optionalString(rawEvent.source) ?? 'phase7_pwa_runtime'
  const attempt = clampInt(numberOr(rawEvent.attempt, 0), 0, 99)
  const latencyMs = numberOr(rawEvent.latencyMs, Number.NaN)
  const metricValue = numberOr(rawEvent.metricValue, Number.NaN)
  const createdAt = Math.trunc(numberOr(rawEvent.createdAt ?? rawEvent.clientTs, now))
  const metadata = safeEventMetadata(rawEvent)
  const metadataJson = JSON.stringify(metadata)

  try {
    await db.insert(
      'clientOpsMetrics',
      compactObject({
        userId,
        createdAt,
        clientTs: createdAt,
        category,
        eventType,
        metricCategory: category,
        metricKey: eventType,
        metricValue: Number.isFinite(metricValue) ? metricValue : undefined,
        severity,
        status,
        feature,
        message,
        sessionId,
        appVersion,
        online,
        visibilityState,
        route,
        source,
        attempt,
        latencyMs: Number.isFinite(latencyMs) ? latencyMs : undefined,
        payloadJson: metadataJson,
        metadataJson,
        tagsJson: JSON.stringify(
          compactObject({
            category,
            eventType,
            feature,
            severity,
            status,
            route,
            source,
          }),
        ),
      }),
    )
    return true
  } catch {
    try {
      await db.insert(
        'clientOpsMetrics',
        compactObject({
          userId,
          createdAt,
          metricCategory: category,
          metricKey: eventType,
          metricValue: Number.isFinite(metricValue)
            ? metricValue
            : Number.isFinite(latencyMs)
              ? latencyMs
              : undefined,
          tagsJson: JSON.stringify(
            compactObject({
              severity,
              status,
              feature,
              route,
              source,
              online,
              visibilityState,
              appVersion,
              sessionId,
            }),
          ),
          payloadJson: metadataJson,
        }),
      )
      return true
    } catch {
      return false
    }
  }
}

function normalizeClientOpsMetric(row: any) {
  const metadataJson =
    optionalString((row as any).metadataJson) ??
    optionalString((row as any).payloadJson) ??
    optionalString((row as any).tagsJson) ??
    ''
  const metadata = safeParseJsonObject(metadataJson)
  return {
    id: String((row as any)._id),
    createdAt: Math.trunc(numberOr((row as any).createdAt ?? (row as any).clientTs ?? (row as any)._creationTime)),
    category: optionalString((row as any).category) ?? optionalString((row as any).metricCategory) ?? 'client',
    eventType: optionalString((row as any).eventType) ?? optionalString((row as any).metricKey) ?? 'event',
    severity: normalizeSeverity(optionalString((row as any).severity)),
    status: optionalString((row as any).status) ?? '',
    feature: optionalString((row as any).feature) ?? '',
    message: optionalString((row as any).message) ?? '',
    route: optionalString((row as any).route) ?? optionalString((metadata as any)?.route) ?? '',
    online:
      typeof (row as any).online === 'boolean'
        ? Boolean((row as any).online)
        : typeof (metadata as any)?.online === 'boolean'
          ? Boolean((metadata as any).online)
          : null,
    visibilityState:
      optionalString((row as any).visibilityState) ??
      optionalString((metadata as any)?.visibilityState) ??
      '',
    sessionId:
      optionalString((row as any).sessionId) ?? optionalString((metadata as any)?.sessionId) ?? '',
    source: optionalString((row as any).source) ?? optionalString((metadata as any)?.source) ?? '',
    latencyMs: numberOr((row as any).latencyMs ?? (metadata as any)?.latencyMs, Number.NaN),
    metricValue: numberOr((row as any).metricValue ?? (metadata as any)?.metricValue, Number.NaN),
    metadataJson: sanitizeJsonPreview(metadataJson),
    metadataSummary: summarizeMetricMetadata(metadata),
  }
}

function safeEventMetadata(event: Record<string, unknown>) {
  const copy = { ...event }
  delete (copy as any).category
  delete (copy as any).eventType
  delete (copy as any).metricCategory
  delete (copy as any).metricKey
  delete (copy as any).severity
  delete (copy as any).status
  delete (copy as any).feature
  delete (copy as any).message
  delete (copy as any).sessionId
  delete (copy as any).appVersion
  delete (copy as any).online
  delete (copy as any).visibilityState
  delete (copy as any).route
  delete (copy as any).source
  delete (copy as any).attempt
  delete (copy as any).latencyMs
  delete (copy as any).metricValue
  delete (copy as any).createdAt
  delete (copy as any).clientTs
  return copy
}

function summarizeMetricMetadata(value: Record<string, unknown> | null) {
  if (!value) return ''
  return Object.keys(value).slice(0, 6).join(', ')
}

function sanitizeJsonPreview(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.length > 1000 ? `${trimmed.slice(0, 1000)}…` : trimmed
}

function sortByCreatedDesc(a: any, b: any) {
  return (
    numberOr((b as any)?.createdAt ?? (b as any)?.clientTs ?? (b as any)?._creationTime) -
    numberOr((a as any)?.createdAt ?? (a as any)?.clientTs ?? (a as any)?._creationTime)
  )
}

function sortReminderRows(
  a: { dueAt: number | null; severity: string; createdAt?: number | null },
  b: { dueAt: number | null; severity: string; createdAt?: number | null },
) {
  const severityRank = (value: string) => {
    if (value === 'high') return 0
    if (value === 'medium') return 1
    return 2
  }
  const aDue = a.dueAt ?? Number.MAX_SAFE_INTEGER
  const bDue = b.dueAt ?? Number.MAX_SAFE_INTEGER
  if (aDue !== bDue) return aDue - bDue
  const aSeverity = severityRank(a.severity)
  const bSeverity = severityRank(b.severity)
  if (aSeverity !== bSeverity) return aSeverity - bSeverity
  return numberOr((b as any).createdAt) - numberOr((a as any).createdAt)
}

function normalizeAlertSeverity(value?: string): 'low' | 'medium' | 'high' {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  return 'low'
}

function normalizeSeverity(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'error') return 'error'
  if (normalized === 'warning' || normalized === 'warn') return 'warning'
  if (normalized === 'debug') return 'debug'
  return 'info'
}

function clampDay(value: number) {
  return clampInt(value, 1, 31)
}

function parseTimestamp(value: unknown) {
  const numeric = numberOr(value, Number.NaN)
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : undefined
}

async function collectUserDocs(db: any, table: string, userId: string): Promise<any[]> {
  return await sharedCollectUserDocs(db, table, userId)
}

async function findUserDoc(db: any, table: string, userId: string): Promise<any | null> {
  const rows = await collectUserDocs(db, table, userId)
  if (rows.length === 0) return null
  return rows.slice().sort(sortByCreatedDesc)[0] ?? null
}

async function viewerUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  return await sharedViewerUserId(ctx)
}

function safeParseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') {
    return isRecord(value) ? value : null
  }
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function safeParseJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string') return Array.isArray(value) ? value : []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function numberOr(value: unknown, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function sanitizeLocale(locale?: string) {
  const candidate = (locale ?? DEFAULT_LOCALE).trim()
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}
