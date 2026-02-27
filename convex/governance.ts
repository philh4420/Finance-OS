/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
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
// New internal functions may be referenced before local codegen refresh.
const internalGovernance: any = (internal as any).governance

const PHASE_SIX_RETENTION_DEFAULTS = [
  { policyKey: 'exports', retentionDays: 7, enabled: true },
  { policyKey: 'deletion_jobs', retentionDays: 30, enabled: true },
  { policyKey: 'consent_logs', retentionDays: 730, enabled: true },
  { policyKey: 'finance_audit_events', retentionDays: 365, enabled: true },
] as const

const PHASE_SIX_ACCOUNT_ERASURE_CONFIRMATION = 'DELETE ALL MY DATA'

const PHASE_SIX_ACCOUNT_ERASURE_USER_TABLES = [
  'accountReconciliationChecks',
  'accounts',
  'accountTransfers',
  'billPaymentChecks',
  'bills',
  'cards',
  'clientOpsMetrics',
  'consentLogs',
  'consentSettings',
  'cycleAuditLogs',
  'cycleStepAlerts',
  'dashboardStates',
  'deletionJobs',
  'envelopeBudgets',
  'financeAuditEvents',
  'financePreferences',
  'goalEvents',
  'goals',
  'incomeAllocationRules',
  'incomeAllocationSuggestions',
  'incomeChangeEvents',
  'incomePaymentChecks',
  'incomes',
  'ledgerEntries',
  'ledgerLines',
  'loanCycleAuditEntries',
  'loanEvents',
  'loans',
  'monthCloseSnapshots',
  'monthlyCycleRuns',
  'personalFinanceStates',
  'planningActionTasks',
  'planningMonthVersions',
  'purchaseMonthCloseRuns',
  'purchases',
  'purchaseSplits',
  'purchaseSplitTemplates',
  'retentionPolicies',
  'settingsProfiles',
  'subscriptionPriceChanges',
  'transactionRules',
  'userExportDownloads',
  'userExports',
] as const

const PHASE_SIX_ACCOUNT_ERASURE_OWNER_KEY_TABLES = [
  'dashboardPreferences',
  'dashboardSnapshots',
] as const

const PHASE_SIX_EXPORT_SCOPE_TABLES = {
  full_account: [
    'accounts',
    'incomes',
    'bills',
    'cards',
    'loans',
    'purchases',
    'purchaseSplits',
    'purchaseSplitTemplates',
    'ledgerEntries',
    'ledgerLines',
    'planningMonthVersions',
    'planningActionTasks',
    'personalFinanceStates',
    'goals',
    'goalEvents',
    'envelopeBudgets',
    'financePreferences',
    'transactionRules',
    'incomeAllocationRules',
    'incomeAllocationSuggestions',
    'subscriptionPriceChanges',
    'monthlyCycleRuns',
    'monthCloseSnapshots',
    'cycleAuditLogs',
    'incomePaymentChecks',
    'loanEvents',
    'cycleStepAlerts',
    'retentionPolicies',
    'deletionJobs',
    'consentSettings',
    'consentLogs',
    'userExports',
    'userExportDownloads',
    'financeAuditEvents',
  ],
  finance_only: [
    'accounts',
    'incomes',
    'bills',
    'cards',
    'loans',
    'purchases',
    'purchaseSplits',
    'purchaseSplitTemplates',
    'ledgerEntries',
    'ledgerLines',
    'planningMonthVersions',
    'planningActionTasks',
    'personalFinanceStates',
    'goals',
    'goalEvents',
    'envelopeBudgets',
    'financePreferences',
    'transactionRules',
    'incomeAllocationRules',
    'incomeAllocationSuggestions',
    'subscriptionPriceChanges',
    'monthlyCycleRuns',
    'monthCloseSnapshots',
    'cycleAuditLogs',
    'incomePaymentChecks',
    'loanEvents',
    'cycleStepAlerts',
  ],
  privacy_only: ['consentSettings', 'consentLogs', 'retentionPolicies', 'deletionJobs', 'userExports', 'userExportDownloads'],
  audit_only: ['financeAuditEvents'],
} as const

