import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Reconstructed from a Convex dry-run index diff catalog + dev snapshot export.
// Runtime validation is disabled intentionally until the original typed schema is restored.

export default defineSchema({
  accountReconciliationChecks: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_accountId_cycleMonth", ["userId", "accountId", "cycleMonth"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_cycleMonth_createdAt", ["userId", "cycleMonth", "createdAt"]),

  accounts: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  accountTransfers: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_destinationAccountId_createdAt", ["userId", "destinationAccountId", "createdAt"])
    .index("by_userId_sourceAccountId_createdAt", ["userId", "sourceAccountId", "createdAt"])
    .index("by_userId_transferDate", ["userId", "transferDate"]),

  billPaymentChecks: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_billId_cycleMonth", ["userId", "billId", "cycleMonth"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  bills: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_category", ["userId", "category"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_linkedAccountId", ["userId", "linkedAccountId"])
    .index("by_userId_scope", ["userId", "scope"]),

  cards: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  clientOpsMetrics: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  consentLogs: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  consentSettings: defineTable(v.any())
    .index("by_userId", ["userId"]),

  currencyCatalog: defineTable(v.any())
    .index("by_code", ["code"]),

  cycleAuditLogs: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_ranAt", ["userId", "ranAt"]),

  cycleStepAlerts: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_cycleKey_createdAt", ["userId", "cycleKey", "createdAt"]),

  dashboardPreferences: defineTable(v.any())
    .index("by_owner", ["ownerKey"]),

  dashboardSnapshots: defineTable(v.any())
    .index("by_owner", ["ownerKey"]),

  dashboardStates: defineTable(v.any())
    .index("by_userId", ["userId"]),

  deletionJobs: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  envelopeBudgets: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_month", ["userId", "month"]),

  financeAuditEvents: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_entityType_createdAt", ["userId", "entityType", "createdAt"]),

  financePreferences: defineTable(v.any())
    .index("by_userId", ["userId"]),

  fxRates: defineTable(v.any())
    .index("by_pairKey", ["pairKey"]),

  goalEvents: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_goalId_createdAt", ["userId", "goalId", "createdAt"]),

  goals: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  incomeAllocationRules: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_target", ["userId", "target"]),

  incomeAllocationSuggestions: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_month", ["userId", "month"])
    .index("by_userId_month_target", ["userId", "month", "target"]),

  incomeChangeEvents: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_incomeId_effectiveDate", ["userId", "incomeId", "effectiveDate"]),

  incomePaymentChecks: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_cycleMonth", ["userId", "cycleMonth"])
    .index("by_userId_incomeId_cycleMonth", ["userId", "incomeId", "cycleMonth"]),

  incomes: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_destinationAccountId", ["userId", "destinationAccountId"]),

  ledgerEntries: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_cycleKey", ["userId", "cycleKey"]),

  ledgerLines: defineTable(v.any())
    .index("by_entryId", ["entryId"])
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  loanCycleAuditEntries: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_cycleKey_createdAt", ["userId", "cycleKey", "createdAt"])
    .index("by_userId_loanId_createdAt", ["userId", "loanId", "createdAt"]),

  loanEvents: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_loanId_createdAt", ["userId", "loanId", "createdAt"]),

  loans: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  monthCloseSnapshots: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_cycleKey", ["userId", "cycleKey"])
    .index("by_userId_ranAt", ["userId", "ranAt"]),

  monthlyCycleRuns: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_cycleKey", ["userId", "cycleKey"])
    .index("by_userId_idempotencyKey", ["userId", "idempotencyKey"]),

  personalFinanceStates: defineTable(v.any())
    .index("by_userId", ["userId"]),

  planningActionTasks: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_month_createdAt", ["userId", "month", "createdAt"])
    .index("by_userId_month_status", ["userId", "month", "status"])
    .index("by_userId_month_versionKey", ["userId", "month", "versionKey"]),

  planningMonthVersions: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_month", ["userId", "month"])
    .index("by_userId_month_isSelected", ["userId", "month", "isSelected"])
    .index("by_userId_month_versionKey", ["userId", "month", "versionKey"]),

  purchaseMonthCloseRuns: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_idempotencyKey", ["userId", "idempotencyKey"])
    .index("by_userId_monthKey", ["userId", "monthKey"]),

  purchases: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  purchaseSplits: defineTable(v.any())
    .index("by_purchaseId", ["purchaseId"])
    .index("by_userId", ["userId"]),

  purchaseSplitTemplates: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  retentionPolicies: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_policyKey", ["userId", "policyKey"]),

  settingsProfiles: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_nameNormalized", ["userId", "nameNormalized"])
    .index("by_userId_updatedAt", ["userId", "updatedAt"]),

  subscriptionPriceChanges: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_billId_createdAt", ["userId", "billId", "createdAt"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  transactionRules: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  userExportDownloads: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_downloadedAt", ["userId", "downloadedAt"])
    .index("by_userId_exportId_downloadedAt", ["userId", "exportId", "downloadedAt"]),

  userExports: defineTable(v.any())
    .index("by_userId", ["userId"])
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_status", ["userId", "status"]),
}, {
  schemaValidation: false,
  strictTableNameTypes: false,
})