export const getPhaseSixGovernanceWorkspace = query({
  args: {
    displayCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
    auditLimit: v.optional(v.number()),
    auditFrom: v.optional(v.number()),
    auditTo: v.optional(v.number()),
    auditAction: v.optional(v.string()),
    auditEntityType: v.optional(v.string()),
    auditSearch: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const userId = await viewerUserId(ctx)
    const db = ctx.db as any

    if (!userId) {
      return {
        viewerAuthenticated: false,
        viewerUserId: null,
        displayCurrency: DEFAULT_DISPLAY_CURRENCY,
        baseCurrency: DEFAULT_DISPLAY_CURRENCY,
        locale: DEFAULT_LOCALE,
        fxPolicy: {
          displayCurrency: DEFAULT_DISPLAY_CURRENCY,
          baseCurrency: DEFAULT_DISPLAY_CURRENCY,
          fxAsOfMs: null,
          fxSources: [] as string[],
          syntheticRates: false,
        },
        exportsCenter: {
          requests: [] as any[],
          downloads: [] as any[],
          stats: {
            totalRequests: 0,
            pendingRequests: 0,
            readyDownloads: 0,
            lastRequestAt: null,
          },
        },
        privacy: {
          consentSettings: {
            id: null,
            analyticsEnabled: false,
            diagnosticsEnabled: false,
            updatedAt: null,
          },
          consentLogs: [] as any[],
          stats: {
            totalLogs: 0,
            analyticsEnabled: false,
            diagnosticsEnabled: false,
            lastConsentChangeAt: null,
          },
        },
        retention: {
          retentionPolicies: PHASE_SIX_RETENTION_DEFAULTS.map((row) => ({
            id: `default-${row.policyKey}`,
            policyKey: row.policyKey,
            retentionDays: row.retentionDays,
            enabled: row.enabled,
            updatedAt: null,
            source: 'default',
          })),
          deletionJobs: [] as any[],
          stats: {
            policyCount: PHASE_SIX_RETENTION_DEFAULTS.length,
            enabledPolicyCount: PHASE_SIX_RETENTION_DEFAULTS.filter((row) => row.enabled).length,
            openDeletionJobs: 0,
            lastDeletionJobAt: null,
          },
        },
        auditTrail: {
          rows: [] as any[],
          stats: {
            totalRows: 0,
            unfilteredTotalRows: 0,
            lastEventAt: null,
          },
          filterOptions: {
            entityTypes: [] as string[],
            actions: [] as string[],
          },
          appliedFilters: {
            auditFrom: null,
            auditTo: null,
            auditAction: null,
            auditEntityType: null,
            auditSearch: '',
            auditLimit: clampInt(numberOr(args.auditLimit, 250), 50, 2000),
          },
        },
      }
    }

    const [dashboardPrefDoc, financePrefDoc, userExports, userExportDownloads, retentionPolicies, deletionJobs, consentSettingsDocs, consentLogs, auditRows, fxRows] =
      await Promise.all([
        findDashboardPreferencesDoc(db, userId),
        findUserDoc(db, 'financePreferences', userId),
        collectUserDocs(db, 'userExports', userId),
        collectUserDocs(db, 'userExportDownloads', userId),
        collectUserDocs(db, 'retentionPolicies', userId),
        collectUserDocs(db, 'deletionJobs', userId),
        collectUserDocs(db, 'consentSettings', userId),
        collectUserDocs(db, 'consentLogs', userId),
        collectUserDocs(db, 'financeAuditEvents', userId),
        safeCollectDocs(db, 'fxRates'),
      ])

    const baseCurrency = normalizeCurrencyCode(
      optionalString((financePrefDoc as any)?.currency) ?? DEFAULT_DISPLAY_CURRENCY,
    )
    const displayCurrency = normalizeCurrencyCode(
      args.displayCurrency ?? optionalString((dashboardPrefDoc as any)?.displayCurrency) ?? baseCurrency,
    )
    const locale = sanitizeLocale(
      args.locale ?? optionalString((dashboardPrefDoc as any)?.locale) ?? optionalString((financePrefDoc as any)?.locale) ?? DEFAULT_LOCALE,
    )

    const mappedExportRequests = userExports.slice().sort(sortByUpdatedDesc).map((row: any) => normalizeExportRequest(row))
    const mappedExportDownloads = userExportDownloads.slice().sort(sortByUpdatedDesc).map((row: any) => normalizeExportDownload(row))

    const mappedRetentionPolicies = mergeRetentionPolicyDefaults(
      retentionPolicies.slice().sort(sortByUpdatedDesc).map((row: any) => normalizeRetentionPolicy(row)),
    )
    const mappedDeletionJobs = deletionJobs.slice().sort(sortDeletionJobs).map((row: any) => normalizeDeletionJob(row))

    const consentSettingRow = consentSettingsDocs.slice().sort(sortByUpdatedDesc)[0] ?? null
    const normalizedConsentSettings = normalizeConsentSettings(consentSettingRow)
    const mappedConsentLogs = consentLogs.slice().sort(sortByUpdatedDesc).map((row: any) => normalizeConsentLog(row))

    const auditLimit = clampInt(numberOr(args.auditLimit, 250), 50, 2000)
    const auditFrom = parseAuditTimestamp(args.auditFrom)
    const auditTo = parseAuditTimestamp(args.auditTo)
    const auditAction = optionalString(args.auditAction)
    const auditEntityType = optionalString(args.auditEntityType)
    const auditSearch = optionalString(args.auditSearch)?.toLowerCase() ?? ''

    const sortedAuditRows = auditRows.slice().sort(sortByUpdatedDesc)
    const auditFilterOptions = {
      entityTypes: Array.from(
        new Set(
          sortedAuditRows
            .map((row: any) => optionalString(row.entityType))
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
      actions: Array.from(
        new Set(
          sortedAuditRows
            .map((row: any) => optionalString(row.action))
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b)),
    }

    const filteredAuditRows = sortedAuditRows.filter((row: any) => {
      const createdAt = Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime))
      if (auditFrom && createdAt < auditFrom) return false
      if (auditTo && createdAt > auditTo) return false
      if (auditAction && optionalString((row as any).action) !== auditAction) return false
      if (auditEntityType && optionalString((row as any).entityType) !== auditEntityType) return false
      if (!auditSearch) return true

      const haystack = [
        optionalString((row as any).action),
        optionalString((row as any).entityType),
        optionalString((row as any).entityId),
        optionalString((row as any).metadataJson),
        optionalString((row as any).beforeJson),
        optionalString((row as any).afterJson),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(auditSearch)
    })

    const mappedAuditRows = filteredAuditRows
      .slice(0, auditLimit)
      .map((row: any) => normalizeAuditRow(row))
    const fxAsOfMsCandidates = fxRows
      .map((row: any) => Math.trunc(numberOr((row as any).asOfMs)))
      .filter((value: number) => Number.isFinite(value) && value > 0)
    const fxAsOfMs = fxAsOfMsCandidates.length ? Math.max(...fxAsOfMsCandidates) : null
    const fxSources = Array.from(
      new Set(
        fxRows
          .map((row: any) => optionalString((row as any).source))
          .filter(Boolean) as string[],
      ),
    ).sort((a, b) => a.localeCompare(b))
    const syntheticRates = fxRows.some((row: any) => Boolean((row as any).synthetic))

    return {
      viewerAuthenticated: true,
      viewerUserId: userId,
      displayCurrency,
      baseCurrency,
      locale,
      fxPolicy: {
        displayCurrency,
        baseCurrency,
        fxAsOfMs,
        fxSources,
        syntheticRates,
      },
      exportsCenter: {
        requests: mappedExportRequests,
        downloads: mappedExportDownloads,
        stats: {
          totalRequests: mappedExportRequests.length,
          pendingRequests: mappedExportRequests.filter((row) => row.status === 'requested' || row.status === 'processing').length,
          readyDownloads: mappedExportDownloads.filter((row) => row.status === 'ready').length,
          lastRequestAt: mappedExportRequests[0]?.requestedAt ?? null,
        },
      },
      privacy: {
        consentSettings: normalizedConsentSettings,
        consentLogs: mappedConsentLogs,
        stats: {
          totalLogs: mappedConsentLogs.length,
          analyticsEnabled: normalizedConsentSettings.analyticsEnabled,
          diagnosticsEnabled: normalizedConsentSettings.diagnosticsEnabled,
          lastConsentChangeAt: mappedConsentLogs[0]?.createdAt ?? normalizedConsentSettings.updatedAt ?? null,
        },
      },
      retention: {
        retentionPolicies: mappedRetentionPolicies,
        deletionJobs: mappedDeletionJobs,
        stats: {
          policyCount: mappedRetentionPolicies.length,
          enabledPolicyCount: mappedRetentionPolicies.filter((row) => row.enabled).length,
          openDeletionJobs: mappedDeletionJobs.filter((row) => ['requested', 'scheduled', 'running'].includes(row.status)).length,
          lastDeletionJobAt: mappedDeletionJobs[0]?.requestedAt ?? mappedDeletionJobs[0]?.updatedAt ?? null,
        },
      },
      auditTrail: {
        rows: mappedAuditRows,
        stats: {
          totalRows: filteredAuditRows.length,
          unfilteredTotalRows: sortedAuditRows.length,
          lastEventAt: mappedAuditRows[0]?.createdAt ?? null,
        },
        filterOptions: auditFilterOptions,
        appliedFilters: {
          auditFrom: auditFrom ?? null,
          auditTo: auditTo ?? null,
          auditAction: auditAction ?? null,
          auditEntityType: auditEntityType ?? null,
          auditSearch,
          auditLimit,
        },
      },
    }
  },
})

export const requestUserExport = mutation({
  args: {
    exportKind: v.optional(v.string()),
    format: v.optional(v.string()),
    scope: v.optional(v.string()),
    includeAuditTrail: v.optional(v.boolean()),
    includeDeletedArtifacts: v.optional(v.boolean()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()

    const exportKind = normalizeExportKind(optionalString(args.exportKind))
    const format = normalizeExportFormat(optionalString(args.format))
    const scope = normalizeExportScope(optionalString(args.scope))
    const includeAuditTrail = args.includeAuditTrail !== false
    const includeDeletedArtifacts = Boolean(args.includeDeletedArtifacts)
    const requestId = String(
      await db.insert(
        'userExports',
        compactObject({
          userId,
          exportKind,
          format,
          scope,
          status: 'requested',
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
          includeAuditTrail,
          includeDeletedArtifacts,
          note: optionalString(args.note),
          source: 'phase6_governance_ui',
          payloadJson: JSON.stringify({
            exportKind,
            format,
            scope,
            includeAuditTrail,
            includeDeletedArtifacts,
            note: optionalString(args.note),
          }),
        }),
      ),
    )

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_export_request_create',
      entityId: requestId,
      entityType: 'user_export',
      userId,
      afterJson: JSON.stringify({ requestId, exportKind, format, scope, includeAuditTrail, includeDeletedArtifacts }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', recordedAt: now }),
    })

    return {
      ok: true,
      requestId,
      status: 'requested',
      exportKind,
      format,
      scope,
    }
  },
})

export const generateExportArtifact = action({
  args: {
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const input: any = await ctx.runQuery(internalGovernance.getExportGenerationInput, {
      requestId: args.requestId,
      userId,
    })
    if (!input?.ok) {
      throw new Error(input?.error ?? 'Export request not found')
    }
    if (input.request.status === 'cancelled') {
      throw new Error('Cancelled export requests cannot be generated')
    }

    await ctx.runMutation(internalGovernance.markExportRequestProcessing, {
      requestId: args.requestId,
      userId,
    })

    try {
      const serialized = serializeExportBundle({
        bundle: input.bundle,
        exportKind: input.request.exportKind,
        scope: input.request.scope,
        requestedFormat: input.request.format,
      })
      const checksumSha256 = await sha256Hex(serialized.bytes)
      const blob = new Blob([serialized.bytes], { type: serialized.contentType })
      const storageId = String(await ctx.storage.store(blob))
      const now = Date.now()
      const expiresAt = now + 7 * 24 * 60 * 60 * 1000
      const downloadToken = createSignedDownloadToken()
      const filename = buildExportFilename({
        exportKind: input.request.exportKind,
        scope: input.request.scope,
        format: serialized.actualFormat,
        now,
      })

      return await ctx.runMutation(internalGovernance.finalizeGeneratedExport, {
        requestId: args.requestId,
        userId,
        storageId,
        filename,
        byteSize: serialized.byteLength,
        checksumSha256,
        contentType: serialized.contentType,
        expiresAt,
        requestedFormat: input.request.format,
        actualFormat: serialized.actualFormat,
        exportKind: input.request.exportKind,
        scope: input.request.scope,
        downloadToken,
        datasetCount: input.bundle.tables.length,
        rowCount: input.bundle.summary.totalRows,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export generation failed'
      try {
        await ctx.runMutation(internalGovernance.failGeneratedExport, {
          requestId: args.requestId,
          userId,
          errorMessage: message,
        })
      } catch {
        // Best-effort failure recording.
      }
      throw error
    }
  },
})

export const getExportGenerationInput = internalQuery({
  args: {
    requestId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any
    let request: any
    try {
      request = await getOwnedDocOrThrow(db, 'userExports', args.requestId, args.userId)
    } catch {
      return { ok: false as const, error: 'Export request not found' }
    }

    const exportKind = normalizeExportKind(optionalString((request as any).exportKind))
    const format = normalizeExportFormat(optionalString((request as any).format))
    const scope = normalizeExportScope(optionalString((request as any).scope))
    const status = normalizeExportRequestStatus(optionalString((request as any).status))
    const requestedAt = Date.now()
    const bundle = await buildRealUserExportBundle(db, {
      userId: args.userId,
      exportKind,
      scope,
      includeAuditTrail: Boolean((request as any).includeAuditTrail ?? true),
      includeDeletedArtifacts: Boolean((request as any).includeDeletedArtifacts ?? false),
      requestedAt,
    })

    return {
      ok: true as const,
      request: {
        id: String((request as any)._id),
        status,
        exportKind,
        format,
        scope,
      },
      bundle,
    }
  },
})

export const markExportRequestProcessing = internalMutation({
  args: {
    requestId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any
    const request = await getOwnedDocOrThrow(db, 'userExports', args.requestId, args.userId)
    const now = Date.now()
    await db.patch(request._id, {
      status: 'processing',
      updatedAt: now,
      processingStartedAt: now,
    })
    return { ok: true, requestId: args.requestId }
  },
})

export const finalizeGeneratedExport = internalMutation({
  args: {
    requestId: v.string(),
    userId: v.string(),
    storageId: v.string(),
    filename: v.string(),
    byteSize: v.number(),
    checksumSha256: v.string(),
    contentType: v.string(),
    expiresAt: v.number(),
    requestedFormat: v.string(),
    actualFormat: v.string(),
    exportKind: v.string(),
    scope: v.string(),
    downloadToken: v.string(),
    datasetCount: v.number(),
    rowCount: v.number(),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any
    const now = Date.now()
    const request = await getOwnedDocOrThrow(db, 'userExports', args.requestId, args.userId)

    await db.patch(request._id, {
      status: 'ready',
      updatedAt: now,
      completedAt: now,
      latestDownloadStatus: 'ready',
      latestFilename: args.filename,
      latestExpiresAt: args.expiresAt,
    })

    const downloadId = String(
      await db.insert(
        'userExportDownloads',
        compactObject({
          userId: args.userId,
          exportId: args.requestId,
          requestId: args.requestId,
          status: 'ready',
          filename: args.filename,
          format: args.actualFormat,
          requestedFormat: args.requestedFormat,
          byteSize: Math.max(0, Math.trunc(numberOr(args.byteSize))),
          checksumSha256: requiredString(args.checksumSha256, 'Checksum'),
          contentType: requiredString(args.contentType, 'Content type'),
          storageId: requiredString(args.storageId, 'Storage ID'),
          expiresAt: Math.trunc(numberOr(args.expiresAt)),
          downloadToken: requiredString(args.downloadToken, 'Download token'),
          createdAt: now,
          updatedAt: now,
          source: 'phase6_export_generator',
          payloadJson: JSON.stringify({
            exportKind: args.exportKind,
            scope: args.scope,
            requestedFormat: args.requestedFormat,
            actualFormat: args.actualFormat,
            datasetCount: Math.trunc(numberOr(args.datasetCount)),
            rowCount: Math.trunc(numberOr(args.rowCount)),
            generatedAt: now,
          }),
        }),
      ),
    )

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_export_request_ready',
      entityId: args.requestId,
      entityType: 'user_export',
      userId: args.userId,
      beforeJson: JSON.stringify(request),
      afterJson: JSON.stringify({
        requestId: args.requestId,
        downloadId,
        filename: args.filename,
        byteSize: args.byteSize,
        expiresAt: args.expiresAt,
        requestedFormat: args.requestedFormat,
        actualFormat: args.actualFormat,
        datasetCount: args.datasetCount,
        rowCount: args.rowCount,
      }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', realExport: true, recordedAt: now }),
    })

    return {
      ok: true,
      requestId: args.requestId,
      downloadId,
      filename: args.filename,
      byteSize: Math.max(0, Math.trunc(numberOr(args.byteSize))),
      expiresAt: Math.trunc(numberOr(args.expiresAt)),
      actualFormat: args.actualFormat,
    }
  },
})

export const failGeneratedExport = internalMutation({
  args: {
    requestId: v.string(),
    userId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any
    const now = Date.now()
    const request = await getOwnedDocOrThrow(db, 'userExports', args.requestId, args.userId)
    const message = requiredString(args.errorMessage, 'Error message')

    await db.patch(
      request._id,
      compactObject({
        status: 'failed',
        updatedAt: now,
        failureReason: message,
      }),
    )

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_export_request_failed',
      entityId: args.requestId,
      entityType: 'user_export',
      userId: args.userId,
      beforeJson: JSON.stringify(request),
      afterJson: JSON.stringify({ status: 'failed', failureReason: message }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', recordedAt: now }),
    })

    return { ok: true, requestId: args.requestId, status: 'failed' }
  },
})

export const simulateExportReady = mutation({
  args: {
    requestId: v.string(),
    byteSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    void userId
    void args
    throw new Error('simulateExportReady is deprecated. Use generateExportArtifact instead.')
  },
})

export const updateExportRequestStatus = mutation({
  args: {
    requestId: v.string(),
    status: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()
    const request = await getOwnedDocOrThrow(db, 'userExports', args.requestId, userId)
    const nextStatus = normalizeExportRequestStatus(optionalString(args.status))

    await db.patch(
      request._id,
      compactObject({
        status: nextStatus,
        updatedAt: now,
        note: optionalString(args.note) ?? optionalString((request as any).note),
        cancelledAt: nextStatus === 'cancelled' ? now : undefined,
      }),
    )

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_export_request_status_update',
      entityId: args.requestId,
      entityType: 'user_export',
      userId,
      beforeJson: JSON.stringify(request),
      afterJson: JSON.stringify({ status: nextStatus, updatedAt: now }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', recordedAt: now }),
    })

    return { ok: true, requestId: args.requestId, status: nextStatus }
  },
})

export const upsertRetentionPolicy = mutation({
  args: {
    id: v.optional(v.string()),
    policyKey: v.string(),
    retentionDays: v.number(),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()

    const patch = {
      userId,
      policyKey: requiredString(args.policyKey, 'Policy key'),
      retentionDays: clampInt(numberOr(args.retentionDays), 0, 3650),
      enabled: args.enabled !== false,
      updatedAt: now,
    }

    let id = ''
    let mode: 'created' | 'updated' = 'created'
    let before: any = null

    if (args.id) {
      const existing = await getOwnedDocOrThrow(db, 'retentionPolicies', args.id, userId)
      before = existing
      await db.patch(existing._id, patch)
      id = String(existing._id)
      mode = 'updated'
    } else {
      const existingByKey = (await collectUserDocs(db, 'retentionPolicies', userId)).find(
        (row) => optionalString((row as any).policyKey) === patch.policyKey,
      )
      if (existingByKey) {
        before = existingByKey
        await db.patch(existingByKey._id, patch)
        id = String(existingByKey._id)
        mode = 'updated'
      } else {
        id = String(await db.insert('retentionPolicies', patch))
      }
    }

    await recordFinanceAuditEventSafe(db, {
      action: mode === 'created' ? 'phase6_retention_policy_create' : 'phase6_retention_policy_update',
      entityId: id,
      entityType: 'retention_policy',
      userId,
      beforeJson: before ? JSON.stringify(before) : undefined,
      afterJson: JSON.stringify(patch),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', recordedAt: now }),
    })

    return { ok: true, id, mode, policyKey: patch.policyKey }
  },
})

export const requestDeletionJob = mutation({
  args: {
    jobType: v.optional(v.string()),
    scope: v.optional(v.string()),
    targetEntityType: v.optional(v.string()),
    targetEntityId: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    reason: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()
    const jobType = normalizeDeletionJobType(optionalString(args.jobType))
    const status = 'requested'
    const scheduledAt = Math.max(now, Math.trunc(numberOr(args.scheduledAt, now)))

    const jobId = String(
      await db.insert(
        'deletionJobs',
        compactObject({
          userId,
          jobType,
          scope: normalizeDeletionScope(optionalString(args.scope)),
          targetEntityType: optionalString(args.targetEntityType),
          targetEntityId: optionalString(args.targetEntityId),
          status,
          requestedAt: now,
          scheduledAt,
          createdAt: now,
          updatedAt: now,
          dryRun: args.dryRun !== false,
          reason: optionalString(args.reason),
          source: 'phase6_governance_ui',
          payloadJson: JSON.stringify({
            jobType,
            scope: normalizeDeletionScope(optionalString(args.scope)),
            targetEntityType: optionalString(args.targetEntityType),
            targetEntityId: optionalString(args.targetEntityId),
            dryRun: args.dryRun !== false,
            reason: optionalString(args.reason),
          }),
        }),
      ),
    )

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_deletion_job_request',
      entityId: jobId,
      entityType: 'deletion_job',
      userId,
      afterJson: JSON.stringify({ jobId, jobType, status, scheduledAt, dryRun: args.dryRun !== false }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', recordedAt: now }),
    })

    return { ok: true, jobId, status }
  },
})

export const updateDeletionJobStatus = mutation({
  args: {
    jobId: v.string(),
    status: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()
    const job = await getOwnedDocOrThrow(db, 'deletionJobs', args.jobId, userId)
    const status = normalizeDeletionJobStatus(optionalString(args.status))

    await db.patch(
      job._id,
      compactObject({
        status,
        updatedAt: now,
        startedAt: status === 'running' ? numberOr((job as any).startedAt, now) || now : undefined,
        completedAt: status === 'completed' ? now : undefined,
        cancelledAt: status === 'cancelled' ? now : undefined,
        failedAt: status === 'failed' ? now : undefined,
        note: optionalString(args.note) ?? optionalString((job as any).note),
      }),
    )

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_deletion_job_status_update',
      entityId: args.jobId,
      entityType: 'deletion_job',
      userId,
      beforeJson: JSON.stringify(job),
      afterJson: JSON.stringify({ status, updatedAt: now }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', recordedAt: now }),
    })

    return { ok: true, jobId: args.jobId, status }
  },
})

export const runAccountDataErasureNow = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    confirmationText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()
    const dryRun = args.dryRun !== false
    const ownerKey = `clerk:${userId}`

    if (!dryRun) {
      const confirmationText = (args.confirmationText ?? '').trim()
      if (confirmationText !== PHASE_SIX_ACCOUNT_ERASURE_CONFIRMATION) {
        throw new Error(`Type "${PHASE_SIX_ACCOUNT_ERASURE_CONFIRMATION}" to confirm account data erasure`)
      }
    }

    const userTableDocs = await Promise.all(
      PHASE_SIX_ACCOUNT_ERASURE_USER_TABLES.map(async (table) => ({
        table,
        rows: await collectUserDocs(db, table, userId),
      })),
    )

    const ownerKeyTableDocs = await Promise.all(
      PHASE_SIX_ACCOUNT_ERASURE_OWNER_KEY_TABLES.map(async (table) => {
        const rows = await safeCollectDocs(db, table)
        return {
          table,
          rows: rows.filter((row: any) => optionalString((row as any).ownerKey) === ownerKey),
        }
      }),
    )

    const exportStorageIds = new Set<string>()
    for (const entry of userTableDocs) {
      if (entry.table !== 'userExportDownloads' && entry.table !== 'userExports') continue
      for (const row of entry.rows) {
        const storageId = optionalString((row as any).storageId)
        if (storageId) exportStorageIds.add(storageId)
      }
    }

    const candidatesByUserTable = Object.fromEntries(
      userTableDocs.map((entry) => [entry.table, entry.rows.length]),
    ) as Record<string, number>
    const candidatesByOwnerKeyTable = Object.fromEntries(
      ownerKeyTableDocs.map((entry) => [entry.table, entry.rows.length]),
    ) as Record<string, number>

    const candidatesTotalRows =
      Object.values(candidatesByUserTable).reduce((sum, value) => sum + value, 0) +
      Object.values(candidatesByOwnerKeyTable).reduce((sum, value) => sum + value, 0)

    // For final erasure runs, write an ephemeral audit receipt and delete it before returning.
    let ephemeralAuditReceiptId: any = null
    if (!dryRun) {
      try {
        ephemeralAuditReceiptId = await db.insert(
          'financeAuditEvents',
          compactObject({
            action: 'phase6_account_data_erasure_execute',
            entityId: userId,
            entityType: 'account_data_erasure',
            userId,
            createdAt: now,
            metadataJson: JSON.stringify({
              source: 'phase6_governance_tab',
              recordedAt: now,
              willBeDeletedByErasure: true,
            }),
            afterJson: JSON.stringify({
              dryRun: false,
              ownerKey,
              candidateRowCount: candidatesTotalRows,
              candidateStorageFiles: exportStorageIds.size,
            }),
          }),
        )
      } catch {
        ephemeralAuditReceiptId = null
      }
    }

    const deletedByUserTable = Object.fromEntries(
      PHASE_SIX_ACCOUNT_ERASURE_USER_TABLES.map((table) => [table, 0]),
    ) as Record<string, number>
    const deletedByOwnerKeyTable = Object.fromEntries(
      PHASE_SIX_ACCOUNT_ERASURE_OWNER_KEY_TABLES.map((table) => [table, 0]),
    ) as Record<string, number>
    let deletedStorageFiles = 0

    if (!dryRun) {
      for (const storageId of exportStorageIds) {
        try {
          await ctx.storage.delete(storageId as any)
          deletedStorageFiles += 1
        } catch {
          // Ignore missing files.
        }
      }

      // Delete user-owned docs first, then ownerKey docs.
      for (const entry of userTableDocs) {
        for (const row of entry.rows) {
          try {
            await db.delete((row as any)._id)
            deletedByUserTable[entry.table] += 1
          } catch {
            // Ignore already-deleted docs.
          }
        }
      }

      for (const entry of ownerKeyTableDocs) {
        for (const row of entry.rows) {
          try {
            await db.delete((row as any)._id)
            deletedByOwnerKeyTable[entry.table] += 1
          } catch {
            // Ignore already-deleted docs.
          }
        }
      }

      if (ephemeralAuditReceiptId) {
        try {
          await db.delete(ephemeralAuditReceiptId)
        } catch {
          // Ignore if the finance audit table rows were already removed.
        }
      }
    } else {
      await recordFinanceAuditEventSafe(db, {
        action: 'phase6_account_data_erasure_dry_run',
        entityId: userId,
        entityType: 'account_data_erasure',
        userId,
        afterJson: JSON.stringify({
          ownerKey,
          candidateRowCount: candidatesTotalRows,
          candidateStorageFiles: exportStorageIds.size,
        }),
        metadataJson: JSON.stringify({
          source: 'phase6_governance_tab',
          dryRun: true,
          recordedAt: now,
        }),
      })
    }

    const deletedTotalRows =
      Object.values(deletedByUserTable).reduce((sum, value) => sum + value, 0) +
      Object.values(deletedByOwnerKeyTable).reduce((sum, value) => sum + value, 0)

    return {
      ok: true,
      mode: 'account_data_erasure',
      dryRun,
      userId,
      ownerKey,
      confirmationRequiredPhrase: PHASE_SIX_ACCOUNT_ERASURE_CONFIRMATION,
      candidates: {
        totalRows: candidatesTotalRows,
        storageFiles: exportStorageIds.size,
        byUserTable: candidatesByUserTable,
        byOwnerKeyTable: candidatesByOwnerKeyTable,
      },
      deleted: {
        totalRows: deletedTotalRows,
        storageFiles: deletedStorageFiles,
        byUserTable: deletedByUserTable,
        byOwnerKeyTable: deletedByOwnerKeyTable,
      },
      touchedTables: [
        ...PHASE_SIX_ACCOUNT_ERASURE_USER_TABLES,
        ...PHASE_SIX_ACCOUNT_ERASURE_OWNER_KEY_TABLES,
      ],
      note: dryRun
        ? 'Dry run only. No data was removed.'
        : 'User-scoped rows and export storage artifacts were removed. Global reference tables were preserved.',
    }
  },
})

export const updateConsentSettings = mutation({
  args: {
    analyticsEnabled: v.optional(v.boolean()),
    diagnosticsEnabled: v.optional(v.boolean()),
    version: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const db = ctx.db as any
    const now = Date.now()

    const existing = await findUserDoc(db, 'consentSettings', userId)
    const previous = normalizeConsentSettings(existing)
    const next = {
      analyticsEnabled: args.analyticsEnabled ?? previous.analyticsEnabled,
      diagnosticsEnabled: args.diagnosticsEnabled ?? previous.diagnosticsEnabled,
    }

    let consentSettingsId = ''
    if (existing) {
      await db.patch(existing._id, {
        analyticsEnabled: next.analyticsEnabled,
        diagnosticsEnabled: next.diagnosticsEnabled,
        updatedAt: now,
      })
      consentSettingsId = String(existing._id)
    } else {
      consentSettingsId = String(
        await db.insert('consentSettings', {
          userId,
          analyticsEnabled: next.analyticsEnabled,
          diagnosticsEnabled: next.diagnosticsEnabled,
          updatedAt: now,
        }),
      )
    }

    const consentVersion = optionalString(args.version) ?? 'v2'
    const changedEntries: Array<{ consentType: string; enabled: boolean }> = []
    if (next.analyticsEnabled !== previous.analyticsEnabled) {
      changedEntries.push({ consentType: 'analytics', enabled: next.analyticsEnabled })
    }
    if (next.diagnosticsEnabled !== previous.diagnosticsEnabled) {
      changedEntries.push({ consentType: 'diagnostics', enabled: next.diagnosticsEnabled })
    }

    for (const entry of changedEntries) {
      await db.insert(
        'consentLogs',
        compactObject({
          userId,
          consentType: entry.consentType,
          enabled: entry.enabled,
          version: consentVersion,
          reason: optionalString(args.reason),
          createdAt: now,
        }),
      )
    }

    await recordFinanceAuditEventSafe(db, {
      action: 'phase6_consent_settings_update',
      entityId: consentSettingsId,
      entityType: 'consent_settings',
      userId,
      beforeJson: JSON.stringify(previous),
      afterJson: JSON.stringify({ ...next, updatedAt: now }),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', changedEntries, version: consentVersion, recordedAt: now }),
    })

    return {
      ok: true,
      consentSettingsId,
      changedConsentCount: changedEntries.length,
      settings: {
        id: consentSettingsId,
        ...next,
        updatedAt: now,
      },
    }
  },
})

export const runRetentionCleanupNow = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const dryRun = args.dryRun !== false
    const summary = await executePhaseSixRetentionSweep(ctx as any, {
      dryRun,
      userIdFilter: userId,
      source: 'phase6_governance_manual',
    })

    await recordFinanceAuditEventSafe((ctx.db as any), {
      action: 'phase6_retention_cleanup_run',
      entityId: userId,
      entityType: 'retention_cleanup',
      userId,
      afterJson: JSON.stringify(summary),
      metadataJson: JSON.stringify({ source: 'phase6_governance_tab', dryRun, recordedAt: Date.now() }),
    })

    return {
      ok: true,
      ...summary,
    }
  },
})

export const phaseSixRetentionSweep = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await executePhaseSixRetentionSweep(ctx as any, {
      dryRun: args.dryRun === true,
      source: optionalString(args.source) ?? 'phase6_retention_cron',
    })
  },
})

export const getExportDownloadHttpPayload = internalQuery({
  args: {
    downloadId: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any
    const rows = await safeCollectDocs(db, 'userExportDownloads')
    const row = rows.find((doc: any) => String(doc?._id) === args.downloadId)
    if (!row) return { ok: false, reason: 'not_found' as const }

    const token = optionalString((row as any).downloadToken)
    if (!token || token !== args.token) {
      return { ok: false, reason: 'invalid_token' as const }
    }
    const status = normalizeExportDownloadStatus(optionalString((row as any).status))
    if (status !== 'ready') {
      return { ok: false, reason: 'not_ready' as const, status }
    }
    const expiresAt = numberOr((row as any).expiresAt, 0) || null
    if (expiresAt && expiresAt < Date.now()) {
      return { ok: false, reason: 'expired' as const, status }
    }

    const storageId = optionalString((row as any).storageId)
    if (!storageId) {
      return { ok: false, reason: 'missing_storage' as const, status }
    }

    return {
      ok: true,
      reason: 'ok' as const,
      downloadId: String((row as any)._id),
      storageId,
      filename: optionalString((row as any).filename) ?? 'finance-export.bin',
      contentType: optionalString((row as any).contentType) ?? inferExportContentType(optionalString((row as any).format) ?? 'json'),
      status,
      expiresAt,
      userId: optionalString((row as any).userId) ?? null,
    }
  },
})

export const recordExportDownloadAccess = internalMutation({
  args: {
    downloadId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as any
    const rows = await safeCollectDocs(db, 'userExportDownloads')
    const row = rows.find((doc: any) => String(doc?._id) === args.downloadId)
    if (!row) return { ok: false }
    const now = Date.now()
    await db.patch(row._id, {
      lastDownloadedAt: now,
      updatedAt: now,
      downloadCount: Math.max(0, Math.trunc(numberOr((row as any).downloadCount))) + 1,
    })
    return { ok: true, downloadId: args.downloadId }
  },
})

function normalizeExportRequest(row: any) {
  const payload = safeParseJsonObject((row as any).payloadJson) ?? {}
  return {
    id: String(row._id),
    exportKind: normalizeExportKind(optionalString((row as any).exportKind) ?? optionalString((payload as any).exportKind)),
    format: normalizeExportFormat(optionalString((row as any).format) ?? optionalString((payload as any).format)),
    scope: normalizeExportScope(optionalString((row as any).scope) ?? optionalString((payload as any).scope)),
    status: normalizeExportRequestStatus(optionalString((row as any).status)),
    includeAuditTrail: Boolean((row as any).includeAuditTrail ?? (payload as any).includeAuditTrail ?? true),
    includeDeletedArtifacts: Boolean((row as any).includeDeletedArtifacts ?? (payload as any).includeDeletedArtifacts ?? false),
    note: optionalString((row as any).note) ?? optionalString((payload as any).note) ?? '',
    requestedAt: Math.trunc(numberOr((row as any).requestedAt ?? (row as any).createdAt ?? (row as any)._creationTime)),
    updatedAt: Math.trunc(numberOr((row as any).updatedAt ?? (row as any).requestedAt ?? (row as any)._creationTime)),
    completedAt: numberOr((row as any).completedAt, 0) || null,
    latestFilename: optionalString((row as any).latestFilename) ?? '',
    latestExpiresAt: numberOr((row as any).latestExpiresAt, 0) || null,
  }
}

function normalizeExportDownload(row: any) {
  const payload = safeParseJsonObject((row as any).payloadJson) ?? {}
  const downloadToken = optionalString((row as any).downloadToken) ?? ''
  const id = String(row._id)
  return {
    id,
    exportId: optionalString((row as any).exportId) ?? optionalString((row as any).requestId) ?? optionalString((payload as any).exportId) ?? '',
    status: normalizeExportDownloadStatus(optionalString((row as any).status)),
    filename: optionalString((row as any).filename) ?? optionalString((payload as any).filename) ?? 'export.bin',
    format: normalizeExportFormat(optionalString((row as any).format) ?? optionalString((payload as any).format)),
    byteSize: Math.max(0, Math.trunc(numberOr((row as any).byteSize ?? (payload as any).byteSize))),
    checksumSha256: optionalString((row as any).checksumSha256) ?? optionalString((payload as any).checksumSha256) ?? '',
    contentType: optionalString((row as any).contentType) ?? optionalString((payload as any).contentType) ?? '',
    expiresAt: numberOr((row as any).expiresAt, 0) || null,
    createdAt: Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime)),
    updatedAt: Math.trunc(numberOr((row as any).updatedAt ?? (row as any).createdAt ?? (row as any)._creationTime)),
    downloadToken,
    downloadUrlPath: downloadToken ? `/governance/export-download?downloadId=${encodeURIComponent(id)}&token=${encodeURIComponent(downloadToken)}` : '',
    downloadCount: Math.max(0, Math.trunc(numberOr((row as any).downloadCount))),
    lastDownloadedAt: numberOr((row as any).lastDownloadedAt, 0) || null,
  }
}

function normalizeRetentionPolicy(row: any) {
  return {
    id: String(row._id),
    policyKey: optionalString((row as any).policyKey) ?? 'unknown',
    retentionDays: clampInt(numberOr((row as any).retentionDays, 0), 0, 3650),
    enabled: Boolean((row as any).enabled ?? true),
    updatedAt: numberOr((row as any).updatedAt ?? (row as any)._creationTime, 0) || null,
    source: 'db',
  }
}

function mergeRetentionPolicyDefaults(rows: Array<ReturnType<typeof normalizeRetentionPolicy>>) {
  const byKey = new Map(rows.map((row) => [row.policyKey, row]))
  const merged = [...rows]
  for (const def of PHASE_SIX_RETENTION_DEFAULTS) {
    if (byKey.has(def.policyKey)) continue
    merged.push({
      id: `default-${def.policyKey}`,
      policyKey: def.policyKey,
      retentionDays: def.retentionDays,
      enabled: def.enabled,
      updatedAt: null,
      source: 'default',
    })
  }
  return merged.sort((a, b) => a.policyKey.localeCompare(b.policyKey))
}

function normalizeDeletionJob(row: any) {
  const payload = safeParseJsonObject((row as any).payloadJson) ?? {}
  return {
    id: String(row._id),
    jobType: normalizeDeletionJobType(optionalString((row as any).jobType) ?? optionalString((payload as any).jobType)),
    scope: normalizeDeletionScope(optionalString((row as any).scope) ?? optionalString((payload as any).scope)),
    targetEntityType: optionalString((row as any).targetEntityType) ?? optionalString((payload as any).targetEntityType) ?? '',
    targetEntityId: optionalString((row as any).targetEntityId) ?? optionalString((payload as any).targetEntityId) ?? '',
    status: normalizeDeletionJobStatus(optionalString((row as any).status)),
    dryRun: Boolean((row as any).dryRun ?? (payload as any).dryRun ?? true),
    reason: optionalString((row as any).reason) ?? optionalString((payload as any).reason) ?? '',
    requestedAt: numberOr((row as any).requestedAt ?? (row as any).createdAt ?? (row as any)._creationTime, 0) || null,
    scheduledAt: numberOr((row as any).scheduledAt, 0) || null,
    startedAt: numberOr((row as any).startedAt, 0) || null,
    completedAt: numberOr((row as any).completedAt, 0) || null,
    updatedAt: Math.trunc(numberOr((row as any).updatedAt ?? (row as any).createdAt ?? (row as any)._creationTime)),
    note: optionalString((row as any).note) ?? '',
  }
}

function normalizeConsentSettings(row: any) {
  if (!row) {
    return {
      id: null,
      analyticsEnabled: false,
      diagnosticsEnabled: false,
      updatedAt: null,
    }
  }
  return {
    id: String(row._id),
    analyticsEnabled: Boolean((row as any).analyticsEnabled ?? false),
    diagnosticsEnabled: Boolean((row as any).diagnosticsEnabled ?? false),
    updatedAt: numberOr((row as any).updatedAt ?? (row as any)._creationTime, 0) || null,
  }
}

function normalizeConsentLog(row: any) {
  return {
    id: String(row._id),
    consentType: optionalString((row as any).consentType) ?? 'unknown',
    enabled: Boolean((row as any).enabled),
    version: optionalString((row as any).version) ?? 'v1',
    reason: optionalString((row as any).reason) ?? '',
    createdAt: Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime)),
  }
}

function normalizeAuditRow(row: any) {
  const metadataParsed = safeParseJsonObject((row as any).metadataJson)
  const beforeParsed = safeParseJsonObject((row as any).beforeJson)
  const afterParsed = safeParseJsonObject((row as any).afterJson)
  return {
    id: String(row._id),
    action: optionalString((row as any).action) ?? 'unknown',
    entityType: optionalString((row as any).entityType) ?? '',
    entityId: optionalString((row as any).entityId) ?? '',
    createdAt: Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime)),
    userId: optionalString((row as any).userId) ?? '',
    source:
      optionalString((metadataParsed as any)?.source) ??
      optionalString((metadataParsed as any)?.phase) ??
      'unknown',
    metadataJson: sanitizeJsonPreview((row as any).metadataJson),
    beforeJson: sanitizeJsonPreview((row as any).beforeJson),
    afterJson: sanitizeJsonPreview((row as any).afterJson),
    metadataSummary: summarizeAuditMetadata(metadataParsed),
    beforeSummary: summarizeAuditChange(beforeParsed),
    afterSummary: summarizeAuditChange(afterParsed),
  }
}

function summarizeAuditMetadata(value: Record<string, unknown> | null) {
  if (!value) return ''
  const keys = Object.keys(value).slice(0, 5)
  return keys.join(', ')
}

function summarizeAuditChange(value: Record<string, unknown> | null) {
  if (!value) return ''
  const keys = Object.keys(value).slice(0, 6)
  return keys.join(', ')
}

function sanitizeJsonPreview(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.length > 1500 ? `${trimmed.slice(0, 1500)}…` : trimmed
}

function normalizeExportKind(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'gdpr_bundle' || normalized === 'gdpr') return 'gdpr_bundle'
  if (normalized === 'transactions') return 'transactions'
  if (normalized === 'ledger') return 'ledger'
  if (normalized === 'audit') return 'audit'
  return 'full_account'
}

function normalizeExportFormat(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'json') return 'json'
  if (normalized === 'csv') return 'csv'
  if (normalized === 'zip') return 'zip'
  return 'json'
}

function normalizeExportScope(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'finance_only') return 'finance_only'
  if (normalized === 'privacy_only') return 'privacy_only'
  if (normalized === 'audit_only') return 'audit_only'
  return 'full_account'
}

function normalizeExportRequestStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'processing') return 'processing'
  if (normalized === 'ready') return 'ready'
  if (normalized === 'failed') return 'failed'
  if (normalized === 'cancelled') return 'cancelled'
  return 'requested'
}

function normalizeExportDownloadStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'expired') return 'expired'
  if (normalized === 'revoked') return 'revoked'
  return 'ready'
}

function normalizeDeletionJobType(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'hard_delete') return 'hard_delete'
  if (normalized === 'retention_cleanup') return 'retention_cleanup'
  if (normalized === 'export_cleanup') return 'export_cleanup'
  return 'account_erasure'
}

function normalizeDeletionScope(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'single_record') return 'single_record'
  if (normalized === 'exports_only') return 'exports_only'
  if (normalized === 'audit_only') return 'audit_only'
  return 'account'
}

function normalizeDeletionJobStatus(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'scheduled') return 'scheduled'
  if (normalized === 'running') return 'running'
  if (normalized === 'completed') return 'completed'
  if (normalized === 'failed') return 'failed'
  if (normalized === 'cancelled') return 'cancelled'
  return 'requested'
}

function buildExportFilename({ exportKind, scope, format, now }: { exportKind: string; scope: string; format: string; now: number }) {
  const iso = new Date(now).toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z')
  const ext = format === 'zip' ? 'zip' : format === 'csv' ? 'csv' : 'json'
  return `finance-${exportKind}-${scope}-${iso}.${ext}`
}

function inferExportContentType(format: string) {
  if (format === 'csv') return 'text/csv'
  if (format === 'zip') return 'application/zip'
  return 'application/json'
}

function sortByUpdatedDesc(a: any, b: any) {
  return (
    numberOr((b as any)?.updatedAt ?? (b as any)?.createdAt ?? (b as any)?._creationTime) -
    numberOr((a as any)?.updatedAt ?? (a as any)?.createdAt ?? (a as any)?._creationTime)
  )
}

function sortDeletionJobs(a: any, b: any) {
  const statusWeight = (status: string) => {
    if (status === 'running') return 0
    if (status === 'scheduled') return 1
    if (status === 'requested') return 2
    if (status === 'failed') return 3
    if (status === 'completed') return 4
    return 5
  }
  const aStatus = statusWeight(normalizeDeletionJobStatus(optionalString((a as any).status)))
  const bStatus = statusWeight(normalizeDeletionJobStatus(optionalString((b as any).status)))
  if (aStatus !== bStatus) return aStatus - bStatus
  return sortByUpdatedDesc(a, b)
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
  const rows = await collectUserDocs(db, table, userId)
  if (rows.length === 0) return null
  return rows.slice().sort(sortByUpdatedDesc)[0] ?? null
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

async function executePhaseSixRetentionSweep(
  ctx: { db: any; storage: any },
  options: {
    dryRun: boolean
    userIdFilter?: string
    source: string
  },
) {
  const db = ctx.db as any
  const now = Date.now()

  const [retentionPolicies, userExportDownloads, userExports, deletionJobs, consentLogs, financeAuditEvents] =
    await Promise.all([
      safeCollectDocs(db, 'retentionPolicies'),
      safeCollectDocs(db, 'userExportDownloads'),
      safeCollectDocs(db, 'userExports'),
      safeCollectDocs(db, 'deletionJobs'),
      safeCollectDocs(db, 'consentLogs'),
      safeCollectDocs(db, 'financeAuditEvents'),
    ])

  const scopedUserIds = Array.from(
    new Set(
      [
        ...retentionPolicies.map((row: any) => optionalString(row.userId)),
        ...userExportDownloads.map((row: any) => optionalString(row.userId)),
        ...userExports.map((row: any) => optionalString(row.userId)),
        ...deletionJobs.map((row: any) => optionalString(row.userId)),
        ...consentLogs.map((row: any) => optionalString(row.userId)),
        ...financeAuditEvents.map((row: any) => optionalString(row.userId)),
      ].filter(Boolean) as string[],
    ),
  )
    .filter((userId) => !options.userIdFilter || userId === options.userIdFilter)
    .sort((a, b) => a.localeCompare(b))

  const summary = {
    dryRun: options.dryRun,
    source: options.source,
    userCount: scopedUserIds.length,
    deleted: {
      userExportDownloads: 0,
      userExports: 0,
      deletionJobs: 0,
      consentLogs: 0,
      financeAuditEvents: 0,
      storageFiles: 0,
    },
    candidates: {
      userExportDownloads: 0,
      userExports: 0,
      deletionJobs: 0,
      consentLogs: 0,
      financeAuditEvents: 0,
      storageFiles: 0,
    },
    perUser: [] as Array<{
      userId: string
      deleted: Record<string, number>
      candidates: Record<string, number>
      appliedPolicies: Array<{ policyKey: string; retentionDays: number; enabled: boolean }>
    }>,
  }

  for (const userId of scopedUserIds) {
    const mergedPolicies = mergeRetentionPolicyDefaults(
      retentionPolicies
        .filter((row: any) => optionalString((row as any).userId) === userId)
        .map((row: any) => normalizeRetentionPolicy(row)),
    )
    const policyByKey = new Map(mergedPolicies.map((row) => [row.policyKey, row]))

    const userDownloads = userExportDownloads.filter((row: any) => optionalString((row as any).userId) === userId)
    const userExportRequests = userExports.filter((row: any) => optionalString((row as any).userId) === userId)
    const userDeletionJobs = deletionJobs.filter((row: any) => optionalString((row as any).userId) === userId)
    const userConsentLogs = consentLogs.filter((row: any) => optionalString((row as any).userId) === userId)
    const userAuditRows = financeAuditEvents.filter((row: any) => optionalString((row as any).userId) === userId)

    const userCandidateDocs = {
      userExportDownloads: [] as any[],
      userExports: [] as any[],
      deletionJobs: [] as any[],
      consentLogs: [] as any[],
      financeAuditEvents: [] as any[],
    }
    const storageIdsToDelete = new Set<string>()

    const exportsPolicy = policyByKey.get('exports')
    if (exportsPolicy?.enabled) {
      const cutoff = now - exportsPolicy.retentionDays * 24 * 60 * 60 * 1000
      for (const row of userDownloads) {
        const createdAt = Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime))
        const expiresAt = numberOr((row as any).expiresAt, 0) || null
        if ((expiresAt && expiresAt <= now) || createdAt <= cutoff) {
          userCandidateDocs.userExportDownloads.push(row)
          const storageId = optionalString((row as any).storageId)
          if (storageId) storageIdsToDelete.add(storageId)
        }
      }
      for (const row of userExportRequests) {
        const createdAt = Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime))
        const status = normalizeExportRequestStatus(optionalString((row as any).status))
        if (!['ready', 'failed', 'cancelled'].includes(status)) continue
        if (createdAt <= cutoff) userCandidateDocs.userExports.push(row)
      }
    }

    const deletionPolicy = policyByKey.get('deletion_jobs')
    if (deletionPolicy?.enabled) {
      const cutoff = now - deletionPolicy.retentionDays * 24 * 60 * 60 * 1000
      for (const row of userDeletionJobs) {
        const createdAt = Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime))
        const status = normalizeDeletionJobStatus(optionalString((row as any).status))
        if (!['completed', 'failed', 'cancelled'].includes(status)) continue
        if (createdAt <= cutoff) userCandidateDocs.deletionJobs.push(row)
      }
    }

    const consentPolicy = policyByKey.get('consent_logs')
    if (consentPolicy?.enabled) {
      const cutoff = now - consentPolicy.retentionDays * 24 * 60 * 60 * 1000
      for (const row of userConsentLogs) {
        const createdAt = Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime))
        if (createdAt <= cutoff) userCandidateDocs.consentLogs.push(row)
      }
    }

    const auditPolicy = policyByKey.get('finance_audit_events')
    if (auditPolicy?.enabled) {
      const cutoff = now - auditPolicy.retentionDays * 24 * 60 * 60 * 1000
      for (const row of userAuditRows) {
        const createdAt = Math.trunc(numberOr((row as any).createdAt ?? (row as any)._creationTime))
        if (createdAt <= cutoff) userCandidateDocs.financeAuditEvents.push(row)
      }
    }

    const userCandidateCounts = {
      userExportDownloads: userCandidateDocs.userExportDownloads.length,
      userExports: userCandidateDocs.userExports.length,
      deletionJobs: userCandidateDocs.deletionJobs.length,
      consentLogs: userCandidateDocs.consentLogs.length,
      financeAuditEvents: userCandidateDocs.financeAuditEvents.length,
      storageFiles: storageIdsToDelete.size,
    }
    summary.candidates.userExportDownloads += userCandidateCounts.userExportDownloads
    summary.candidates.userExports += userCandidateCounts.userExports
    summary.candidates.deletionJobs += userCandidateCounts.deletionJobs
    summary.candidates.consentLogs += userCandidateCounts.consentLogs
    summary.candidates.financeAuditEvents += userCandidateCounts.financeAuditEvents
    summary.candidates.storageFiles += userCandidateCounts.storageFiles

    const userDeletedCounts = {
      userExportDownloads: 0,
      userExports: 0,
      deletionJobs: 0,
      consentLogs: 0,
      financeAuditEvents: 0,
      storageFiles: 0,
    }

    if (!options.dryRun) {
      for (const storageId of storageIdsToDelete) {
        try {
          await ctx.storage.delete(storageId as any)
          userDeletedCounts.storageFiles += 1
        } catch {
          // Ignore missing storage files.
        }
      }
      for (const row of userCandidateDocs.userExportDownloads) {
        try {
          await db.delete((row as any)._id)
          userDeletedCounts.userExportDownloads += 1
        } catch {
          // Ignore already deleted rows.
        }
      }
      for (const row of userCandidateDocs.userExports) {
        try {
          await db.delete((row as any)._id)
          userDeletedCounts.userExports += 1
        } catch {
          // Ignore already deleted rows.
        }
      }
      for (const row of userCandidateDocs.deletionJobs) {
        try {
          await db.delete((row as any)._id)
          userDeletedCounts.deletionJobs += 1
        } catch {
          // Ignore already deleted rows.
        }
      }
      for (const row of userCandidateDocs.consentLogs) {
        try {
          await db.delete((row as any)._id)
          userDeletedCounts.consentLogs += 1
        } catch {
          // Ignore already deleted rows.
        }
      }
      for (const row of userCandidateDocs.financeAuditEvents) {
        try {
          await db.delete((row as any)._id)
          userDeletedCounts.financeAuditEvents += 1
        } catch {
          // Ignore already deleted rows.
        }
      }
    }

    summary.deleted.userExportDownloads += userDeletedCounts.userExportDownloads
    summary.deleted.userExports += userDeletedCounts.userExports
    summary.deleted.deletionJobs += userDeletedCounts.deletionJobs
    summary.deleted.consentLogs += userDeletedCounts.consentLogs
    summary.deleted.financeAuditEvents += userDeletedCounts.financeAuditEvents
    summary.deleted.storageFiles += userDeletedCounts.storageFiles

    const totalCandidateForUser =
      userCandidateCounts.userExportDownloads +
      userCandidateCounts.userExports +
      userCandidateCounts.deletionJobs +
      userCandidateCounts.consentLogs +
      userCandidateCounts.financeAuditEvents

    if (!options.dryRun && totalCandidateForUser > 0) {
      try {
        await db.insert(
          'deletionJobs',
          compactObject({
            userId,
            jobType: 'retention_cleanup',
            scope: 'account',
            status: 'completed',
            dryRun: false,
            requestedAt: now,
            startedAt: now,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
            reason: 'Automated retention policy cleanup',
            source: options.source,
            payloadJson: JSON.stringify({
              deleted: userDeletedCounts,
              candidates: userCandidateCounts,
              policies: mergedPolicies.map((row) => ({
                policyKey: row.policyKey,
                retentionDays: row.retentionDays,
                enabled: row.enabled,
              })),
            }),
          }),
        )
      } catch {
        // Non-blocking for schema variance.
      }
      await recordFinanceAuditEventSafe(db, {
        action: 'phase6_retention_cleanup_execute',
        entityId: userId,
        entityType: 'retention_cleanup',
        userId,
        afterJson: JSON.stringify({
          deleted: userDeletedCounts,
          candidates: userCandidateCounts,
          source: options.source,
        }),
        metadataJson: JSON.stringify({ source: options.source, dryRun: false, recordedAt: now }),
      })
    }

    summary.perUser.push({
      userId,
      deleted: userDeletedCounts,
      candidates: userCandidateCounts,
      appliedPolicies: mergedPolicies.map((row) => ({
        policyKey: row.policyKey,
        retentionDays: row.retentionDays,
        enabled: row.enabled,
      })),
    })
  }

  return summary
}

async function buildRealUserExportBundle(
  db: any,
  args: {
    userId: string
    exportKind: string
    scope: string
    includeAuditTrail: boolean
    includeDeletedArtifacts: boolean
    requestedAt: number
  },
) {
  const tableNames = resolveExportTableNames({
    exportKind: args.exportKind,
    scope: args.scope,
    includeAuditTrail: args.includeAuditTrail,
  })
  const tables: Array<{ table: string; rowCount: number; rows: any[] }> = []

  for (const table of tableNames) {
    const rows = await collectUserDocs(db, table, args.userId)
    const sanitizedRows = rows.map((row) => sanitizeExportRow(table, row))
    tables.push({
      table,
      rowCount: sanitizedRows.length,
      rows: sanitizedRows,
    })
  }

  const totalRows = tables.reduce((sum, table) => sum + table.rowCount, 0)
  return {
    version: 'phase6-export-v1',
    generatedAt: args.requestedAt,
    userId: args.userId,
    exportKind: args.exportKind,
    scope: args.scope,
    includeAuditTrail: args.includeAuditTrail,
    includeDeletedArtifacts: args.includeDeletedArtifacts,
    summary: {
      tableCount: tables.length,
      totalRows,
    },
    tables,
  }
}

function resolveExportTableNames({
  exportKind,
  scope,
  includeAuditTrail,
}: {
  exportKind: string
  scope: string
  includeAuditTrail: boolean
}) {
  const baseScope = PHASE_SIX_EXPORT_SCOPE_TABLES[(scope as keyof typeof PHASE_SIX_EXPORT_SCOPE_TABLES)] ?? PHASE_SIX_EXPORT_SCOPE_TABLES.full_account
  let selected = [...baseScope]
  if (exportKind === 'transactions') {
    selected = ['purchases', 'purchaseSplits', 'ledgerEntries', 'ledgerLines']
  } else if (exportKind === 'ledger') {
    selected = ['ledgerEntries', 'ledgerLines']
  } else if (exportKind === 'audit') {
    selected = ['financeAuditEvents']
  } else if (exportKind === 'gdpr_bundle') {
    selected = Array.from(
      new Set([
        ...PHASE_SIX_EXPORT_SCOPE_TABLES.full_account,
        'consentSettings',
        'consentLogs',
        'retentionPolicies',
        'deletionJobs',
      ]),
    )
  }

  if (!includeAuditTrail) {
    selected = selected.filter((name) => name !== 'financeAuditEvents')
  }

  return Array.from(new Set(selected))
}

function sanitizeExportRow(table: string, row: any) {
  const clone = JSON.parse(JSON.stringify(row))
  if (table === 'userExportDownloads' && isRecord(clone)) {
    delete (clone as any).downloadToken
  }
  return clone
}

function serializeExportBundle({
  bundle,
  exportKind,
  scope,
  requestedFormat,
}: {
  bundle: Awaited<ReturnType<typeof buildRealUserExportBundle>>
  exportKind: string
  scope: string
  requestedFormat: string
}) {
  if (requestedFormat === 'zip') {
    throw new Error('ZIP export generation is not implemented yet; use JSON or CSV.')
  }

  if (requestedFormat === 'csv') {
    const csv = stringifyExportBundleAsCsv(bundle)
    const bytes = new TextEncoder().encode(csv)
    return {
      bytes,
      byteLength: bytes.byteLength,
      contentType: 'text/csv; charset=utf-8',
      actualFormat: 'csv',
      exportKind,
      scope,
    }
  }

  const json = JSON.stringify(bundle, null, 2)
  const bytes = new TextEncoder().encode(json)
  return {
    bytes,
    byteLength: bytes.byteLength,
    contentType: 'application/json; charset=utf-8',
    actualFormat: 'json',
    exportKind,
    scope,
  }
}

function stringifyExportBundleAsCsv(bundle: Awaited<ReturnType<typeof buildRealUserExportBundle>>) {
  const lines = [
    [
      'table',
      'row_id',
      'created_at',
      'updated_at',
      'user_id',
      'entity_type',
      'entity_id',
      'action',
      'status',
      'json',
    ].join(','),
  ]
  for (const table of bundle.tables) {
    for (const row of table.rows) {
      const record = isRecord(row) ? row : { value: row }
      const rowId = String((record as any)._id ?? '')
      const createdAt = numberOr((record as any).createdAt ?? (record as any)._creationTime, 0) || ''
      const updatedAt = numberOr((record as any).updatedAt, 0) || ''
      const userId = optionalString((record as any).userId) ?? ''
      const entityType = optionalString((record as any).entityType) ?? ''
      const entityId = optionalString((record as any).entityId) ?? ''
      const action = optionalString((record as any).action) ?? ''
      const status =
        optionalString((record as any).status) ??
        optionalString((record as any).latestDownloadStatus) ??
        ''
      const json = JSON.stringify(record)
      lines.push(
        [
          table.table,
          rowId,
          createdAt,
          updatedAt,
          userId,
          entityType,
          entityId,
          action,
          status,
          json,
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return lines.join('\n')
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function createSignedDownloadToken() {
  const random = crypto.randomUUID().replace(/-/g, '')
  const nonce = Math.random().toString(36).slice(2, 12)
  return `${random}${nonce}`
}

function parseAuditTimestamp(value: unknown) {
  const numeric = numberOr(value, Number.NaN)
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : undefined
}

async function safeCollectDocs(db: any, table: string): Promise<any[]> {
  return await sharedSafeCollectDocs(db, table)
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

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
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
