import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import {
  nextDueAtFromDayInTimeZone,
  normalizeTimeZone,
  scheduledDueAtForCurrentMonthInTimeZone,
  timeZonePartsAt,
  ymdInTimeZone,
  zonedDateTimeToUtcMs,
} from './_shared/timezone'
import {
  assertOwnedDocOrThrow as sharedAssertOwnedDocOrThrow,
  auditWriteSafe as sharedAuditWriteSafe,
  collectUserDocs as sharedCollectUserDocs,
  requireViewerUserId as sharedRequireViewerUserId,
  safeCollectDocs as sharedSafeCollectDocs,
  viewerUserId as sharedViewerUserId,
} from './_shared/guardrails'
import {
  buildFractionDigitsByCurrency as sharedBuildFractionDigitsByCurrency,
  buildFxMapFromRateRows as sharedBuildFxMapFromRateRows,
  buildPostedFxSnapshot as sharedBuildPostedFxSnapshot,
} from './_shared/money_fx'

const GLOBAL_SNAPSHOT_OWNER = 'global-demo'
const DEFAULT_DISPLAY_CURRENCY = 'USD'

type AccountType = 'Checking' | 'Savings' | 'Brokerage' | 'Credit'
type TransactionType = 'income' | 'expense' | 'transfer'
type CurrencyCode = string

type SnapshotPayload = {
  summary: {
    totalAssetsMinor: bigint
    liabilitiesMinor: bigint
    monthlyIncomeMinor: bigint
    monthlyExpensesMinor: bigint
    liquidCashMinor: bigint
  }
  accounts: Array<{
    id: string
    name: string
    type: AccountType
    provider: string
    balanceMinor: bigint
    currency: CurrencyCode
    changePct: number
  }>
  portfolioSeries: Array<{
    label: string
    netWorthMinor: bigint
    investedMinor: bigint
    cashMinor: bigint
    currency: CurrencyCode
  }>
  cashflowSeries: Array<{
    label: string
    incomeMinor: bigint
    incomeCurrency: CurrencyCode
    expensesMinor: bigint
    expensesCurrency: CurrencyCode
  }>
  allocations: Array<{
    name: string
    amountMinor: bigint
    currency: CurrencyCode
    pct: number
    deltaPct: number
    risk: 'Low' | 'Medium' | 'High'
  }>
  budgets: Array<{
    category: string
    limitMinor: bigint
    spentMinor: bigint
    currency: CurrencyCode
    cadence: 'Monthly'
    status: 'Healthy' | 'Tight' | 'Exceeded'
  }>
  goals: Array<{
    id: string
    title: string
    targetMinor: bigint
    currentMinor: bigint
    contributionMinor: bigint
    currency: CurrencyCode
    dueLabel: string
  }>
  insights: Array<{
    id: string
    title: string
    tone: 'positive' | 'neutral' | 'warning'
    detail: string
  }>
  watchlist: Array<{
    symbol: string
    priceMinor: bigint
    currency: CurrencyCode
    changePct: number
  }>
  upcomingBills: Array<{
    id: string
    name: string
    due: string
    amountMinor: bigint
    currency: CurrencyCode
  }>
  transactions: Array<{
    id: string
    date: string
    merchant: string
    account: string
    category: string
    note: string
    amountMinor: bigint
    currency: CurrencyCode
    type: TransactionType
    status: 'posted' | 'pending'
  }>
}

type CurrencyCatalogRow = {
  code: string
  name: string
  fractionDigits: number
  symbol?: string
}

type FxMap = Map<string, { rate: number; synthetic: boolean; asOfMs: number; source: string }>

const PHASE_ZERO_DIAGNOSTIC_TABLES = [
  'accounts',
  'incomes',
  'bills',
  'cards',
  'loans',
  'financePreferences',
  'monthCloseSnapshots',
  'monthlyCycleRuns',
  'cycleAuditLogs',
  'incomePaymentChecks',
  'loanEvents',
  'financeAuditEvents',
  'retentionPolicies',
  'consentSettings',
  'consentLogs',
] as const

const PHASE_ZERO_MIGRATION_TABLES = [
  'accountReconciliationChecks',
  'accountTransfers',
  'accounts',
  'billPaymentChecks',
  'bills',
  'cards',
  'clientOpsMetrics',
  'consentLogs',
  'consentSettings',
  'cycleAuditLogs',
  'cycleStepAlerts',
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
  'purchaseSplitTemplates',
  'purchaseSplits',
  'purchases',
  'retentionPolicies',
  'settingsProfiles',
  'subscriptionPriceChanges',
  'transactionRules',
  'userExportDownloads',
  'userExports',
] as const

const PHASE_ONE_ENTITY_TABLES = {
  account: 'accounts',
  income: 'incomes',
  bill: 'bills',
  card: 'cards',
  loan: 'loans',
} as const

export const getDashboard = query({
  args: {
    displayCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [ownerKey, userId] = await Promise.all([
      viewerOwnerKey(ctx),
      viewerUserId(ctx),
    ])

    const prefDoc = await ctx.db
      .query('dashboardPreferences')
      .withIndex('by_owner', (q) => q.eq('ownerKey', ownerKey))
      .unique()

    const [currencyDocs, fxDocs] = await Promise.all([
      ctx.db.query('currencyCatalog').collect(),
      ctx.db.query('fxRates').collect(),
    ])

    const currencyCatalog = currencyDocs
      .map((row) => ({
        code: normalizeCurrencyCode(row.code),
        name: row.name,
        fractionDigits: row.fractionDigits,
        symbol: row.symbol ?? undefined,
      }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const currencySet = new Set(currencyCatalog.map((row) => row.code))
    const fxMap = new Map<string, { rate: number; synthetic: boolean; asOfMs: number; source: string }>()

    for (const row of fxDocs) {
      if (normalizeCurrencyCode(row.baseCurrency) !== 'USD') continue
      fxMap.set(normalizeCurrencyCode(row.quoteCurrency), {
        rate: row.rate,
        synthetic: row.synthetic,
        asOfMs: row.asOfMs,
        source: row.source,
      })
    }

    const fractionDigitsByCurrency = new Map(
      currencyCatalog.map((row) => [row.code, row.fractionDigits]),
    )

    const fallbackBaseCurrencyCandidate = normalizeCurrencyCode(
      args.displayCurrency ?? prefDoc?.displayCurrency ?? DEFAULT_DISPLAY_CURRENCY,
    )
    const fallbackBaseCurrency = currencySet.has(fallbackBaseCurrencyCandidate)
      ? fallbackBaseCurrencyCandidate
      : DEFAULT_DISPLAY_CURRENCY

    const liveSnapshot = userId
      ? await buildLiveSnapshotPayload(ctx, {
          userId,
          fxMap,
          fallbackBaseCurrency,
        })
      : null

    const snapshotSource = liveSnapshot

    if (!snapshotSource) {
      return null
    }

    const effectiveDisplayCurrencyCandidate = normalizeCurrencyCode(
      args.displayCurrency ??
        prefDoc?.displayCurrency ??
        snapshotSource.baseCurrency ??
        DEFAULT_DISPLAY_CURRENCY,
    )
    const displayCurrency = currencySet.has(effectiveDisplayCurrencyCandidate)
      ? effectiveDisplayCurrencyCandidate
      : currencySet.has(snapshotSource.baseCurrency)
        ? snapshotSource.baseCurrency
        : DEFAULT_DISPLAY_CURRENCY

    const locale = sanitizeLocale(
      args.locale ?? prefDoc?.locale ?? snapshotSource.localeHint ?? 'en-US',
    )

    const payload = snapshotSource.payload
    const converter = createConverter({
      targetCurrency: displayCurrency,
      fxMap,
      fractionDigitsByCurrency,
    })

    const data = {
      summary: {
        totalAssets: converter.fromMinor(
          payload.summary.totalAssetsMinor,
          snapshotSource.baseCurrency,
        ),
        liabilities: converter.fromMinor(
          payload.summary.liabilitiesMinor,
          snapshotSource.baseCurrency,
        ),
        monthlyIncome: converter.fromMinor(
          payload.summary.monthlyIncomeMinor,
          snapshotSource.baseCurrency,
        ),
        monthlyExpenses: converter.fromMinor(
          payload.summary.monthlyExpensesMinor,
          snapshotSource.baseCurrency,
        ),
        liquidCash: converter.fromMinor(
          payload.summary.liquidCashMinor,
          snapshotSource.baseCurrency,
        ),
      },
      accounts: payload.accounts.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        provider: item.provider,
        balance: converter.fromMinor(item.balanceMinor, item.currency),
        changePct: item.changePct,
        currency: displayCurrency,
        originalBalance: minorToMajor(
          item.balanceMinor,
          item.currency,
          fractionDigitsByCurrency,
        ),
        originalCurrency: item.currency,
      })),
      portfolioSeries: payload.portfolioSeries.map((item) => ({
        label: item.label,
        netWorth: converter.fromMinor(item.netWorthMinor, item.currency),
        invested: converter.fromMinor(item.investedMinor, item.currency),
        cash: converter.fromMinor(item.cashMinor, item.currency),
      })),
      cashflowSeries: payload.cashflowSeries.map((item) => ({
        label: item.label,
        income: converter.fromMinor(item.incomeMinor, item.incomeCurrency),
        expenses: converter.fromMinor(item.expensesMinor, item.expensesCurrency),
      })),
      allocations: payload.allocations.map((item) => ({
        name: item.name,
        amount: converter.fromMinor(item.amountMinor, item.currency),
        pct: item.pct,
        deltaPct: item.deltaPct,
        risk: item.risk,
      })),
      budgets: payload.budgets.map((item) => ({
        category: item.category,
        limit: converter.fromMinor(item.limitMinor, item.currency),
        spent: converter.fromMinor(item.spentMinor, item.currency),
        cadence: item.cadence,
        status: item.status,
      })),
      goals: payload.goals.map((item) => ({
        id: item.id,
        title: item.title,
        target: converter.fromMinor(item.targetMinor, item.currency),
        current: converter.fromMinor(item.currentMinor, item.currency),
        dueLabel: item.dueLabel,
        contribution: converter.fromMinor(item.contributionMinor, item.currency),
      })),
      insights: payload.insights,
      watchlist: payload.watchlist.map((item) => ({
        symbol: item.symbol,
        price: converter.fromMinor(item.priceMinor, item.currency),
        priceCurrency: displayCurrency,
        originalPrice: minorToMajor(item.priceMinor, item.currency, fractionDigitsByCurrency),
        originalCurrency: item.currency,
        changePct: item.changePct,
      })),
      upcomingBills: payload.upcomingBills.map((item) => ({
        id: item.id,
        name: item.name,
        due: item.due,
        amount: converter.fromMinor(item.amountMinor, item.currency),
        currency: displayCurrency,
        originalAmount: minorToMajor(item.amountMinor, item.currency, fractionDigitsByCurrency),
        originalCurrency: item.currency,
      })),
      transactions: payload.transactions.map((item) => ({
        id: item.id,
        date: item.date,
        merchant: item.merchant,
        account: item.account,
        category: item.category,
        note: item.note,
        amount: converter.fromMinor(item.amountMinor, item.currency),
        currency: displayCurrency,
        originalAmount: minorToMajor(
          item.amountMinor,
          item.currency,
          fractionDigitsByCurrency,
        ),
        originalCurrency: item.currency,
        type: item.type,
        status: item.status,
      })),
    }

    const pinned = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY']
    const pinnedSet = new Set(pinned)

    return {
      data,
      meta: {
        displayCurrency,
        locale,
        baseCurrency: snapshotSource.baseCurrency,
        snapshotVersion: snapshotSource.version,
        snapshotSeededAtMs: snapshotSource.seededAtMs,
        sourceKind: snapshotSource.sourceKind,
        viewerAuthenticated: Boolean(userId),
        viewerUserId: userId,
        hasLiveData: Boolean(liveSnapshot),
        fxAsOfMs: Math.max(...fxDocs.map((row) => row.asOfMs), snapshotSource.seededAtMs),
        fxSources: Array.from(new Set(fxDocs.map((row) => row.source))).sort(),
        syntheticRates: fxDocs.some((row) => row.synthetic),
        availableCurrencies: [
          ...currencyCatalog.filter((row) => pinnedSet.has(row.code)),
          ...currencyCatalog.filter((row) => !pinnedSet.has(row.code)),
        ],
      },
    }
  },
})

/* eslint-disable @typescript-eslint/no-explicit-any */
async function buildLiveSnapshotPayload(
  ctx: QueryCtx,
  {
    userId,
    fxMap,
    fallbackBaseCurrency,
  }: {
    userId: string
    fxMap: FxMap
    fallbackBaseCurrency?: string
  },
): Promise<
  | {
      baseCurrency: string
      payload: SnapshotPayload
      version: string
      seededAtMs: number
      sourceKind: 'live-normalized'
      localeHint?: string
    }
  | null
> {
  const financeDb = ctx.db as any

  const [
    financePreferences,
    accounts,
    incomes,
    bills,
    cards,
    loans,
    goals,
    monthCloseSnapshots,
  ] = await Promise.all([
    findUserDoc(financeDb, 'financePreferences', userId),
    collectUserDocs(financeDb, 'accounts', userId),
    collectUserDocs(financeDb, 'incomes', userId),
    collectUserDocs(financeDb, 'bills', userId),
    collectUserDocs(financeDb, 'cards', userId),
    collectUserDocs(financeDb, 'loans', userId),
    collectUserDocs(financeDb, 'goals', userId),
    collectUserDocs(financeDb, 'monthCloseSnapshots', userId),
  ])

  const hasRealRows =
    accounts.length > 0 ||
    incomes.length > 0 ||
    bills.length > 0 ||
    cards.length > 0 ||
    loans.length > 0 ||
    monthCloseSnapshots.length > 0

  if (!hasRealRows) {
    return null
  }

  const now = Date.now()
  const nowDate = new Date(now)
  const timezone = normalizeTimeZone(optionalString(financePreferences?.timezone) ?? 'UTC')
  const baseCurrency = normalizeCurrencyCode(
    optionalString(financePreferences?.currency) ??
      fallbackBaseCurrency ??
      DEFAULT_DISPLAY_CURRENCY,
  )
  const localeHint =
    typeof financePreferences?.locale === 'string'
      ? sanitizeLocale(financePreferences.locale)
      : undefined

  const accountNameById = new Map<string, string>(
    accounts.map((account: any) => [String(account._id), String(account.name ?? 'Account')]),
  )

  const debtAccounts = accounts.filter(
    (account: any) => String(account.type ?? '').toLowerCase() === 'debt',
  )
  const assetAccounts = accounts.filter(
    (account: any) => String(account.type ?? '').toLowerCase() !== 'debt',
  )

  const sumAssetBalances = assetAccounts.reduce(
    (sum: number, account: any) => sum + Math.max(numberOr(account.balance), 0),
    0,
  )
  const liquidCash = assetAccounts.reduce(
    (sum: number, account: any) =>
      sum +
      (account.liquid ? Math.max(numberOr(account.balance), 0) : 0),
    0,
  )
  const debtAccountLiabilities = debtAccounts.reduce(
    (sum: number, account: any) => sum + Math.max(numberOr(account.balance), 0),
    0,
  )
  const cardLiabilities = cards.reduce(
    (sum: number, card: any) => sum + Math.max(numberOr(card.usedLimit), 0),
    0,
  )
  const loanLiabilities = loans.reduce(
    (sum: number, loan: any) =>
      sum + Math.max(numberOr(loan.balance) || numberOr(loan.principalBalance), 0),
    0,
  )
  const derivedLiabilities = debtAccountLiabilities + cardLiabilities + loanLiabilities

  const scheduleMonthlyIncome = incomes.reduce(
    (sum: number, income: any) => sum + estimateMonthlyAmount(income),
    0,
  )
  const scheduleMonthlyBills = bills.reduce(
    (sum: number, bill: any) => sum + estimateMonthlyAmount(bill),
    0,
  )
  const cardMonthlySpend = cards.reduce(
    (sum: number, card: any) =>
      sum + Math.max(numberOr(card.minimumPayment), 0) + Math.max(numberOr(card.spendPerMonth), 0),
    0,
  )
  const loanMonthlyPayments = loans.reduce(
    (sum: number, loan: any) => sum + Math.max(numberOr(loan.minimumPayment), 0),
    0,
  )
  const derivedMonthlyExpenses = scheduleMonthlyBills + cardMonthlySpend + loanMonthlyPayments

  const sortedMonthCloses = monthCloseSnapshots
    .slice()
    .sort((a: any, b: any) => numberOr(a.ranAt || a.createdAt) - numberOr(b.ranAt || b.createdAt))
  const latestMonthClose =
    sortedMonthCloses.length > 0 ? sortedMonthCloses[sortedMonthCloses.length - 1] : null
  const latestSummary = latestMonthClose?.summary ?? {}

  const monthlyIncome = numberOr(latestSummary.monthlyIncome, scheduleMonthlyIncome)
  const monthlyExpenses = numberOr(latestSummary.monthlyCommitments, derivedMonthlyExpenses)
  const liabilities = numberOr(latestSummary.totalLiabilities, derivedLiabilities)
  const netWorth = numberOr(latestSummary.netWorth, sumAssetBalances - liabilities)
  const totalAssets = Math.max(numberOr(netWorth + liabilities), sumAssetBalances, 0)

  const accountsPayload: SnapshotPayload['accounts'] = [
    ...assetAccounts.map((account: any, index: number) => ({
      id: `acct-${String(account._id)}`,
      name: String(account.name ?? `Account ${index + 1}`),
      type: account.liquid ? ('Checking' as const) : ('Savings' as const),
      provider: inferProvider(String(account.name ?? 'Bank')),
      balanceMinor: toMinor(numberOr(account.balance), baseCurrency),
      currency: baseCurrency,
      changePct: changePctFromName(String(account.name ?? ''), 1),
    })),
    ...debtAccounts.map((account: any, index: number) => ({
      id: `debt-${String(account._id)}`,
      name: String(account.name ?? `Debt ${index + 1}`),
      type: 'Credit' as const,
      provider: inferProvider(String(account.name ?? 'Debt')),
      balanceMinor: toMinor(-Math.max(numberOr(account.balance), 0), baseCurrency),
      currency: baseCurrency,
      changePct: changePctFromName(String(account.name ?? ''), -1),
    })),
    ...cards.map((card: any, index: number) => ({
      id: `card-${String(card._id)}`,
      name: String(card.name ?? `Card ${index + 1}`),
      type: 'Credit' as const,
      provider: inferProvider(String(card.name ?? 'Card')),
      balanceMinor: toMinor(-Math.max(numberOr(card.usedLimit), 0), baseCurrency),
      currency: baseCurrency,
      changePct: changePctFromName(String(card.name ?? ''), -1),
    })),
    ...loans.map((loan: any, index: number) => ({
      id: `loan-${String(loan._id)}`,
      name: String(loan.name ?? `Loan ${index + 1}`),
      type: 'Credit' as const,
      provider: inferProvider(String(loan.name ?? 'Loan')),
      balanceMinor: toMinor(
        -Math.max(numberOr(loan.balance) || numberOr(loan.principalBalance), 0),
        baseCurrency,
      ),
      currency: baseCurrency,
      changePct: changePctFromName(String(loan.name ?? ''), -1),
    })),
  ]
    .sort((a, b) => Number(b.balanceMinor - a.balanceMinor))
    .slice(0, 10)

  const portfolioSeries = buildPortfolioSeries({
    sortedMonthCloses,
    nowDate,
    netWorth,
    liquidCash,
    totalAssets,
    liabilities,
    monthlyNet: monthlyIncome - monthlyExpenses,
    baseCurrency,
  })

  const cashflowSeries = buildCashflowSeries({
    incomes,
    bills,
    cards,
    loans,
    monthlyIncome,
    monthlyExpenses,
    baseCurrency,
  })

  const allocations = buildAllocations({
    liquidCash,
    nonLiquidAssets: Math.max(sumAssetBalances - liquidCash, 0),
    debtAccounts: debtAccountLiabilities,
    cards: cardLiabilities,
    loans: loanLiabilities,
    monthlyExpenses,
    baseCurrency,
  })

  const budgets = buildBudgetsFromLiveData({
    bills,
    cards,
    loans,
    baseCurrency,
  })

  const liveGoals = buildGoalsFromLiveData({
    goals,
    liquidCash,
    monthlyExpenses,
    monthlyNet: monthlyIncome - monthlyExpenses,
    baseCurrency,
  })

  const insights = buildInsightsFromLiveData({
    monthlyIncome,
    monthlyExpenses,
    liquidCash,
    liabilities,
    netWorth,
    bills,
    cards,
    loans,
  })

  const watchlist = buildFxWatchlist({
    baseCurrency,
    fxMap,
  })

  const upcomingBills = buildUpcomingBills({
    bills,
    cards,
    loans,
    baseCurrency,
    nowMs: now,
    timezone,
  })

  const transactions = buildTransactionsFromSchedules({
    incomes,
    bills,
    cards,
    loans,
    accountNameById,
    baseCurrency,
    nowMs: now,
    timezone,
  })

  return {
    baseCurrency,
    localeHint,
    seededAtMs:
      numberOr(latestMonthClose?.ranAt || latestMonthClose?._creationTime || latestMonthClose?.createdAt) ||
      now,
    sourceKind: 'live-normalized',
    version: '2026-live-convex-normalized-v1',
    payload: {
      summary: {
        totalAssetsMinor: toMinor(totalAssets, baseCurrency),
        liabilitiesMinor: toMinor(liabilities, baseCurrency),
        monthlyIncomeMinor: toMinor(monthlyIncome, baseCurrency),
        monthlyExpensesMinor: toMinor(monthlyExpenses, baseCurrency),
        liquidCashMinor: toMinor(liquidCash, baseCurrency),
      },
      accounts: accountsPayload,
      portfolioSeries,
      cashflowSeries,
      allocations,
      budgets,
      goals: liveGoals,
      insights,
      watchlist,
      upcomingBills,
      transactions,
    },
  }
}

async function collectUserDocs(db: any, table: string, userId: string): Promise<any[]> {
  return await sharedCollectUserDocs(db, table, userId)
}

async function findUserDoc(db: any, table: string, userId: string): Promise<any | null> {
  const docs = await collectUserDocs(db, table, userId)
  if (docs.length === 0) return null
  return docs.sort((a, b) => numberOr(b.updatedAt || b._creationTime) - numberOr(a.updatedAt || a._creationTime))[0] ?? null
}

function buildPortfolioSeries({
  sortedMonthCloses,
  nowDate,
  netWorth,
  liquidCash,
  totalAssets,
  liabilities,
  monthlyNet,
  baseCurrency,
}: {
  sortedMonthCloses: any[]
  nowDate: Date
  netWorth: number
  liquidCash: number
  totalAssets: number
  liabilities: number
  monthlyNet: number
  baseCurrency: string
}): SnapshotPayload['portfolioSeries'] {
  if (sortedMonthCloses.length >= 2) {
    return sortedMonthCloses.slice(-12).map((doc) => {
      const summary = doc.summary ?? {}
      const pointNetWorth = numberOr(summary.netWorth, netWorth)
      const pointLiabilities = numberOr(summary.totalLiabilities, liabilities)
      const pointAssets = Math.max(pointNetWorth + pointLiabilities, 0)
      const pointCash = Math.min(Math.max(liquidCash, 0), pointAssets)
      return {
        label: cycleLabel(doc.cycleKey, new Date(numberOr(doc.ranAt || doc.createdAt || doc._creationTime) || nowDate.getTime())),
        netWorthMinor: toMinor(pointNetWorth, baseCurrency),
        investedMinor: toMinor(Math.max(pointAssets - pointCash, 0), baseCurrency),
        cashMinor: toMinor(pointCash, baseCurrency),
        currency: baseCurrency,
      }
    })
  }

  const months = 12
  const netStep = monthlyNet || 0
  const cashTarget = Math.max(liquidCash, 0)
  const investedTarget = Math.max(totalAssets - cashTarget, 0)
  const points: SnapshotPayload['portfolioSeries'] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = monthOffsetUtc(nowDate, -i)
    const ageFactor = i / Math.max(months - 1, 1)
    const estNetWorth = netWorth - netStep * i
    const estCash = Math.max(cashTarget - Math.max(-netStep, 0) * ageFactor * 0.35, 0)
    const estInvested = Math.max(investedTarget - Math.max(-netStep, 0) * ageFactor * 0.15, 0)
    points.push({
      label: shortMonthLabel(date),
      netWorthMinor: toMinor(estNetWorth, baseCurrency),
      investedMinor: toMinor(estInvested, baseCurrency),
      cashMinor: toMinor(estCash, baseCurrency),
      currency: baseCurrency,
    })
  }
  return points
}

function buildCashflowSeries({
  incomes,
  bills,
  cards,
  loans,
  monthlyIncome,
  monthlyExpenses,
  baseCurrency,
}: {
  incomes: any[]
  bills: any[]
  cards: any[]
  loans: any[]
  monthlyIncome: number
  monthlyExpenses: number
  baseCurrency: string
}): SnapshotPayload['cashflowSeries'] {
  const weekly = Array.from({ length: 6 }, (_, index) => ({
    label: `W${index + 1}`,
    income: 0,
    expenses: 0,
  }))

  const addIncome = (weekIndex: number, amount: number) => {
    weekly[Math.max(0, Math.min(5, weekIndex))]!.income += Math.max(amount, 0)
  }
  const addExpense = (weekIndex: number, amount: number) => {
    weekly[Math.max(0, Math.min(5, weekIndex))]!.expenses += Math.max(amount, 0)
  }

  for (const income of incomes) {
    const day = clampDay(income.receivedDay)
    addIncome(dayToWeekIndex(day), estimateMonthlyAmount(income))
  }
  for (const bill of bills) {
    const day = clampDay(bill.dueDay)
    addExpense(dayToWeekIndex(day), estimateMonthlyAmount(bill))
  }
  for (const card of cards) {
    addExpense(2, Math.max(numberOr(card.minimumPayment), 0) + Math.max(numberOr(card.spendPerMonth), 0))
  }
  for (const loan of loans) {
    addExpense(dayToWeekIndex(clampDay(loan.dueDay)), Math.max(numberOr(loan.minimumPayment), 0))
  }

  const hasSignal = weekly.some((row) => row.income > 0 || row.expenses > 0)
  if (!hasSignal) {
    for (let i = 0; i < weekly.length; i += 1) {
      weekly[i]!.income = monthlyIncome / weekly.length
      weekly[i]!.expenses = monthlyExpenses / weekly.length
    }
  }

  return weekly.map((row) => ({
    label: row.label,
    incomeMinor: toMinor(row.income, baseCurrency),
    incomeCurrency: baseCurrency,
    expensesMinor: toMinor(row.expenses, baseCurrency),
    expensesCurrency: baseCurrency,
  }))
}

function buildAllocations({
  liquidCash,
  nonLiquidAssets,
  debtAccounts,
  cards,
  loans,
  monthlyExpenses,
  baseCurrency,
}: {
  liquidCash: number
  nonLiquidAssets: number
  debtAccounts: number
  cards: number
  loans: number
  monthlyExpenses: number
  baseCurrency: string
}): SnapshotPayload['allocations'] {
  const groups = [
    { name: 'Liquid Cash', amount: liquidCash, risk: 'Low' as const },
    { name: 'Other Assets', amount: nonLiquidAssets, risk: 'Medium' as const },
    { name: 'Debt Accounts', amount: debtAccounts, risk: 'High' as const },
    { name: 'Card Debt', amount: cards, risk: 'High' as const },
    { name: 'Loans', amount: loans, risk: 'High' as const },
    { name: 'Monthly Commitments', amount: monthlyExpenses, risk: 'Medium' as const },
  ].filter((item) => item.amount > 0)

  const fallback = groups.length > 0 ? groups : [{ name: 'Cash', amount: 1, risk: 'Low' as const }]
  const total = fallback.reduce((sum, item) => sum + item.amount, 0)

  return fallback.map((item, index) => {
    const pct = total > 0 ? (item.amount / total) * 100 : 0
    return {
      name: item.name,
      amountMinor: toMinor(item.amount, baseCurrency),
      currency: baseCurrency,
      pct: Number(pct.toFixed(0)),
      deltaPct: changePctFromName(item.name, index % 2 === 0 ? 1 : -1),
      risk: item.risk,
    }
  })
}

function buildBudgetsFromLiveData({
  bills,
  cards,
  loans,
  baseCurrency,
}: {
  bills: any[]
  cards: any[]
  loans: any[]
  baseCurrency: string
}): SnapshotPayload['budgets'] {
  const categoryTotals = new Map<string, number>()

  for (const bill of bills) {
    const category = String(bill.category || 'Recurring').replace(/\b\w/g, (c) => c.toUpperCase())
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + estimateMonthlyAmount(bill))
  }

  const cardCost = cards.reduce(
    (sum, card) => sum + Math.max(numberOr(card.minimumPayment), 0) + Math.max(numberOr(card.spendPerMonth), 0),
    0,
  )
  if (cardCost > 0) {
    categoryTotals.set('Cards', (categoryTotals.get('Cards') ?? 0) + cardCost)
  }

  const loanCost = loans.reduce((sum, loan) => sum + Math.max(numberOr(loan.minimumPayment), 0), 0)
  if (loanCost > 0) {
    categoryTotals.set('Loans', (categoryTotals.get('Loans') ?? 0) + loanCost)
  }

  const rows = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, spent]) => {
      const limit = spent * 1.12
      const ratio = limit > 0 ? spent / limit : 0
      return {
        category,
        limitMinor: toMinor(limit, baseCurrency),
        spentMinor: toMinor(spent, baseCurrency),
        currency: baseCurrency,
        cadence: 'Monthly' as const,
        status: ratio > 1 ? ('Exceeded' as const) : ratio > 0.9 ? ('Tight' as const) : ('Healthy' as const),
      }
    })

  if (rows.length > 0) {
    return rows
  }

  return [
    {
      category: 'Essentials',
      limitMinor: toMinor(1, baseCurrency),
      spentMinor: toMinor(0, baseCurrency),
      currency: baseCurrency,
      cadence: 'Monthly',
      status: 'Healthy',
    },
  ]
}

function buildGoalsFromLiveData({
  goals,
  liquidCash,
  monthlyExpenses,
  monthlyNet,
  baseCurrency,
}: {
  goals: any[]
  liquidCash: number
  monthlyExpenses: number
  monthlyNet: number
  baseCurrency: string
}): SnapshotPayload['goals'] {
  if (goals.length > 0) {
    return goals.slice(0, 4).map((goal, index) => {
      const target = Math.max(numberOr(goal.targetAmount) || numberOr(goal.target) || 0, 1)
      const current = Math.max(numberOr(goal.currentAmount) || numberOr(goal.current) || 0, 0)
      return {
        id: `goal-${String(goal._id ?? index)}`,
        title: String(goal.name ?? goal.title ?? `Goal ${index + 1}`),
        targetMinor: toMinor(target, baseCurrency),
        currentMinor: toMinor(current, baseCurrency),
        contributionMinor: toMinor(Math.max(numberOr(goal.monthlyContribution), 0), baseCurrency),
        currency: baseCurrency,
        dueLabel: String(goal.targetDateLabel ?? goal.dueLabel ?? 'Planned'),
      }
    })
  }

  const contribution = Math.max(monthlyNet, 0) * 0.5
  const oneMonth = Math.max(monthlyExpenses, 1)
  const threeMonths = Math.max(monthlyExpenses * 3, oneMonth)
  const sixMonths = Math.max(monthlyExpenses * 6, threeMonths)

  return [
    {
      id: 'goal-runway-1m',
      title: '1 month cash runway',
      targetMinor: toMinor(oneMonth, baseCurrency),
      currentMinor: toMinor(liquidCash, baseCurrency),
      contributionMinor: toMinor(contribution, baseCurrency),
      currency: baseCurrency,
      dueLabel: 'Next cycle',
    },
    {
      id: 'goal-runway-3m',
      title: '3 month runway reserve',
      targetMinor: toMinor(threeMonths, baseCurrency),
      currentMinor: toMinor(liquidCash, baseCurrency),
      contributionMinor: toMinor(contribution, baseCurrency),
      currency: baseCurrency,
      dueLabel: 'Q2 2026',
    },
    {
      id: 'goal-runway-6m',
      title: '6 month runway reserve',
      targetMinor: toMinor(sixMonths, baseCurrency),
      currentMinor: toMinor(liquidCash, baseCurrency),
      contributionMinor: toMinor(contribution, baseCurrency),
      currency: baseCurrency,
      dueLabel: '2026 target',
    },
  ]
}

function buildInsightsFromLiveData({
  monthlyIncome,
  monthlyExpenses,
  liquidCash,
  liabilities,
  netWorth,
  bills,
  cards,
  loans,
}: {
  monthlyIncome: number
  monthlyExpenses: number
  liquidCash: number
  liabilities: number
  netWorth: number
  bills: any[]
  cards: any[]
  loans: any[]
}): SnapshotPayload['insights'] {
  const runwayMonths = monthlyExpenses > 0 ? liquidCash / monthlyExpenses : 0
  const netMargin = monthlyIncome - monthlyExpenses
  const autopayCount = bills.filter((bill) => !!bill.autopay).length

  return [
    {
      id: 'ins-runway',
      title:
        runwayMonths >= 3
          ? `Cash runway is ${runwayMonths.toFixed(1)} months`
          : `Cash runway is tight at ${runwayMonths.toFixed(1)} months`,
      tone: runwayMonths >= 3 ? 'positive' : 'warning',
      detail: 'Derived from live liquid balances and recurring monthly commitments in Convex.',
    },
    {
      id: 'ins-cashflow',
      title:
        netMargin >= 0
          ? `Monthly plan is ${formatSignedCompact(netMargin)} positive`
          : `Monthly plan is ${formatSignedCompact(netMargin)} negative`,
      tone: netMargin >= 0 ? 'positive' : 'warning',
      detail: 'Income and commitments are computed from month-close summaries and recurring schedules.',
    },
    {
      id: 'ins-risk',
      title: `${cards.length} cards, ${loans.length} loans, ${autopayCount} autopay bills tracked`,
      tone: netWorth >= 0 && liabilities < monthlyIncome * 6 ? 'neutral' : 'warning',
      detail: 'All figures shown are coming from the current Convex database tables for this user.',
    },
  ]
}

function buildFxWatchlist({
  baseCurrency,
  fxMap,
}: {
  baseCurrency: string
  fxMap: FxMap
}): SnapshotPayload['watchlist'] {
  const pairs = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD']
    .filter((code) => code !== baseCurrency)
    .slice(0, 5)

  if (pairs.length === 0) {
    pairs.push('USD')
  }

  return pairs.map((quote, index) => {
    const price = conversionRate(quote, baseCurrency, fxMap)
    const symbol = `${quote}/${baseCurrency}`
    return {
      symbol,
      priceMinor: toMinor(price, baseCurrency),
      currency: baseCurrency,
      changePct: changePctFromName(symbol, index % 2 === 0 ? 1 : -1),
    }
  })
}

function buildUpcomingBills({
  bills,
  cards,
  loans,
  baseCurrency,
  nowMs,
  timezone,
}: {
  bills: any[]
  cards: any[]
  loans: any[]
  baseCurrency: string
  nowMs: number
  timezone: string
}): SnapshotPayload['upcomingBills'] {
  const rows: SnapshotPayload['upcomingBills'] = []

  for (const bill of bills) {
    const dueAt = nextDueAtFromDayInTimeZone(nowMs, clampDay(bill.dueDay), timezone, 9, 0)
    rows.push({
      id: `bill-${String(bill._id)}`,
      name: String(bill.name ?? 'Bill'),
      due: ymdInTimeZone(dueAt, timezone),
      amountMinor: toMinor(Math.max(numberOr(bill.amount), 0), baseCurrency),
      currency: baseCurrency,
    })
  }

  for (const card of cards) {
    const day = clampDay(card.dueDay || 20)
    const dueAt = nextDueAtFromDayInTimeZone(nowMs, day, timezone, 9, 0)
    rows.push({
      id: `card-min-${String(card._id)}`,
      name: `${String(card.name ?? 'Card')} minimum payment`,
      due: ymdInTimeZone(dueAt, timezone),
      amountMinor: toMinor(Math.max(numberOr(card.minimumPayment), 0), baseCurrency),
      currency: baseCurrency,
    })
  }

  for (const loan of loans) {
    const day = clampDay(loan.dueDay || 15)
    const dueAt = nextDueAtFromDayInTimeZone(nowMs, day, timezone, 9, 0)
    rows.push({
      id: `loan-min-${String(loan._id)}`,
      name: `${String(loan.name ?? 'Loan')} payment`,
      due: ymdInTimeZone(dueAt, timezone),
      amountMinor: toMinor(Math.max(numberOr(loan.minimumPayment), 0), baseCurrency),
      currency: baseCurrency,
    })
  }

  return rows
    .filter((row) => Number(row.amountMinor) !== 0)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 8)
}

function buildTransactionsFromSchedules({
  incomes,
  bills,
  cards,
  loans,
  accountNameById,
  baseCurrency,
  nowMs,
  timezone,
}: {
  incomes: any[]
  bills: any[]
  cards: any[]
  loans: any[]
  accountNameById: Map<string, string>
  baseCurrency: string
  nowMs: number
  timezone: string
}): SnapshotPayload['transactions'] {
  const rows: SnapshotPayload['transactions'] = []

  for (const income of incomes) {
    for (const scheduledAtMs of incomeScheduleDates({ income, nowMs, timezone, hour: 9, minute: 0 })) {
      rows.push({
        id: `income-${String(income._id)}-${ymdInTimeZone(scheduledAtMs, timezone)}`,
        date: new Date(scheduledAtMs).toISOString(),
        merchant: String(income.source ?? 'Income'),
        account: accountNameById.get(String(income.destinationAccountId)) ?? 'Destination account',
        category: 'Income',
        note: 'Scheduled income from Convex incomes table',
        amountMinor: toMinor(Math.max(numberOr(income.amount), 0), baseCurrency),
        currency: baseCurrency,
        type: 'income',
        status: scheduledAtMs <= nowMs ? 'posted' : 'pending',
      })
    }
  }

  for (const bill of bills) {
    const dueDay = clampDay(bill.dueDay || 1)
    const dates = [
      scheduledDueAtForCurrentMonthInTimeZone(nowMs, dueDay, timezone, 12, 0),
      nextDueAtFromDayInTimeZone(nowMs, dueDay, timezone, 12, 0),
    ]
    for (const scheduledAtMs of dedupeTimestampsByYmdInTimeZone(dates, timezone)) {
      rows.push({
        id: `bill-${String(bill._id)}-${ymdInTimeZone(scheduledAtMs, timezone)}`,
        date: new Date(scheduledAtMs).toISOString(),
        merchant: String(bill.name ?? 'Bill'),
        account: bill.linkedAccountId ? accountNameById.get(String(bill.linkedAccountId)) ?? 'Linked account' : 'Unlinked',
        category: String(bill.category ?? 'Bills'),
        note: 'Recurring bill from Convex bills table',
        amountMinor: toMinor(-Math.max(numberOr(bill.amount), 0), baseCurrency),
        currency: baseCurrency,
        type: 'expense',
        status: scheduledAtMs <= nowMs ? 'posted' : 'pending',
      })
    }
  }

  for (const card of cards) {
    const dueDay = clampDay(card.dueDay || 20)
    const dates = [
      scheduledDueAtForCurrentMonthInTimeZone(nowMs, dueDay, timezone, 15, 0),
      nextDueAtFromDayInTimeZone(nowMs, dueDay, timezone, 15, 0),
    ]
    for (const scheduledAtMs of dedupeTimestampsByYmdInTimeZone(dates, timezone)) {
      const minimumPayment = Math.max(numberOr(card.minimumPayment), 0)
      if (minimumPayment <= 0) continue
      rows.push({
        id: `card-min-${String(card._id)}-${ymdInTimeZone(scheduledAtMs, timezone)}`,
        date: new Date(scheduledAtMs).toISOString(),
        merchant: `${String(card.name ?? 'Card')} minimum`,
        account: String(card.name ?? 'Card'),
        category: 'Debt',
        note: 'Minimum card payment scheduled from Convex cards table',
        amountMinor: toMinor(-minimumPayment, baseCurrency),
        currency: baseCurrency,
        type: 'expense',
        status: scheduledAtMs <= nowMs ? 'posted' : 'pending',
      })
    }
  }

  for (const loan of loans) {
    const dueDay = clampDay(loan.dueDay || 15)
    const dates = [
      scheduledDueAtForCurrentMonthInTimeZone(nowMs, dueDay, timezone, 16, 0),
      nextDueAtFromDayInTimeZone(nowMs, dueDay, timezone, 16, 0),
    ]
    for (const scheduledAtMs of dedupeTimestampsByYmdInTimeZone(dates, timezone)) {
      const minimumPayment = Math.max(numberOr(loan.minimumPayment), 0)
      if (minimumPayment <= 0) continue
      rows.push({
        id: `loan-min-${String(loan._id)}-${ymdInTimeZone(scheduledAtMs, timezone)}`,
        date: new Date(scheduledAtMs).toISOString(),
        merchant: `${String(loan.name ?? 'Loan')} payment`,
        account: String(loan.name ?? 'Loan'),
        category: 'Loans',
        note: 'Loan payment schedule from Convex loans table',
        amountMinor: toMinor(-minimumPayment, baseCurrency),
        currency: baseCurrency,
        type: 'expense',
        status: scheduledAtMs <= nowMs ? 'posted' : 'pending',
      })
    }
  }

  return rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 16)
}

function dedupeTimestampsByYmdInTimeZone(dates: number[], timezone: string) {
  const seen = new Set<string>()
  const result: number[] = []
  for (const timestamp of dates) {
    const key = ymdInTimeZone(timestamp, timezone)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(timestamp)
  }
  return result
}

function incomeIntervalDays(row: any) {
  const cadence = String(row.cadence ?? 'monthly').toLowerCase()
  if (cadence === 'weekly') return 7
  if (cadence === 'biweekly' || cadence === 'fortnightly') return 14
  if (cadence === 'custom') {
    const interval = Math.max(1, Math.trunc(numberOr(row.customInterval, 1)))
    const unit = String(row.customUnit ?? 'weeks').toLowerCase()
    if (unit.startsWith('week')) return interval * 7
    if (unit.startsWith('day')) return interval
  }
  return null
}

function intervalIncomeScheduleDates({
  income,
  nowMs,
  timezone,
  hour,
  minute,
}: {
  income: any
  nowMs: number
  timezone: string
  hour: number
  minute: number
}) {
  const intervalDays = incomeIntervalDays(income)
  if (!intervalDays) return null

  const tz = normalizeTimeZone(timezone)
  const anchorSourceMs = numberOr(income.createdAt ?? income._creationTime, nowMs)
  const anchorParts = timeZonePartsAt(anchorSourceMs, tz)
  const anchorAt = zonedDateTimeToUtcMs(
    {
      year: anchorParts.year,
      month: anchorParts.month,
      day: anchorParts.day,
      hour,
      minute,
      second: 0,
    },
    tz,
  )

  const intervalMs = intervalDays * 24 * 60 * 60 * 1000
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null

  if (anchorAt >= nowMs) {
    return [anchorAt]
  }

  const elapsed = nowMs - anchorAt
  const steps = Math.max(0, Math.floor(elapsed / intervalMs))
  const previous = anchorAt + steps * intervalMs
  const next = previous >= nowMs ? previous : previous + intervalMs
  return dedupeTimestampsByYmdInTimeZone([previous, next], tz)
}

function incomeScheduleDates({
  income,
  nowMs,
  timezone,
  hour = 9,
  minute = 0,
}: {
  income: any
  nowMs: number
  timezone: string
  hour?: number
  minute?: number
}) {
  const intervalDates = intervalIncomeScheduleDates({
    income,
    nowMs,
    timezone,
    hour,
    minute,
  })
  if (intervalDates && intervalDates.length > 0) {
    return intervalDates
  }

  const receivedDay = clampDay(income.receivedDay || 15)
  return dedupeTimestampsByYmdInTimeZone(
    [
      scheduledDueAtForCurrentMonthInTimeZone(nowMs, receivedDay, timezone, hour, minute),
      nextDueAtFromDayInTimeZone(nowMs, receivedDay, timezone, hour, minute),
    ],
    timezone,
  )
}

function monthOffsetUtc(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
}

function shortMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('en', { month: 'short' }).format(date)
}

function cycleLabel(cycleKey: unknown, fallbackDate: Date) {
  if (typeof cycleKey === 'string') {
    const match = cycleKey.match(/^(\d{4})-(\d{2})$/)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2]) - 1
      return shortMonthLabel(new Date(Date.UTC(year, month, 1)))
    }
  }
  return shortMonthLabel(fallbackDate)
}

function dayToWeekIndex(day: number) {
  return Math.min(5, Math.max(0, Math.floor((day - 1) / 7)))
}

function clampDay(value: unknown) {
  const day = Math.trunc(numberOr(value, 1))
  if (!Number.isFinite(day)) return 1
  return Math.min(31, Math.max(1, day))
}

function estimateMonthlyAmount(row: any): number {
  const amount = Math.max(numberOr(row.amount), 0)
  const cadence = String(row.cadence ?? 'monthly').toLowerCase()
  if (amount === 0) return 0

  if (cadence === 'monthly') return amount
  if (cadence === 'weekly') return amount * 52 / 12
  if (cadence === 'biweekly' || cadence === 'fortnightly') return amount * 26 / 12
  if (cadence === 'quarterly') return amount / 3
  if (cadence === 'yearly' || cadence === 'annual') return amount / 12

  if (cadence === 'custom') {
    const interval = Math.max(1, Math.trunc(numberOr(row.customInterval, 1)))
    const unit = String(row.customUnit ?? 'months').toLowerCase()
    if (unit.startsWith('day')) return amount * (30.4375 / interval)
    if (unit.startsWith('week')) return amount * (52 / 12 / interval)
    if (unit.startsWith('month')) return amount / interval
    if (unit.startsWith('year')) return amount / (interval * 12)
  }

  return amount
}

function inferProvider(name: string) {
  const first = name.trim().split(/\s+/)[0]
  return first || 'Connected'
}

function numberOr(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function changePctFromName(seed: string, direction = 1) {
  const magnitude = 0.2 + (hashCode(seed) % 230) / 100
  const signed = Number(magnitude.toFixed(1)) * (direction >= 0 ? 1 : -1)
  return signed
}

function formatSignedCompact(value: number) {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1))
  return `${rounded >= 0 ? '+' : ''}${rounded}`
}

export const getPhaseZeroDiagnostics = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await viewerUserId(ctx)
    if (!viewer) {
      return {
        generatedAtMs: Date.now(),
        viewerAuthenticated: false,
        viewerUserId: null,
        currentUserDocCount: 0,
        currentUserTableCount: 0,
        matchedCurrentData: false,
        canClaimLegacyData: false,
        recommendedLegacyUserId: null,
        tableStats: [] as any[],
        legacyCandidates: [] as any[],
        migrationTableCount: PHASE_ZERO_MIGRATION_TABLES.length,
      }
    }
    const financeDb = ctx.db

    const tableStats = []
    const candidateMap = new Map<
      string,
      { docCount: number; tableCount: number; tables: Set<string> }
    >()

    for (const table of PHASE_ZERO_DIAGNOSTIC_TABLES) {
      const docs = await safeCollectDocs(financeDb, table)
      let viewerCount = 0
      const userCounts = new Map<string, number>()

      for (const doc of docs) {
        const docUserId = typeof doc?.userId === 'string' ? doc.userId : null
        if (!docUserId) continue
        userCounts.set(docUserId, (userCounts.get(docUserId) ?? 0) + 1)
        if (viewer && docUserId === viewer) {
          viewerCount += 1
        }
      }

      for (const [userId, count] of userCounts.entries()) {
        if (viewer && userId === viewer) continue
        const entry = candidateMap.get(userId) ?? {
          docCount: 0,
          tableCount: 0,
          tables: new Set<string>(),
        }
        entry.docCount += count
        if (!entry.tables.has(table)) {
          entry.tables.add(table)
          entry.tableCount += 1
        }
        candidateMap.set(userId, entry)
      }

      const sortedUsers = Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1])
      const [topUserId, topUserCount] = sortedUsers[0] ?? [null, 0]

      tableStats.push({
        table,
        totalDocs: docs.length,
        viewerDocs: viewerCount,
        distinctUsers: userCounts.size,
        topUserId,
        topUserCount,
      })
    }

    const currentUserDocCount = tableStats.reduce(
      (sum, stat) => sum + Number(stat.viewerDocs ?? 0),
      0,
    )
    const currentUserTableCount = tableStats.filter((stat) => stat.viewerDocs > 0).length

    const legacyCandidates = Array.from(candidateMap.entries())
      .map(([userId, entry]) => ({
        userId,
        docCount: entry.docCount,
        tableCount: entry.tableCount,
        tables: Array.from(entry.tables).sort(),
      }))
      .sort((a, b) => {
        if (b.tableCount !== a.tableCount) return b.tableCount - a.tableCount
        if (b.docCount !== a.docCount) return b.docCount - a.docCount
        return a.userId.localeCompare(b.userId)
      })
      .slice(0, 5)

    return {
      generatedAtMs: Date.now(),
      viewerAuthenticated: Boolean(viewer),
      viewerUserId: viewer,
      currentUserDocCount,
      currentUserTableCount,
      matchedCurrentData: Boolean(viewer && currentUserDocCount > 0),
      canClaimLegacyData: Boolean(viewer && currentUserDocCount === 0 && legacyCandidates.length > 0),
      recommendedLegacyUserId:
        viewer && currentUserDocCount === 0 ? (legacyCandidates[0]?.userId ?? null) : null,
      tableStats,
      legacyCandidates,
      migrationTableCount: PHASE_ZERO_MIGRATION_TABLES.length,
    }
  },
})

export const claimLegacyUserData = mutation({
  args: {
    fromUserId: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const toUserId = await viewerUserId(ctx)
    if (!toUserId) {
      throw new Error('Convex backend auth is not active. Sign in again after configuring Clerk JWT template `convex`.')
    }

    const fromUserId = args.fromUserId.trim()
    if (!fromUserId) {
      throw new Error('Missing source userId')
    }

    if (fromUserId === toUserId) {
      throw new Error('Source userId matches current authenticated user.')
    }

    const dryRun = args.dryRun ?? false
    const financeDb = ctx.db as any
    const touchedTables: Array<{
      table: string
      matchedDocs: number
      patchedDocs: number
    }> = []

    let matchedDocCount = 0
    let patchedDocCount = 0

    for (const table of PHASE_ZERO_MIGRATION_TABLES) {
      const docs = await safeCollectDocs(financeDb, table)
      const matches = docs.filter((doc) => doc?.userId === fromUserId)

      if (matches.length === 0) continue

      matchedDocCount += matches.length
      if (!dryRun) {
        for (const doc of matches) {
          await financeDb.patch(doc._id, { userId: toUserId })
          patchedDocCount += 1
        }
      }

      touchedTables.push({
        table,
        matchedDocs: matches.length,
        patchedDocs: dryRun ? 0 : matches.length,
      })
    }

    if (!dryRun && patchedDocCount > 0) {
      await recordFinanceAuditEventSafe(financeDb, {
        action: 'phase0_claim_legacy_user_data',
        entityId: toUserId,
        entityType: 'legacy_data_claim',
        userId: toUserId,
        afterJson: JSON.stringify({
          fromUserId,
          toUserId,
          matchedDocCount,
          patchedDocCount,
          touchedTableCount: touchedTables.length,
          touchedTables,
        }),
        metadataJson: JSON.stringify({
          source: 'phase0_diagnostics_card',
          recordedAt: Date.now(),
        }),
      })
    }

    return {
      ok: true,
      dryRun,
      fromUserId,
      toUserId,
      matchedDocCount,
      patchedDocCount,
      touchedTableCount: touchedTables.length,
      touchedTables,
      note: 'Some embedded JSON metadata fields (for example actorUserId in audit metadata) may still contain the original userId.',
    }
  },
})

export const getCoreFinanceEditorData = query({
  args: {},
  handler: async (ctx) => {
    const userId = await viewerUserId(ctx)
    const financeDb = ctx.db as any

    if (!userId) {
      return {
        viewerAuthenticated: false,
        viewerUserId: null,
        accounts: [],
        incomes: [],
        bills: [],
        cards: [],
        loans: [],
        accountOptions: [],
      }
    }

    const [accounts, incomes, bills, cards, loans] = await Promise.all([
      collectUserDocs(financeDb, 'accounts', userId),
      collectUserDocs(financeDb, 'incomes', userId),
      collectUserDocs(financeDb, 'bills', userId),
      collectUserDocs(financeDb, 'cards', userId),
      collectUserDocs(financeDb, 'loans', userId),
    ])

    const sortedByNewest = <T extends Record<string, unknown>>(rows: T[]) =>
      rows
        .slice()
        .sort(
          (a, b) =>
            numberOr((b as any).createdAt ?? (b as any)._creationTime) -
            numberOr((a as any).createdAt ?? (a as any)._creationTime),
        )

    const mappedAccounts = sortedByNewest(accounts).map((row: any) => ({
      id: String(row._id),
      name: String(row.name ?? ''),
      type: String(row.type ?? 'asset'),
      balance: numberOr(row.balance),
      liquid: Boolean(row.liquid),
      createdAt: numberOr(row.createdAt ?? row._creationTime),
    }))

    return {
      viewerAuthenticated: true,
      viewerUserId: userId,
      accounts: mappedAccounts,
      accountOptions: mappedAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        liquid: account.liquid,
      })),
      incomes: sortedByNewest(incomes).map((row: any) => ({
        id: String(row._id),
        source: String(row.source ?? ''),
        amount: numberOr(row.amount),
        cadence: String(row.cadence ?? 'monthly'),
        receivedDay: clampDay(row.receivedDay),
        destinationAccountId:
          typeof row.destinationAccountId === 'string'
            ? row.destinationAccountId
            : row.destinationAccountId
              ? String(row.destinationAccountId)
              : null,
        customInterval: row.customInterval == null ? null : Math.max(1, Math.trunc(numberOr(row.customInterval, 1))),
        customUnit: row.customUnit == null ? null : String(row.customUnit),
        createdAt: numberOr(row.createdAt ?? row._creationTime),
      })),
      bills: sortedByNewest(bills).map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? ''),
        amount: numberOr(row.amount),
        cadence: String(row.cadence ?? 'monthly'),
        dueDay: clampDay(row.dueDay),
        autopay: Boolean(row.autopay),
        isSubscription: Boolean(row.isSubscription),
        category: row.category == null ? '' : String(row.category),
        scope: row.scope == null ? '' : String(row.scope),
        linkedAccountId:
          typeof row.linkedAccountId === 'string'
            ? row.linkedAccountId
            : row.linkedAccountId
              ? String(row.linkedAccountId)
              : null,
        cancelReminderDays:
          row.cancelReminderDays == null ? null : Math.max(0, Math.trunc(numberOr(row.cancelReminderDays))),
        deductible: row.deductible == null ? false : Boolean(row.deductible),
        createdAt: numberOr(row.createdAt ?? row._creationTime),
      })),
      cards: sortedByNewest(cards).map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? ''),
        creditLimit: numberOr(row.creditLimit),
        usedLimit: numberOr(row.usedLimit),
        interestRate: numberOr(row.interestRate),
        dueDay: clampDay(row.dueDay || 20),
        minimumPayment: numberOr(row.minimumPayment),
        spendPerMonth: numberOr(row.spendPerMonth),
        createdAt: numberOr(row.createdAt ?? row._creationTime),
      })),
      loans: sortedByNewest(loans).map((row: any) => ({
        id: String(row._id),
        name: String(row.name ?? ''),
        balance: numberOr(row.balance),
        principalBalance: numberOr(row.principalBalance),
        accruedInterest: numberOr(row.accruedInterest),
        cadence: String(row.cadence ?? 'monthly'),
        dueDay: clampDay(row.dueDay || 1),
        minimumPayment: numberOr(row.minimumPayment),
        minimumPaymentType: String(row.minimumPaymentType ?? 'fixed'),
        extraPayment: numberOr(row.extraPayment),
        subscriptionCost: numberOr(row.subscriptionCost),
        subscriptionOutstanding: numberOr(row.subscriptionOutstanding),
        subscriptionPaymentCount: Math.max(0, Math.trunc(numberOr(row.subscriptionPaymentCount))),
        createdAt: numberOr(row.createdAt ?? row._creationTime),
      })),
    }
  },
})

export const upsertCoreFinanceEntity = mutation({
  args: {
    entityType: v.union(
      v.literal('account'),
      v.literal('income'),
      v.literal('bill'),
      v.literal('card'),
      v.literal('loan'),
    ),
    id: v.optional(v.string()),
    values: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const table = PHASE_ONE_ENTITY_TABLES[args.entityType]
    const values = isRecord(args.values) ? args.values : {}
    const existing = args.id
      ? await getOwnedDocOrThrow(financeDb, table, args.id, userId)
      : null

    const beforeJson = existing ? JSON.stringify(existing) : undefined

    let docId: string
    if (args.entityType === 'account') {
      const patch = buildAccountPatch(values)
      if (existing) {
        await financeDb.patch(existing._id, patch)
        docId = String(existing._id)
      } else {
        docId = String(
          await financeDb.insert('accounts', {
            ...patch,
            createdAt: now,
            userId,
          }),
        )
      }
    } else if (args.entityType === 'income') {
      const patch = buildIncomePatch(values)
      if (existing) {
        await financeDb.patch(existing._id, patch)
        docId = String(existing._id)
      } else {
        docId = String(
          await financeDb.insert('incomes', {
            ...patch,
            createdAt: now,
            userId,
          }),
        )
      }
    } else if (args.entityType === 'bill') {
      const patch = buildBillPatch(values)
      if (existing) {
        await financeDb.patch(existing._id, patch)
        docId = String(existing._id)
      } else {
        docId = String(
          await financeDb.insert('bills', {
            ...patch,
            createdAt: now,
            userId,
          }),
        )
      }
    } else if (args.entityType === 'card') {
      const patch = buildCardPatch(values)
      if (existing) {
        await financeDb.patch(existing._id, patch)
        docId = String(existing._id)
      } else {
        docId = String(
          await financeDb.insert('cards', {
            ...patch,
            createdAt: now,
            userId,
          }),
        )
      }
    } else {
      const patch = buildLoanPatch(values, now, !existing)
      if (existing) {
        await financeDb.patch(existing._id, patch)
        docId = String(existing._id)
      } else {
        docId = String(
          await financeDb.insert('loans', {
            ...patch,
            createdAt: now,
            userId,
          }),
        )
      }
    }

    const after = await getOwnedDocOrThrow(financeDb, table, docId, userId)
    await recordFinanceAuditEventSafe(financeDb, {
      action: existing ? 'phase1_core_entity_update' : 'phase1_core_entity_create',
      entityId: docId,
      entityType: args.entityType,
      userId,
      beforeJson,
      afterJson: JSON.stringify(after),
      metadataJson: JSON.stringify({
        source: 'phase1_core_data_manager',
        entityType: args.entityType,
        recordedAt: now,
      }),
    })

    return {
      ok: true,
      entityType: args.entityType,
      id: docId,
      mode: existing ? 'updated' : 'created',
    }
  },
})

export const deleteCoreFinanceEntity = mutation({
  args: {
    entityType: v.union(
      v.literal('account'),
      v.literal('income'),
      v.literal('bill'),
      v.literal('card'),
      v.literal('loan'),
    ),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const table = PHASE_ONE_ENTITY_TABLES[args.entityType]
    const existing = await getOwnedDocOrThrow(financeDb, table, args.id, userId)

    await financeDb.delete(existing._id)

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase1_core_entity_delete',
      entityId: args.id,
      entityType: args.entityType,
      userId,
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(null),
      metadataJson: JSON.stringify({
        source: 'phase1_core_data_manager',
        entityType: args.entityType,
        recordedAt: Date.now(),
      }),
    })

    return {
      ok: true,
      entityType: args.entityType,
      id: args.id,
      mode: 'deleted',
    }
  },
})

export const getPhaseThreePurchaseWorkspace = query({
  args: {
    displayCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await viewerUserId(ctx)
    if (!userId) {
      return {
        viewerAuthenticated: false,
        viewerUserId: null,
        sourceKind: 'empty',
        transactionCount: 0,
        purchaseCount: 0,
        ledgerEntryCount: 0,
        ledgerLineCount: 0,
        splitCount: 0,
        displayCurrency: DEFAULT_DISPLAY_CURRENCY,
        locale: 'en-US',
        baseCurrency: DEFAULT_DISPLAY_CURRENCY,
        availableCurrencies: [] as Array<{ code: string; name: string }>,
        accountOptions: [] as Array<{ id: string; name: string; type: string }>,
        categories: [] as string[],
        ownershipOptions: ['personal', 'shared', 'business', 'household'],
        defaults: {
          purchaseCategory: '',
          purchaseOwnership: 'shared',
        },
        templates: [] as any[],
        transactions: [] as any[],
      }
    }

    const financeDb = ctx.db as any
    const ownerKey = `clerk:${userId}`
    const limit = Math.max(10, Math.min(300, Math.trunc(numberOr(args.limit, 120))))

    const [accounts, cards, loans, bills, prefDoc, dashboardPrefDoc, purchases, purchaseSplits, templates, ledgerEntries, ledgerLines, currencyDocs, fxDocs] =
      await Promise.all([
        collectUserDocs(financeDb, 'accounts', userId),
        collectUserDocs(financeDb, 'cards', userId),
        collectUserDocs(financeDb, 'loans', userId),
        collectUserDocs(financeDb, 'bills', userId),
        findUserDoc(financeDb, 'financePreferences', userId),
        ctx.db
          .query('dashboardPreferences')
          .withIndex('by_owner', (q) => q.eq('ownerKey', ownerKey))
          .unique(),
        collectUserDocs(financeDb, 'purchases', userId),
        collectUserDocs(financeDb, 'purchaseSplits', userId),
        collectUserDocs(financeDb, 'purchaseSplitTemplates', userId),
        collectUserDocs(financeDb, 'ledgerEntries', userId),
        collectUserDocs(financeDb, 'ledgerLines', userId),
        ctx.db.query('currencyCatalog').collect(),
        ctx.db.query('fxRates').collect(),
      ])

    const currencyCatalog = currencyDocs
      .map((row: any) => ({
        code: normalizeCurrencyCode(row.code),
        name: String(row.name ?? normalizeCurrencyCode(row.code)),
        fractionDigits: Math.max(0, Math.trunc(numberOr(row.fractionDigits, currencyFractionDigits(row.code)))),
      }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const currencySet = new Set(currencyCatalog.map((row) => row.code))
    const fxMap = new Map<string, { rate: number; synthetic: boolean; asOfMs: number; source: string }>()
    for (const row of fxDocs) {
      if (normalizeCurrencyCode((row as any).baseCurrency) !== 'USD') continue
      fxMap.set(normalizeCurrencyCode((row as any).quoteCurrency), {
        rate: numberOr((row as any).rate, 1),
        synthetic: Boolean((row as any).synthetic),
        asOfMs: Math.trunc(numberOr((row as any).asOfMs, Date.now())),
        source: String((row as any).source ?? 'unknown'),
      })
    }

    const fractionDigitsByCurrency = new Map<string, number>(
      currencyCatalog.map((row) => [row.code, row.fractionDigits]),
    )
    const baseCurrencyCandidate = normalizeCurrencyCode(
      optionalString((prefDoc as any)?.currency) ?? DEFAULT_DISPLAY_CURRENCY,
    )
    const baseCurrency = currencySet.has(baseCurrencyCandidate)
      ? baseCurrencyCandidate
      : DEFAULT_DISPLAY_CURRENCY
    const displayCurrencyCandidate = normalizeCurrencyCode(
      args.displayCurrency ??
        (dashboardPrefDoc as any)?.displayCurrency ??
        (prefDoc as any)?.currency ??
        baseCurrency,
    )
    const displayCurrency = currencySet.has(displayCurrencyCandidate)
      ? displayCurrencyCandidate
      : baseCurrency
    const locale = sanitizeLocale(
      args.locale ??
        (dashboardPrefDoc as any)?.locale ??
        optionalString((prefDoc as any)?.locale) ??
        'en-US',
    )
    const converter = createConverter({
      targetCurrency: displayCurrency,
      fxMap,
      fractionDigitsByCurrency,
    })

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
    ]
      .sort((a, b) => a.name.localeCompare(b.name))

    const accountNameById = new Map(accountOptions.map((row) => [row.id, row.name]))
    const purchaseById = new Map(purchases.map((row: any) => [String(row._id), row]))
    const splitGroupsByPurchaseId = new Map<string, any[]>()
    const splitGroupsByTemplateId = new Map<string, any[]>()
    for (const row of purchaseSplits) {
      const purchaseId = optionalString((row as any).purchaseId)
      const templateId = optionalString((row as any).templateId)
      if (purchaseId) {
        const group = splitGroupsByPurchaseId.get(purchaseId) ?? []
        group.push(row)
        splitGroupsByPurchaseId.set(purchaseId, group)
      }
      if (templateId) {
        const group = splitGroupsByTemplateId.get(templateId) ?? []
        group.push(row)
        splitGroupsByTemplateId.set(templateId, group)
      }
    }

    const lineGroupsByEntryId = new Map<string, any[]>()
    for (const row of ledgerLines) {
      const entryId =
        optionalString((row as any).entryId) ??
        optionalString((row as any).ledgerEntryId) ??
        optionalString((row as any).parentEntryId)
      if (!entryId) continue
      const group = lineGroupsByEntryId.get(entryId) ?? []
      group.push(row)
      lineGroupsByEntryId.set(entryId, group)
    }

    const templateRows = templates
      .slice()
      .sort(
        (a: any, b: any) =>
          numberOr((b as any).updatedAt ?? (b as any).createdAt ?? (b as any)._creationTime) -
          numberOr((a as any).updatedAt ?? (a as any).createdAt ?? (a as any)._creationTime),
      )
      .map((row: any) => {
        const parsed = parsePhaseThreeTemplateSplits(row.splitsJson)
        const fallbackSplits = (splitGroupsByTemplateId.get(String(row._id)) ?? []).map((split: any) => ({
          label: String(split.label ?? split.name ?? 'Split'),
          amount: Math.max(0, numberOr(split.amount)),
          category: optionalString(split.category) ?? '',
          ownership: normalizePhaseThreeOwnership(optionalString(split.ownership)),
          linkedAccountId: optionalString(split.linkedAccountId),
          note: optionalString(split.note),
          ratio: numberOr(split.ratio),
          lineOrder: Math.max(0, Math.trunc(numberOr(split.lineOrder))),
        }))
        const splits = (parsed.length ? parsed : fallbackSplits)
          .filter((split) => isRecord(split))
          .map((split, index) => ({
            label: String((split as any).label ?? (split as any).name ?? `Split ${index + 1}`),
            amount: Math.max(0, numberOr((split as any).amount)),
            category: optionalString((split as any).category) ?? '',
            ownership: normalizePhaseThreeOwnership(optionalString((split as any).ownership)),
            linkedAccountId: optionalString((split as any).linkedAccountId),
            note: optionalString((split as any).note),
            ratio: numberOr((split as any).ratio),
            lineOrder: Math.max(0, Math.trunc(numberOr((split as any).lineOrder, index))),
          }))
          .sort((a, b) => a.lineOrder - b.lineOrder)

        return {
          id: String(row._id),
          name: String(row.name ?? 'Template'),
          description: optionalString(row.description) ?? '',
          currency: normalizeCurrencyCode(optionalString(row.currency) ?? displayCurrency),
          defaultCategory: optionalString(row.defaultCategory) ?? '',
          defaultOwnership: normalizePhaseThreeOwnership(optionalString(row.defaultOwnership)),
          splitCount: Math.max(0, Math.trunc(numberOr(row.splitCount, splits.length))),
          createdAt: Math.trunc(numberOr(row.createdAt ?? row._creationTime)),
          updatedAt: Math.trunc(numberOr(row.updatedAt ?? row.createdAt ?? row._creationTime)),
          shoppingPlan: parsePhaseThreeShoppingPlan((row as any).shoppingPlanJson),
          splits,
        }
      })

    const sortedLedgerEntries = ledgerEntries
      .slice()
      .sort(
        (a: any, b: any) =>
          numberOr((b as any).postedAt ?? (b as any).occurredAt ?? (b as any).createdAt ?? (b as any)._creationTime) -
          numberOr((a as any).postedAt ?? (a as any).occurredAt ?? (a as any).createdAt ?? (a as any)._creationTime),
      )

    const ledgerTransactions = sortedLedgerEntries.slice(0, limit).map((entry: any) => {
      const entryId = String(entry._id)
      const relatedLines = lineGroupsByEntryId.get(entryId) ?? []
      const purchaseId = optionalString(entry.purchaseId) ?? optionalString(entry.sourceId)
      const purchase = purchaseId ? purchaseById.get(purchaseId) ?? null : null
      const entryCurrency = normalizeCurrencyCode(
        optionalString(entry.currency) ??
          optionalString(purchase?.currency) ??
          baseCurrency,
      )

      const fundingLine = relatedLines.find(
        (line) =>
          normalizePhaseThreeLineType(optionalString((line as any).lineType)) === 'funding',
      )
      const allocationLines = relatedLines.filter(
        (line) =>
          normalizePhaseThreeLineType(optionalString((line as any).lineType)) !== 'funding',
      )

      let nativeAmount = numberOr(entry.amount, Number.NaN)
      if (!Number.isFinite(nativeAmount) && fundingLine) {
        nativeAmount = numberOr((fundingLine as any).amount)
      }
      if (!Number.isFinite(nativeAmount) && purchase) {
        nativeAmount = -Math.abs(numberOr((purchase as any).amount))
      }
      if (!Number.isFinite(nativeAmount)) {
        nativeAmount = 0
      }

      const accountId =
        optionalString((fundingLine as any)?.accountId) ??
        optionalString((fundingLine as any)?.linkedAccountId) ??
        optionalString(entry.accountId) ??
        optionalString(entry.paymentAccountId) ??
        optionalString((purchase as any)?.paymentAccountId)
      const accountName =
        (accountId ? accountNameById.get(accountId) : undefined) ??
        optionalString((fundingLine as any)?.accountName) ??
        optionalString(entry.accountName) ??
        optionalString(entry.paymentAccountName) ??
        'Unassigned'

      const dominantCategory = phaseThreeDominantCategory(allocationLines)
      const category =
        optionalString(entry.category) ??
        dominantCategory ??
        optionalString((purchase as any)?.defaultCategory) ??
        'Uncategorized'

      const ownershipSummary = phaseThreeOwnershipSummary(allocationLines)
      const merchant =
        optionalString(entry.merchant) ??
        optionalString((purchase as any)?.merchant) ??
        optionalString(entry.description) ??
        'Purchase'
      const note =
        optionalString(entry.note) ??
        optionalString((purchase as any)?.note) ??
        optionalString(entry.memo) ??
        'Posted from Phase 3 purchase workflow'
      const entryTime =
        numberOr(entry.postedAt ?? entry.occurredAt ?? entry.purchaseAt ?? entry.createdAt ?? entry._creationTime) ||
        Date.now()
      const isoDate = new Date(entryTime).toISOString()
      const status = normalizePhaseThreeStatus(optionalString(entry.status))
      const transactionType = normalizePhaseThreeTransactionType(
        optionalString(entry.transactionType) ?? optionalString(entry.entryType),
        nativeAmount,
      )

      return {
        id: `ledger-${entryId}`,
        date: isoDate,
        merchant,
        account: accountName,
        category,
        note: ownershipSummary ? `${note} · ${ownershipSummary}` : note,
        amount: converter.fromMinor(toMinor(nativeAmount, entryCurrency), entryCurrency),
        currency: displayCurrency,
        originalAmount:
          entryCurrency !== displayCurrency
            ? roundForCurrency(nativeAmount, entryCurrency, fractionDigitsByCurrency)
            : undefined,
        originalCurrency: entryCurrency !== displayCurrency ? entryCurrency : undefined,
        type: transactionType,
        status,
      }
    })

    const categoryCandidates = new Set<string>()
    for (const bill of bills) {
      const category = optionalString((bill as any).category)
      if (category) categoryCandidates.add(category)
    }
    for (const row of purchaseSplits) {
      const category = optionalString((row as any).category)
      if (category) categoryCandidates.add(category)
    }
    for (const row of templates) {
      const category = optionalString((row as any).defaultCategory)
      if (category) categoryCandidates.add(category)
    }

    return {
      viewerAuthenticated: true,
      viewerUserId: userId,
      sourceKind: ledgerTransactions.length ? 'real-ledger' : 'empty',
      transactionCount: ledgerTransactions.length,
      purchaseCount: purchases.length,
      ledgerEntryCount: ledgerEntries.length,
      ledgerLineCount: ledgerLines.length,
      splitCount: purchaseSplits.length,
      displayCurrency,
      locale,
      baseCurrency,
      availableCurrencies: currencyCatalog.map((row) => ({
        code: row.code,
        name: row.name,
      })),
      accountOptions,
      categories: Array.from(categoryCandidates).sort((a, b) => a.localeCompare(b)),
      ownershipOptions: ['personal', 'shared', 'business', 'household'],
      defaults: {
        purchaseCategory: optionalString((prefDoc as any)?.defaultPurchaseCategory) ?? '',
        purchaseOwnership: normalizePhaseThreeOwnership(
          optionalString((prefDoc as any)?.defaultPurchaseOwnership),
        ),
      },
      templates: templateRows,
      transactions: ledgerTransactions,
    }
  },
})

export const recordPurchaseWithLedgerPosting = mutation({
  args: {
    merchant: v.string(),
    amount: v.number(),
    currency: v.optional(v.string()),
    note: v.optional(v.string()),
    purchaseAt: v.optional(v.number()),
    paymentAccountId: v.optional(v.string()),
    paymentAccountName: v.optional(v.string()),
    category: v.optional(v.string()),
    ownership: v.optional(v.string()),
    templateId: v.optional(v.string()),
    splits: v.optional(
      v.array(
        v.object({
          label: v.string(),
          amount: v.number(),
          category: v.optional(v.string()),
          ownership: v.optional(v.string()),
          linkedAccountId: v.optional(v.string()),
          note: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const merchant = requiredString(args.merchant, 'Merchant')
    const rawAmount = Math.max(0, numberOr(args.amount))
    if (rawAmount <= 0) {
      throw new Error('Purchase amount must be greater than zero')
    }

    const prefDoc = await findUserDoc(financeDb, 'financePreferences', userId)
    const currency = normalizeCurrencyCode(
      args.currency ??
        optionalString((prefDoc as any)?.currency) ??
        DEFAULT_DISPLAY_CURRENCY,
    )
    const timezone = normalizeTimeZone(optionalString((prefDoc as any)?.timezone) ?? 'UTC')
    const currencyDigits = currencyFractionDigits(currency)
    const currencyFactor = 10 ** currencyDigits
    const totalAmount = Math.round(rawAmount * currencyFactor) / currencyFactor
    const purchaseAt = Math.max(0, Math.trunc(numberOr(args.purchaseAt, now)))
    const defaultCategory =
      optionalString(args.category) ??
      optionalString((prefDoc as any)?.defaultPurchaseCategory) ??
      'Uncategorized'
    const defaultOwnership = normalizePhaseThreeOwnership(
      optionalString(args.ownership) ??
        optionalString((prefDoc as any)?.defaultPurchaseOwnership),
    )
    const normalizedSplits = normalizePhaseThreePurchaseSplits({
      splits: args.splits ?? [],
      totalAmount,
      currency,
      defaultCategory,
      defaultOwnership,
    })

    const [accounts, cards, loans, currencyDocs, fxDocs] = await Promise.all([
      collectUserDocs(financeDb, 'accounts', userId),
      collectUserDocs(financeDb, 'cards', userId),
      collectUserDocs(financeDb, 'loans', userId),
      safeCollectDocs(financeDb, 'currencyCatalog'),
      safeCollectDocs(financeDb, 'fxRates'),
    ])
    const fractionDigitsByCurrency = buildFractionDigitsByCurrency(currencyDocs)
    const fxMap = buildFxMapFromRateRows(fxDocs)
    const baseCurrency = normalizeCurrencyCode(
      optionalString((prefDoc as any)?.currency) ?? DEFAULT_DISPLAY_CURRENCY,
    )
    const purchaseFxSnapshot = buildPostedFxSnapshot({
      amount: totalAmount,
      currency,
      baseCurrency,
      postedAt: purchaseAt,
      fxMap,
      fractionDigitsByCurrency,
    })
    const purchaseFxSnapshotJson = JSON.stringify(purchaseFxSnapshot)
    const accountNameById = new Map<string, string>([
      ...accounts.map(
        (row: any) => [String(row._id), String(row.name ?? 'Account')] as [string, string],
      ),
      ...cards.map(
        (row: any) => [String(row._id), String(row.name ?? 'Card')] as [string, string],
      ),
      ...loans.map(
        (row: any) => [String(row._id), String(row.name ?? 'Loan')] as [string, string],
      ),
    ])
    const validAccountReferenceIds = new Set(accountNameById.keys())
    const paymentAccountId = optionalString(args.paymentAccountId)
    if (paymentAccountId && !validAccountReferenceIds.has(paymentAccountId)) {
      throw new Error('Invalid payment account reference')
    }
    for (const split of normalizedSplits) {
      if (split.linkedAccountId && !validAccountReferenceIds.has(split.linkedAccountId)) {
        throw new Error(`Invalid linked account reference for split "${split.label}"`)
      }
    }
    const paymentAccountName =
      optionalString(args.paymentAccountName) ??
      (paymentAccountId ? accountNameById.get(paymentAccountId) : undefined) ??
      'Unassigned'

    const purchaseInsert: Record<string, unknown> = {
      userId,
      merchant,
      amount: totalAmount,
      amountMinor: toMinor(totalAmount, currency).toString(),
      currency,
      currencyFractionDigits: currencyDigits,
      nativeAmount: totalAmount,
      nativeAmountMinor: toMinor(totalAmount, currency).toString(),
      nativeCurrency: currency,
      nativeCurrencyFractionDigits: currencyDigits,
      timezone,
      baseCurrency,
      baseAmount: purchaseFxSnapshot.baseAmount,
      baseAmountMinor: purchaseFxSnapshot.baseAmountMinor,
      fxRateToBase: purchaseFxSnapshot.fxRateNativeToBase,
      fxAsOfMs: purchaseFxSnapshot.fxAsOfMs,
      fxSource: purchaseFxSnapshot.fxSource,
      fxSynthetic: purchaseFxSnapshot.fxSynthetic,
      fxSnapshotJson: purchaseFxSnapshotJson,
      note: optionalString(args.note),
      createdAt: now,
      updatedAt: now,
      purchaseAt,
      status: 'posted',
      paymentAccountId,
      paymentAccountName,
      defaultCategory,
      defaultOwnership,
      templateId: optionalString(args.templateId),
      splitCount: normalizedSplits.length,
      source: 'phase3_purchase_entry',
    }
    const purchaseId = String(await financeDb.insert('purchases', compactObject(purchaseInsert)))

    let splitCount = 0
    for (const [index, split] of normalizedSplits.entries()) {
      const splitFxSnapshot = buildPostedFxSnapshot({
        amount: split.amount,
        currency,
        baseCurrency,
        postedAt: purchaseAt,
        fxMap,
        fractionDigitsByCurrency,
      })
      await financeDb.insert(
        'purchaseSplits',
        compactObject({
          userId,
          purchaseId,
          createdAt: now,
          updatedAt: now,
          lineOrder: index,
          label: split.label,
          amount: split.amount,
          amountMinor: toMinor(split.amount, currency).toString(),
          category: split.category,
          ownership: split.ownership,
          linkedAccountId: split.linkedAccountId,
          note: split.note,
          ratio: split.ratio,
          currency,
          currencyFractionDigits: currencyDigits,
          nativeAmount: split.amount,
          nativeAmountMinor: toMinor(split.amount, currency).toString(),
          nativeCurrency: currency,
          timezone,
          baseCurrency,
          baseAmount: splitFxSnapshot.baseAmount,
          baseAmountMinor: splitFxSnapshot.baseAmountMinor,
          fxRateToBase: splitFxSnapshot.fxRateNativeToBase,
          fxAsOfMs: splitFxSnapshot.fxAsOfMs,
          fxSource: splitFxSnapshot.fxSource,
          fxSynthetic: splitFxSnapshot.fxSynthetic,
          fxSnapshotJson: JSON.stringify(splitFxSnapshot),
        }),
      )
      splitCount += 1
    }

    const entryAmount = -Math.abs(totalAmount)
    const entryFxSnapshot = buildPostedFxSnapshot({
      amount: Math.abs(entryAmount),
      currency,
      baseCurrency,
      postedAt: purchaseAt,
      fxMap,
      fractionDigitsByCurrency,
    })
    const entryFxSnapshotJson = JSON.stringify({
      ...entryFxSnapshot,
      nativeSignedAmount: entryAmount,
      nativeSignedAmountMinor: toMinor(entryAmount, currency).toString(),
      baseSignedAmount: roundForCurrency(entryAmount * entryFxSnapshot.fxRateNativeToBase, baseCurrency, fractionDigitsByCurrency),
      baseSignedAmountMinor: toMinor(
        roundForCurrency(entryAmount * entryFxSnapshot.fxRateNativeToBase, baseCurrency, fractionDigitsByCurrency),
        baseCurrency,
      ).toString(),
    })
    const ledgerEntryId = String(
      await financeDb.insert(
        'ledgerEntries',
        compactObject({
          userId,
          createdAt: now,
          updatedAt: now,
          postedAt: purchaseAt,
          occurredAt: purchaseAt,
          purchaseAt,
          purchaseId,
          sourceId: purchaseId,
          sourceType: 'purchase',
          entryType: 'purchase',
          transactionType: 'expense',
          merchant,
          note: optionalString(args.note),
          currency,
          amount: entryAmount,
          amountMinor: toMinor(entryAmount, currency).toString(),
          currencyFractionDigits: currencyDigits,
          nativeAmount: Math.abs(entryAmount),
          nativeAmountMinor: toMinor(Math.abs(entryAmount), currency).toString(),
          nativeSignedAmount: entryAmount,
          nativeSignedAmountMinor: toMinor(entryAmount, currency).toString(),
          nativeCurrency: currency,
          timezone,
          baseCurrency,
          baseAmount: entryFxSnapshot.baseAmount,
          baseAmountMinor: entryFxSnapshot.baseAmountMinor,
          baseSignedAmount: roundForCurrency(entryAmount * entryFxSnapshot.fxRateNativeToBase, baseCurrency, fractionDigitsByCurrency),
          baseSignedAmountMinor: toMinor(
            roundForCurrency(entryAmount * entryFxSnapshot.fxRateNativeToBase, baseCurrency, fractionDigitsByCurrency),
            baseCurrency,
          ).toString(),
          fxRateToBase: entryFxSnapshot.fxRateNativeToBase,
          fxAsOfMs: entryFxSnapshot.fxAsOfMs,
          fxSource: entryFxSnapshot.fxSource,
          fxSynthetic: entryFxSnapshot.fxSynthetic,
          fxSnapshotJson: entryFxSnapshotJson,
          status: 'posted',
          paymentAccountId,
          paymentAccountName,
          category: defaultCategory,
          splitCount: normalizedSplits.length,
          lineCount: normalizedSplits.length + 1,
        }),
      ),
    )

    let lineCount = 0
    const fundingLineFxSnapshot = buildPostedFxSnapshot({
      amount: Math.abs(entryAmount),
      currency,
      baseCurrency,
      postedAt: purchaseAt,
      fxMap,
      fractionDigitsByCurrency,
    })
    await financeDb.insert(
      'ledgerLines',
      compactObject({
        userId,
        createdAt: now,
        updatedAt: now,
        postedAt: purchaseAt,
        entryId: ledgerEntryId,
        ledgerEntryId,
        purchaseId,
        lineOrder: 0,
        lineType: 'funding',
        direction: 'credit',
        amount: entryAmount,
        amountMinor: toMinor(entryAmount, currency).toString(),
        currency,
        currencyFractionDigits: currencyDigits,
        nativeAmount: Math.abs(entryAmount),
        nativeAmountMinor: toMinor(Math.abs(entryAmount), currency).toString(),
        nativeSignedAmount: entryAmount,
        nativeSignedAmountMinor: toMinor(entryAmount, currency).toString(),
        nativeCurrency: currency,
        timezone,
        baseCurrency,
        baseAmount: fundingLineFxSnapshot.baseAmount,
        baseAmountMinor: fundingLineFxSnapshot.baseAmountMinor,
        baseSignedAmount: roundForCurrency(entryAmount * fundingLineFxSnapshot.fxRateNativeToBase, baseCurrency, fractionDigitsByCurrency),
        baseSignedAmountMinor: toMinor(
          roundForCurrency(entryAmount * fundingLineFxSnapshot.fxRateNativeToBase, baseCurrency, fractionDigitsByCurrency),
          baseCurrency,
        ).toString(),
        fxRateToBase: fundingLineFxSnapshot.fxRateNativeToBase,
        fxAsOfMs: fundingLineFxSnapshot.fxAsOfMs,
        fxSource: fundingLineFxSnapshot.fxSource,
        fxSynthetic: fundingLineFxSnapshot.fxSynthetic,
        fxSnapshotJson: JSON.stringify(fundingLineFxSnapshot),
        accountId: paymentAccountId,
        accountName: paymentAccountName,
        ownership: normalizedSplits.length > 1 ? 'mixed' : normalizedSplits[0]?.ownership ?? defaultOwnership,
        category: 'Funding',
        label: `Funding · ${paymentAccountName}`,
      }),
    )
    lineCount += 1

    for (const [index, split] of normalizedSplits.entries()) {
      const splitLineFxSnapshot = buildPostedFxSnapshot({
        amount: split.amount,
        currency,
        baseCurrency,
        postedAt: purchaseAt,
        fxMap,
        fractionDigitsByCurrency,
      })
      await financeDb.insert(
        'ledgerLines',
        compactObject({
          userId,
          createdAt: now,
          updatedAt: now,
          postedAt: purchaseAt,
          entryId: ledgerEntryId,
          ledgerEntryId,
          purchaseId,
          lineOrder: index + 1,
          lineType: 'allocation',
          direction: 'debit',
          amount: split.amount,
          amountMinor: toMinor(split.amount, currency).toString(),
          currency,
          currencyFractionDigits: currencyDigits,
          nativeAmount: split.amount,
          nativeAmountMinor: toMinor(split.amount, currency).toString(),
          nativeSignedAmount: split.amount,
          nativeSignedAmountMinor: toMinor(split.amount, currency).toString(),
          nativeCurrency: currency,
          timezone,
          baseCurrency,
          baseAmount: splitLineFxSnapshot.baseAmount,
          baseAmountMinor: splitLineFxSnapshot.baseAmountMinor,
          baseSignedAmount: splitLineFxSnapshot.baseAmount,
          baseSignedAmountMinor: splitLineFxSnapshot.baseAmountMinor,
          fxRateToBase: splitLineFxSnapshot.fxRateNativeToBase,
          fxAsOfMs: splitLineFxSnapshot.fxAsOfMs,
          fxSource: splitLineFxSnapshot.fxSource,
          fxSynthetic: splitLineFxSnapshot.fxSynthetic,
          fxSnapshotJson: JSON.stringify(splitLineFxSnapshot),
          category: split.category,
          ownership: split.ownership,
          label: split.label,
          note: split.note,
          linkedAccountId: split.linkedAccountId,
          ratio: split.ratio,
        }),
      )
      lineCount += 1
    }

    try {
      await financeDb.patch(purchaseId, {
        ledgerEntryId,
        updatedAt: now,
      })
    } catch {
      const purchaseDoc = await getOwnedDocOrThrow(financeDb, 'purchases', purchaseId, userId)
      await financeDb.patch(purchaseDoc._id, {
        ledgerEntryId,
        updatedAt: now,
      })
    }

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase3_purchase_posted',
      entityId: purchaseId,
      entityType: 'purchase',
      userId,
      afterJson: JSON.stringify({
        purchaseId,
        ledgerEntryId,
        splitCount,
        lineCount,
        amount: totalAmount,
        currency,
        amountMinor: toMinor(totalAmount, currency).toString(),
        baseCurrency,
        baseAmount: purchaseFxSnapshot.baseAmount,
        baseAmountMinor: purchaseFxSnapshot.baseAmountMinor,
        fxRateToBase: purchaseFxSnapshot.fxRateNativeToBase,
        fxAsOfMs: purchaseFxSnapshot.fxAsOfMs,
      }),
      metadataJson: JSON.stringify({
        source: 'phase3_purchase_entry_dialog',
        recordedAt: now,
        paymentAccountId: paymentAccountId ?? null,
        timezone,
        fxSnapshot: purchaseFxSnapshot,
      }),
    })

    return {
      ok: true,
      purchaseId,
      ledgerEntryId,
      splitCount,
      lineCount,
      amount: totalAmount,
      currency,
      amountMinor: toMinor(totalAmount, currency).toString(),
      baseCurrency,
      baseAmount: purchaseFxSnapshot.baseAmount,
      fxRateToBase: purchaseFxSnapshot.fxRateNativeToBase,
      fxAsOfMs: purchaseFxSnapshot.fxAsOfMs,
      timezone,
      postedAt: purchaseAt,
    }
  },
})

export const upsertPurchaseSplitTemplate = mutation({
  args: {
    id: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    currency: v.optional(v.string()),
    defaultCategory: v.optional(v.string()),
    defaultOwnership: v.optional(v.string()),
    splits: v.array(
      v.object({
        label: v.string(),
        amount: v.number(),
        category: v.optional(v.string()),
        ownership: v.optional(v.string()),
        linkedAccountId: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
    shoppingPlan: v.optional(
      v.union(
        v.null(),
        v.object({
          enabled: v.optional(v.boolean()),
          unitLabel: v.optional(v.string()),
          quantityPerCycle: v.number(),
          cycleInterval: v.number(),
          cycleUnit: v.string(),
          shopsPerCycle: v.number(),
          costPerItem: v.number(),
          preferredAccountId: v.optional(v.string()),
          anchorDate: v.optional(v.string()),
          stockOnHandUnits: v.optional(v.number()),
          lowStockThresholdDays: v.optional(v.number()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)

    const financeDb = ctx.db as any
    const now = Date.now()
    const name = requiredString(args.name, 'Template name')
    const templateCurrency = normalizeCurrencyCode(args.currency ?? DEFAULT_DISPLAY_CURRENCY)
    const normalizedSplits = normalizePhaseThreePurchaseSplits({
      splits: args.splits,
      totalAmount: Math.max(
        0.01,
        args.splits.reduce((sum, split) => sum + Math.max(0, numberOr(split.amount)), 0),
      ),
      currency: templateCurrency,
      defaultCategory: optionalString(args.defaultCategory) ?? 'Uncategorized',
      defaultOwnership: normalizePhaseThreeOwnership(optionalString(args.defaultOwnership)),
    })
    const normalizedShoppingPlan =
      args.shoppingPlan === undefined
        ? undefined
        : args.shoppingPlan === null
          ? null
          : {
              enabled: args.shoppingPlan.enabled !== false,
              unitLabel: optionalString(args.shoppingPlan.unitLabel) ?? 'items',
              quantityPerCycle: Math.max(0.01, numberOr(args.shoppingPlan.quantityPerCycle, 1)),
              cycleInterval: Math.max(1, Math.trunc(numberOr(args.shoppingPlan.cycleInterval, 1))),
              cycleUnit: normalizeShoppingPlanCycleUnit(args.shoppingPlan.cycleUnit),
              shopsPerCycle: Math.max(1, Math.trunc(numberOr(args.shoppingPlan.shopsPerCycle, 1))),
              costPerItem: Math.max(0, numberOr(args.shoppingPlan.costPerItem, 0)),
              preferredAccountId: optionalString(args.shoppingPlan.preferredAccountId),
              anchorDate: normalizeOptionalYmd(optionalString(args.shoppingPlan.anchorDate)),
              stockOnHandUnits: Math.max(
                0,
                numberOr(args.shoppingPlan.stockOnHandUnits, 0),
              ),
              lowStockThresholdDays: Math.max(
                1,
                Math.trunc(numberOr(args.shoppingPlan.lowStockThresholdDays, 7)),
              ),
            }

    const payload = compactObject({
      userId,
      name,
      description: optionalString(args.description),
      currency: templateCurrency,
      defaultCategory: optionalString(args.defaultCategory),
      defaultOwnership: normalizePhaseThreeOwnership(optionalString(args.defaultOwnership)),
      splitCount: normalizedSplits.length,
      splitsJson: JSON.stringify(normalizedSplits),
      shoppingPlanJson:
        normalizedShoppingPlan === undefined
          ? undefined
          : normalizedShoppingPlan === null
            ? null
            : JSON.stringify(normalizedShoppingPlan),
      updatedAt: now,
    })

    let id: string
    let mode: 'created' | 'updated' = 'created'
    if (args.id) {
      const existing = await getOwnedDocOrThrow(financeDb, 'purchaseSplitTemplates', args.id, userId)
      await financeDb.patch(existing._id, payload)
      id = String(existing._id)
      mode = 'updated'
    } else {
      id = String(
        await financeDb.insert('purchaseSplitTemplates', {
          ...payload,
          createdAt: now,
        }),
      )
    }

    await recordFinanceAuditEventSafe(financeDb, {
      action: mode === 'created' ? 'phase3_template_create' : 'phase3_template_update',
      entityId: id,
      entityType: 'purchase_split_template',
      userId,
      afterJson: JSON.stringify({
        id,
        name,
        splitCount: normalizedSplits.length,
        hasShoppingPlan:
          normalizedShoppingPlan === undefined
            ? undefined
            : normalizedShoppingPlan !== null,
      }),
      metadataJson: JSON.stringify({
        source: 'phase3_transactions_tab',
        recordedAt: now,
      }),
    })

    return {
      ok: true,
      id,
      mode,
      splitCount: normalizedSplits.length,
      name,
    }
  },
})

export const deletePurchaseSplitTemplate = mutation({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const financeDb = ctx.db
    const existing = await getOwnedDocOrThrow(financeDb, 'purchaseSplitTemplates', args.id, userId)
    await financeDb.delete(existing._id)

    await recordFinanceAuditEventSafe(financeDb, {
      action: 'phase3_template_delete',
      entityId: args.id,
      entityType: 'purchase_split_template',
      userId,
      beforeJson: JSON.stringify(existing),
      metadataJson: JSON.stringify({
        source: 'phase3_transactions_tab',
        recordedAt: Date.now(),
      }),
    })

    return {
      ok: true,
      id: args.id,
      mode: 'deleted',
    }
  },
})

function parsePhaseThreeTemplateSplits(value: unknown): any[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parsePhaseThreeShoppingPlan(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    if (!isRecord(parsed)) return null
    return {
      enabled: (parsed.enabled as boolean) !== false,
      unitLabel: optionalString(parsed.unitLabel) ?? 'items',
      quantityPerCycle: Math.max(0.01, numberOr(parsed.quantityPerCycle, 1)),
      cycleInterval: Math.max(1, Math.trunc(numberOr(parsed.cycleInterval, 1))),
      cycleUnit: normalizeShoppingPlanCycleUnit(optionalString(parsed.cycleUnit) ?? 'weeks'),
      shopsPerCycle: Math.max(1, Math.trunc(numberOr(parsed.shopsPerCycle, 1))),
      costPerItem: Math.max(0, numberOr(parsed.costPerItem, 0)),
      preferredAccountId: optionalString(parsed.preferredAccountId),
      anchorDate: normalizeOptionalYmd(optionalString(parsed.anchorDate)),
      stockOnHandUnits: Math.max(0, numberOr(parsed.stockOnHandUnits, 0)),
      lowStockThresholdDays: Math.max(
        1,
        Math.trunc(numberOr(parsed.lowStockThresholdDays, 7)),
      ),
    }
  } catch {
    return null
  }
}

function normalizeShoppingPlanCycleUnit(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('day')) return 'days'
  if (normalized.startsWith('month')) return 'months'
  return 'weeks'
}

function normalizeOptionalYmd(value: string | undefined | null) {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function normalizePhaseThreeOwnership(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return 'shared'
  if (normalized === 'personal') return 'personal'
  if (normalized === 'business') return 'business'
  if (normalized === 'household') return 'household'
  if (normalized === 'shared') return 'shared'
  return normalized
}

function normalizePhaseThreeStatus(value?: string) {
  return (value ?? '').trim().toLowerCase() === 'pending' ? 'pending' : 'posted'
}

function normalizePhaseThreeLineType(value?: string) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'funding' || normalized === 'payment') return 'funding'
  if (normalized === 'allocation' || normalized === 'split') return 'allocation'
  return normalized || 'allocation'
}

function normalizePhaseThreeTransactionType(value: string | undefined, amount: number): TransactionType {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'income') return 'income'
  if (normalized === 'transfer' || normalized === 'move') return 'transfer'
  if (normalized === 'expense' || normalized === 'purchase') return 'expense'
  if (amount > 0) return 'income'
  if (amount < 0) return 'expense'
  return 'transfer'
}

function phaseThreeDominantCategory(lines: any[]): string | null {
  const totals = new Map<string, number>()
  for (const line of lines) {
    const category = optionalString((line as any)?.category)
    if (!category) continue
    const amount = Math.abs(numberOr((line as any)?.amount))
    totals.set(category, (totals.get(category) ?? 0) + amount)
  }
  let best: { category: string; amount: number } | null = null
  for (const [category, amount] of totals) {
    if (!best || amount > best.amount) {
      best = { category, amount }
    }
  }
  return best?.category ?? null
}

function phaseThreeOwnershipSummary(lines: any[]): string {
  const ownerships = Array.from(
    new Set(
      lines
        .map((line) => normalizePhaseThreeOwnership(optionalString((line as any)?.ownership)))
        .filter(Boolean),
    ),
  )
  if (ownerships.length === 0) return ''
  if (ownerships.length === 1) return ownerships[0]!
  return `${ownerships.length} ownerships`
}

function normalizePhaseThreePurchaseSplits({
  splits,
  totalAmount,
  currency,
  defaultCategory,
  defaultOwnership,
}: {
  splits: Array<{
    label: string
    amount: number
    category?: string
    ownership?: string
    linkedAccountId?: string
    note?: string
  }>
  totalAmount: number
  currency: string
  defaultCategory: string
  defaultOwnership: string
}) {
  const digits = currencyFractionDigits(currency)
  const factor = 10 ** digits
  const normalizedInput = splits
    .map((split, index) => ({
      label: optionalString(split.label) ?? `Split ${index + 1}`,
      amount: Math.max(0, numberOr(split.amount)),
      category: optionalString(split.category) ?? defaultCategory,
      ownership: normalizePhaseThreeOwnership(optionalString(split.ownership) ?? defaultOwnership),
      linkedAccountId: optionalString(split.linkedAccountId),
      note: optionalString(split.note),
    }))
    .filter((split) => split.amount > 0)

  const seedSplits =
    normalizedInput.length > 0
      ? normalizedInput
      : [
          {
            label: 'Primary split',
            amount: totalAmount,
            category: defaultCategory,
            ownership: defaultOwnership,
            linkedAccountId: undefined,
            note: undefined,
          },
        ]

  const inputTotal = seedSplits.reduce((sum, split) => sum + split.amount, 0)
  const safeTotal = Math.max(totalAmount, 1 / factor)
  const scaled = seedSplits.map((split) => ({
    ...split,
    amount: Math.round((split.amount / Math.max(inputTotal, 1e-9)) * safeTotal * factor) / factor,
  }))

  const scaledTotal = scaled.reduce((sum, split) => sum + split.amount, 0)
  const delta = Math.round((safeTotal - scaledTotal) * factor) / factor
  if (scaled.length > 0 && Math.abs(delta) > 0) {
    scaled[scaled.length - 1]!.amount = Math.max(
      0,
      Math.round((scaled[scaled.length - 1]!.amount + delta) * factor) / factor,
    )
  }

  return scaled
    .map((split, index) => ({
      ...split,
      ratio: safeTotal > 0 ? split.amount / safeTotal : 0,
      lineOrder: index,
    }))
    .filter((split) => split.amount > 0)
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}

async function getOwnedDocOrThrow(
  db: any,
  table: string,
  id: string,
  userId: string,
) {
  return await sharedAssertOwnedDocOrThrow(db, table, id, userId)
}

function buildAccountPatch(values: Record<string, unknown>) {
  const type = normalizeAccountType(requiredString(values.type, 'Account type'))
  return {
    name: requiredString(values.name, 'Account name'),
    type,
    balance: numberOr(values.balance),
    liquid: type === 'debt' ? false : Boolean(values.liquid),
  }
}

function buildIncomePatch(values: Record<string, unknown>) {
  const cadence = normalizeCadence(optionalString(values.cadence) ?? 'monthly')
  const patch: Record<string, unknown> = {
    source: requiredString(values.source, 'Income source'),
    amount: Math.max(0, numberOr(values.amount)),
    cadence,
    receivedDay: clampDay(values.receivedDay || 1),
  }

  const destinationAccountId = optionalString(values.destinationAccountId)
  if (destinationAccountId) {
    patch.destinationAccountId = destinationAccountId
  }

  if (cadence === 'custom') {
    patch.customInterval = Math.max(1, Math.trunc(numberOr(values.customInterval, 1)))
    patch.customUnit = normalizeCustomUnit(optionalString(values.customUnit) ?? 'weeks')
  }

  return patch
}

function buildBillPatch(values: Record<string, unknown>) {
  const patch: Record<string, unknown> = {
    name: requiredString(values.name, 'Bill name'),
    amount: Math.max(0, numberOr(values.amount)),
    cadence: normalizeCadence(optionalString(values.cadence) ?? 'monthly'),
    dueDay: clampDay(values.dueDay || 1),
    autopay: Boolean(values.autopay),
    isSubscription: Boolean(values.isSubscription),
  }

  const linkedAccountId = optionalString(values.linkedAccountId)
  if (linkedAccountId) patch.linkedAccountId = linkedAccountId

  const category = optionalString(values.category)
  if (category) patch.category = category

  const scope = optionalString(values.scope)
  if (scope) patch.scope = scope

  if (values.cancelReminderDays !== '' && values.cancelReminderDays != null) {
    patch.cancelReminderDays = Math.max(0, Math.trunc(numberOr(values.cancelReminderDays)))
  }

  if (values.deductible != null) {
    patch.deductible = Boolean(values.deductible)
  }

  return patch
}

function buildCardPatch(values: Record<string, unknown>) {
  return {
    name: requiredString(values.name, 'Card name'),
    creditLimit: Math.max(0, numberOr(values.creditLimit)),
    usedLimit: Math.max(0, numberOr(values.usedLimit)),
    interestRate: Math.max(0, numberOr(values.interestRate)),
    dueDay: clampDay(values.dueDay || 20),
    minimumPayment: Math.max(0, numberOr(values.minimumPayment)),
    spendPerMonth: Math.max(0, numberOr(values.spendPerMonth)),
  }
}

function buildLoanPatch(
  values: Record<string, unknown>,
  now: number,
  forInsert: boolean,
) {
  const balance = Math.max(0, numberOr(values.balance))
  const principalBalance =
    values.principalBalance == null || values.principalBalance === ''
      ? balance
      : Math.max(0, numberOr(values.principalBalance))
  const patch: Record<string, unknown> = {
    name: requiredString(values.name, 'Loan name'),
    balance,
    principalBalance,
    accruedInterest: Math.max(0, numberOr(values.accruedInterest)),
    cadence: normalizeCadence(optionalString(values.cadence) ?? 'monthly'),
    dueDay: clampDay(values.dueDay || 1),
    extraPayment: Math.max(0, numberOr(values.extraPayment)),
    minimumPayment: Math.max(0, numberOr(values.minimumPayment)),
    minimumPaymentType: normalizeMinimumPaymentType(
      optionalString(values.minimumPaymentType) ?? 'fixed',
    ),
    subscriptionCost: Math.max(0, numberOr(values.subscriptionCost)),
    subscriptionOutstanding: Math.max(0, numberOr(values.subscriptionOutstanding)),
    subscriptionPaymentCount: Math.max(0, Math.trunc(numberOr(values.subscriptionPaymentCount))),
  }

  if (forInsert) {
    patch.lastCycleAt = Math.max(0, Math.trunc(numberOr(values.lastCycleAt, now)))
    patch.lastInterestAppliedAt = Math.max(
      0,
      Math.trunc(numberOr(values.lastInterestAppliedAt, now)),
    )
  }

  return patch
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string) {
  const parsed = optionalString(value)
  if (!parsed) {
    throw new Error(`${label} is required`)
  }
  return parsed
}

function optionalString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : undefined
  }
  return undefined
}

function normalizeCadence(value: string) {
  const allowed = new Set([
    'monthly',
    'weekly',
    'biweekly',
    'quarterly',
    'yearly',
    'annual',
    'custom',
  ])
  const normalized = value.trim().toLowerCase()
  return allowed.has(normalized) ? normalized : 'monthly'
}

function normalizeCustomUnit(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('day')) return 'days'
  if (normalized.startsWith('week')) return 'weeks'
  if (normalized.startsWith('month')) return 'months'
  if (normalized.startsWith('year')) return 'years'
  return 'weeks'
}

function normalizeMinimumPaymentType(value: string) {
  return value.trim().toLowerCase() === 'percentage' ? 'percentage' : 'fixed'
}

function normalizeAccountType(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'debt') return 'debt'
  if (normalized === 'savings') return 'savings'
  if (normalized === 'checking') return 'checking'
  if (normalized === 'investment' || normalized === 'brokerage') return 'investment'
  return normalized || 'checking'
}

async function safeCollectDocs(db: any, table: string): Promise<any[]> {
  return await sharedSafeCollectDocs(db, table)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const setPreferences = mutation({
  args: {
    displayCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const financeDb = ctx.db
    const ownerKey = `clerk:${userId}`
    const now = Date.now()
    const existing = await ctx.db
      .query('dashboardPreferences')
      .withIndex('by_owner', (q) => q.eq('ownerKey', ownerKey))
      .unique()

    const nextDisplayCurrency = normalizeCurrencyCode(
      args.displayCurrency ?? existing?.displayCurrency ?? DEFAULT_DISPLAY_CURRENCY,
    )
    const nextLocale = sanitizeLocale(args.locale ?? existing?.locale ?? 'en-US')

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayCurrency: nextDisplayCurrency,
        locale: nextLocale,
        updatedAtMs: now,
      })
    } else {
      await ctx.db.insert('dashboardPreferences', {
        ownerKey,
        displayCurrency: nextDisplayCurrency,
        locale: nextLocale,
        updatedAtMs: now,
      })
    }

    // Bootstrap the finance base currency once so newly-entered amounts are interpreted
    // in the user's configured currency instead of defaulting to USD.
    const existingFinancePreferences = await findUserDoc(financeDb, 'financePreferences', userId)
    const existingFinanceCurrency = optionalString(existingFinancePreferences?.currency)
    if (!existingFinanceCurrency) {
      const financePrefPatch = compactObject({
        userId,
        currency: nextDisplayCurrency,
        locale: optionalString(existingFinancePreferences?.locale) ?? nextLocale,
        updatedAt: now,
      })

      let financePrefId: string
      if (existingFinancePreferences) {
        await financeDb.patch(existingFinancePreferences._id, financePrefPatch)
        financePrefId = String(existingFinancePreferences._id)
      } else {
        financePrefId = String(await financeDb.insert('financePreferences', financePrefPatch))
      }

      await recordFinanceAuditEventSafe(financeDb, {
        action: 'finance_preferences_currency_bootstrap',
        entityId: financePrefId,
        entityType: 'finance_preferences',
        userId,
        beforeJson: existingFinancePreferences ? JSON.stringify(existingFinancePreferences) : undefined,
        afterJson: JSON.stringify({
          ...(existingFinancePreferences ?? {}),
          ...financePrefPatch,
        }),
        metadataJson: JSON.stringify({
          source: 'dashboard_header_currency_selector',
          recordedAt: now,
          reason: 'bootstrap_base_currency_from_display_preference',
        }),
      })
    }

    await recordFinanceAuditEventSafe(ctx.db, {
      action: 'dashboard_preferences_update',
      entityId: existing ? String(existing._id) : ownerKey,
      entityType: 'dashboard_preferences',
      userId,
      beforeJson: existing ? JSON.stringify(existing) : undefined,
      afterJson: JSON.stringify({
        ownerKey,
        displayCurrency: nextDisplayCurrency,
        locale: nextLocale,
        updatedAtMs: now,
      }),
      metadataJson: JSON.stringify({
        source: 'dashboard_header_currency_selector',
        recordedAt: now,
      }),
    })

    return {
      ok: true,
      ownerKey,
      displayCurrency: nextDisplayCurrency,
      locale: nextLocale,
    }
  },
})

export const seedDemoData = mutation({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await sharedRequireViewerUserId(ctx)
    const now = Date.now()
    await recordFinanceAuditEventSafe(ctx.db, {
      action: 'phase0_seed_demo_data_blocked',
      entityId: GLOBAL_SNAPSHOT_OWNER,
      entityType: 'dashboard_demo_seed',
      userId,
      afterJson: JSON.stringify({
        force: args.force ?? false,
        blocked: true,
      }),
      metadataJson: JSON.stringify({
        source: 'seed_demo_data_mutation',
        recordedAt: now,
        reason: 'demo_data_disabled',
      }),
    })
    throw new Error('Demo data seeding is disabled for this deployment.')
  },
})

async function seedCurrencyCatalog(
  ctx: MutationCtx,
  now: number,
): Promise<CurrencyCatalogRow[]> {
  const rows = buildCurrencyCatalog()
  for (const row of rows) {
    await ctx.db.insert('currencyCatalog', {
      code: row.code,
      name: row.name,
      fractionDigits: row.fractionDigits,
      symbol: row.symbol,
      active: true,
      updatedAtMs: now,
    })
  }
  return rows
}

async function seedUsdFxRates(
  ctx: MutationCtx,
  currencyRows: CurrencyCatalogRow[],
  now: number,
) {
  const usdRates = buildUsdQuoteRates(currencyRows.map((row) => row.code))
  for (const [quoteCurrency, spec] of usdRates.entries()) {
    await ctx.db.insert('fxRates', {
      pairKey: `USD_${quoteCurrency}`,
      baseCurrency: 'USD',
      quoteCurrency,
      rate: spec.rate,
      source: spec.source,
      synthetic: spec.synthetic,
      asOfMs: now,
      updatedAtMs: now,
    })
  }
}

async function clearTable(
  ctx: MutationCtx,
  table: 'dashboardSnapshots' | 'currencyCatalog' | 'fxRates',
) {
  const docs = await ctx.db.query(table).collect()
  for (const doc of docs) {
    await ctx.db.delete(doc._id)
  }
}

async function viewerOwnerKey(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  try {
    const identity = await ctx.auth.getUserIdentity()
    if (identity?.subject) {
      return `clerk:${identity.subject}`
    }
  } catch {
    // Auth may be unconfigured in early setup; fall back to a shared viewer key.
  }

  return 'viewer:default'
}

async function viewerUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  return await sharedViewerUserId(ctx)
}

function createConverter({
  targetCurrency,
  fxMap,
  fractionDigitsByCurrency,
}: {
  targetCurrency: string
  fxMap: FxMap
  fractionDigitsByCurrency: Map<string, number>
}) {
  const fromMinor = (amountMinor: bigint | number, sourceCurrency: string) => {
    const source = normalizeCurrencyCode(sourceCurrency)
    const sourceMajor = minorToMajor(amountMinor, source, fractionDigitsByCurrency)
    const rate = conversionRate(source, targetCurrency, fxMap)
    return roundForCurrency(sourceMajor * rate, targetCurrency, fractionDigitsByCurrency)
  }

  return { fromMinor }
}

function conversionRate(from: string, to: string, fxMap: FxMap) {
  const source = normalizeCurrencyCode(from)
  const target = normalizeCurrencyCode(to)

  if (source === target) return 1

  if (source === 'USD') {
    return fxMap.get(target)?.rate ?? 1
  }

  if (target === 'USD') {
    const usdToSource = fxMap.get(source)?.rate
    return usdToSource && usdToSource !== 0 ? 1 / usdToSource : 1
  }

  const usdToSource = fxMap.get(source)?.rate
  const usdToTarget = fxMap.get(target)?.rate
  if (!usdToSource || !usdToTarget || usdToSource === 0) {
    return 1
  }

  return usdToTarget / usdToSource
}

function buildFxMapFromRateRows(rows: Array<Record<string, unknown>>): FxMap {
  return sharedBuildFxMapFromRateRows(rows)
}

function buildFractionDigitsByCurrency(rows: Array<Record<string, unknown>>) {
  return sharedBuildFractionDigitsByCurrency(rows)
}

function buildPostedFxSnapshot({
  amount,
  currency,
  baseCurrency,
  postedAt,
  fxMap,
  fractionDigitsByCurrency,
}: {
  amount: number
  currency: string
  baseCurrency: string
  postedAt: number
  fxMap: FxMap
  fractionDigitsByCurrency: Map<string, number>
}) {
  const baseSnapshot = sharedBuildPostedFxSnapshot({
    amount,
    currency,
    baseCurrency,
    postedAt,
    fxMap,
    fractionDigitsByCurrency,
  })
  const nativeCurrency = normalizeCurrencyCode(currency)
  const normalizedBase = normalizeCurrencyCode(baseCurrency)
  const rateToBase = baseSnapshot.fxRateNativeToBase
  const baseAmount = baseSnapshot.baseAmount
  const nativeDigits = baseSnapshot.nativeCurrencyFractionDigits
  const baseDigits = baseSnapshot.baseCurrencyFractionDigits
  const nativeUsdQuote = nativeCurrency === 'USD' ? { rate: 1, synthetic: false, asOfMs: postedAt, source: 'identity' } : fxMap.get(nativeCurrency)
  const baseUsdQuote = normalizedBase === 'USD' ? { rate: 1, synthetic: false, asOfMs: postedAt, source: 'identity' } : fxMap.get(normalizedBase)
  const asOfCandidates = [nativeUsdQuote?.asOfMs, baseUsdQuote?.asOfMs].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  )
  const sources = Array.from(
    new Set([nativeUsdQuote?.source, baseUsdQuote?.source].filter(Boolean) as string[]),
  )
  const synthetic = Boolean(nativeUsdQuote?.synthetic || baseUsdQuote?.synthetic)

  return {
    postedAt,
    nativeCurrency,
    nativeAmount: baseSnapshot.nativeAmount,
    nativeAmountMinor: baseSnapshot.nativeAmountMinor,
    nativeFractionDigits: nativeDigits,
    baseCurrency: normalizedBase,
    baseAmount,
    baseAmountMinor: baseSnapshot.baseAmountMinor,
    baseFractionDigits: baseDigits,
    fxRateNativeToBase: rateToBase,
    fxAsOfMs: baseSnapshot.fxAsOfMs ?? (asOfCandidates.length ? Math.max(...asOfCandidates) : postedAt),
    fxSource: baseSnapshot.fxSource || sources.join('+') || 'identity',
    fxSynthetic: typeof baseSnapshot.fxSynthetic === 'boolean' ? baseSnapshot.fxSynthetic : synthetic,
    fxPath:
      nativeCurrency === normalizedBase
        ? 'identity'
        : nativeCurrency === 'USD' || normalizedBase === 'USD'
          ? 'usd_direct'
          : 'cross_via_usd',
    nativeUsdQuote:
      nativeUsdQuote == null
        ? null
        : {
            rate: nativeUsdQuote.rate,
            source: nativeUsdQuote.source,
            synthetic: nativeUsdQuote.synthetic,
            asOfMs: nativeUsdQuote.asOfMs,
          },
    baseUsdQuote:
      baseUsdQuote == null
        ? null
        : {
            rate: baseUsdQuote.rate,
            source: baseUsdQuote.source,
            synthetic: baseUsdQuote.synthetic,
            asOfMs: baseUsdQuote.asOfMs,
          },
  }
}

function minorToMajor(
  amountMinor: bigint | number,
  currency: string,
  fractionDigitsByCurrency: Map<string, number>,
): number {
  const digits = fractionDigitsByCurrency.get(normalizeCurrencyCode(currency)) ?? 2
  const divisor = 10 ** digits
  const numeric =
    typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor
  return numeric / divisor
}

function roundForCurrency(
  amount: number,
  currency: string,
  fractionDigitsByCurrency: Map<string, number>,
): number {
  const digits = fractionDigitsByCurrency.get(normalizeCurrencyCode(currency)) ?? 2
  const factor = 10 ** digits
  return Math.round(amount * factor) / factor
}

function toMinor(majorAmount: number, currency: string): bigint {
  const digits = currencyFractionDigits(currency)
  const factor = 10 ** digits
  return BigInt(Math.round(majorAmount * factor))
}

function buildSeedSnapshot(): SnapshotPayload {
  return {
    summary: {
      totalAssetsMinor: toMinor(924_150.9, 'USD'),
      liabilitiesMinor: toMinor(10_420.17, 'USD'),
      monthlyIncomeMinor: toMinor(133_210, 'USD'),
      monthlyExpensesMinor: toMinor(104_240, 'USD'),
      liquidCashMinor: toMinor(268_500, 'USD'),
    },
    accounts: [
      {
        id: 'acc-checking',
        name: 'Operating Cash',
        type: 'Checking',
        provider: 'Mercury',
        balanceMinor: toMinor(42_840.33, 'USD'),
        currency: 'USD',
        changePct: 4.1,
      },
      {
        id: 'acc-savings',
        name: 'Reserve Fund',
        type: 'Savings',
        provider: 'Ally',
        balanceMinor: toMinor(188_900.12, 'USD'),
        currency: 'USD',
        changePct: 1.8,
      },
      {
        id: 'acc-brokerage',
        name: 'Long-Term Portfolio',
        type: 'Brokerage',
        provider: 'Fidelity',
        balanceMinor: toMinor(672_410.45, 'USD'),
        currency: 'USD',
        changePct: 12.6,
      },
      {
        id: 'acc-credit',
        name: 'Corporate Card',
        type: 'Credit',
        provider: 'Amex',
        balanceMinor: toMinor(-9_840.17, 'USD'),
        currency: 'USD',
        changePct: -3.2,
      },
      {
        id: 'acc-eur-op',
        name: 'EU Ops Wallet',
        type: 'Checking',
        provider: 'Wise',
        balanceMinor: toMinor(18_420.5, 'EUR'),
        currency: 'EUR',
        changePct: 2.4,
      },
      {
        id: 'acc-jpy-vendor',
        name: 'JP Vendor Float',
        type: 'Savings',
        provider: 'MUFG',
        balanceMinor: toMinor(2_650_000, 'JPY'),
        currency: 'JPY',
        changePct: 0.9,
      },
    ],
    portfolioSeries: [
      { label: 'Jan', netWorthMinor: toMinor(771000, 'USD'), investedMinor: toMinor(525000, 'USD'), cashMinor: toMinor(246000, 'USD'), currency: 'USD' },
      { label: 'Feb', netWorthMinor: toMinor(784500, 'USD'), investedMinor: toMinor(536000, 'USD'), cashMinor: toMinor(248500, 'USD'), currency: 'USD' },
      { label: 'Mar', netWorthMinor: toMinor(792400, 'USD'), investedMinor: toMinor(545100, 'USD'), cashMinor: toMinor(247300, 'USD'), currency: 'USD' },
      { label: 'Apr', netWorthMinor: toMinor(803300, 'USD'), investedMinor: toMinor(553900, 'USD'), cashMinor: toMinor(249400, 'USD'), currency: 'USD' },
      { label: 'May', netWorthMinor: toMinor(818600, 'USD'), investedMinor: toMinor(566200, 'USD'), cashMinor: toMinor(252400, 'USD'), currency: 'USD' },
      { label: 'Jun', netWorthMinor: toMinor(827900, 'USD'), investedMinor: toMinor(576800, 'USD'), cashMinor: toMinor(251100, 'USD'), currency: 'USD' },
      { label: 'Jul', netWorthMinor: toMinor(839400, 'USD'), investedMinor: toMinor(586200, 'USD'), cashMinor: toMinor(253200, 'USD'), currency: 'USD' },
      { label: 'Aug', netWorthMinor: toMinor(852800, 'USD'), investedMinor: toMinor(598500, 'USD'), cashMinor: toMinor(254300, 'USD'), currency: 'USD' },
      { label: 'Sep', netWorthMinor: toMinor(861900, 'USD'), investedMinor: toMinor(606600, 'USD'), cashMinor: toMinor(255300, 'USD'), currency: 'USD' },
      { label: 'Oct', netWorthMinor: toMinor(874200, 'USD'), investedMinor: toMinor(619700, 'USD'), cashMinor: toMinor(254500, 'USD'), currency: 'USD' },
      { label: 'Nov', netWorthMinor: toMinor(887300, 'USD'), investedMinor: toMinor(631900, 'USD'), cashMinor: toMinor(255400, 'USD'), currency: 'USD' },
      { label: 'Dec', netWorthMinor: toMinor(894310, 'USD'), investedMinor: toMinor(642570, 'USD'), cashMinor: toMinor(251740, 'USD'), currency: 'USD' },
    ],
    cashflowSeries: [
      { label: 'W1', incomeMinor: toMinor(23200, 'USD'), incomeCurrency: 'USD', expensesMinor: toMinor(16820, 'USD'), expensesCurrency: 'USD' },
      { label: 'W2', incomeMinor: toMinor(18950, 'USD'), incomeCurrency: 'USD', expensesMinor: toMinor(17410, 'USD'), expensesCurrency: 'USD' },
      { label: 'W3', incomeMinor: toMinor(24780, 'USD'), incomeCurrency: 'USD', expensesMinor: toMinor(18120, 'USD'), expensesCurrency: 'USD' },
      { label: 'W4', incomeMinor: toMinor(21990, 'USD'), incomeCurrency: 'USD', expensesMinor: toMinor(17080, 'USD'), expensesCurrency: 'USD' },
      { label: 'W5', incomeMinor: toMinor(20510, 'USD'), incomeCurrency: 'USD', expensesMinor: toMinor(16340, 'USD'), expensesCurrency: 'USD' },
      { label: 'W6', incomeMinor: toMinor(25840, 'USD'), incomeCurrency: 'USD', expensesMinor: toMinor(18470, 'USD'), expensesCurrency: 'USD' },
    ],
    allocations: [
      { name: 'US Equities', amountMinor: toMinor(286440, 'USD'), currency: 'USD', pct: 42, deltaPct: 1.9, risk: 'Medium' },
      { name: 'International', amountMinor: toMinor(108630, 'USD'), currency: 'USD', pct: 16, deltaPct: 0.8, risk: 'Medium' },
      { name: 'Fixed Income', amountMinor: toMinor(141200, 'USD'), currency: 'USD', pct: 21, deltaPct: -0.5, risk: 'Low' },
      { name: 'Cash & T-Bills', amountMinor: toMinor(87370, 'USD'), currency: 'USD', pct: 13, deltaPct: 0.3, risk: 'Low' },
      { name: 'Alternatives', amountMinor: toMinor(48770, 'USD'), currency: 'USD', pct: 8, deltaPct: 2.2, risk: 'High' },
    ],
    budgets: [
      { category: 'Operations', limitMinor: toMinor(18000, 'USD'), spentMinor: toMinor(12240, 'USD'), currency: 'USD', cadence: 'Monthly', status: 'Healthy' },
      { category: 'Travel', limitMinor: toMinor(8500, 'USD'), spentMinor: toMinor(6920, 'USD'), currency: 'USD', cadence: 'Monthly', status: 'Tight' },
      { category: 'Software', limitMinor: toMinor(6200, 'USD'), spentMinor: toMinor(4775, 'USD'), currency: 'USD', cadence: 'Monthly', status: 'Healthy' },
      { category: 'Marketing', limitMinor: toMinor(14000, 'USD'), spentMinor: toMinor(14660, 'USD'), currency: 'USD', cadence: 'Monthly', status: 'Exceeded' },
    ],
    goals: [
      { id: 'goal-1', title: 'Emergency Liquidity', targetMinor: toMinor(250000, 'USD'), currentMinor: toMinor(188900, 'USD'), contributionMinor: toMinor(8500, 'USD'), currency: 'USD', dueLabel: 'Q2 2026' },
      { id: 'goal-2', title: 'Tax Reserve', targetMinor: toMinor(90000, 'USD'), currentMinor: toMinor(62250, 'USD'), contributionMinor: toMinor(4200, 'USD'), currency: 'USD', dueLabel: 'Apr 2026' },
      { id: 'goal-3', title: 'Equipment Refresh', targetMinor: toMinor(35000, 'USD'), currentMinor: toMinor(21840, 'USD'), contributionMinor: toMinor(2400, 'USD'), currency: 'USD', dueLabel: 'Q3 2026' },
    ],
    insights: [
      { id: 'ins-1', title: 'Expense run-rate improved 7.4%', tone: 'positive', detail: 'Software and contractor costs are below trailing 90-day average.' },
      { id: 'ins-2', title: 'Card utilization is trending higher', tone: 'warning', detail: 'Amex spend is 18% above plan. Review ad and travel categories.' },
      { id: 'ins-3', title: 'Cash reserve covers 10.8 months', tone: 'neutral', detail: 'Healthy buffer based on current monthly burn and fixed obligations.' },
    ],
    watchlist: [
      { symbol: 'VOO', priceMinor: toMinor(534.28, 'USD'), currency: 'USD', changePct: 0.8 },
      { symbol: 'BND', priceMinor: toMinor(72.14, 'USD'), currency: 'USD', changePct: -0.2 },
      { symbol: 'EWG', priceMinor: toMinor(33.08, 'USD'), currency: 'USD', changePct: 0.4 },
      { symbol: 'EWJ', priceMinor: toMinor(70.86, 'USD'), currency: 'USD', changePct: 0.3 },
      { symbol: 'XAUUSD', priceMinor: toMinor(2912.1, 'USD'), currency: 'USD', changePct: 1.1 },
    ],
    upcomingBills: [
      { id: 'bill-1', name: 'Payroll', due: '2026-02-28', amountMinor: toMinor(12400, 'USD'), currency: 'USD' },
      { id: 'bill-2', name: 'AWS', due: '2026-03-01', amountMinor: toMinor(1860, 'USD'), currency: 'USD' },
      { id: 'bill-3', name: 'Office Lease', due: '2026-03-03', amountMinor: toMinor(4200, 'USD'), currency: 'USD' },
      { id: 'bill-4', name: 'EU Contractors', due: '2026-03-05', amountMinor: toMinor(6200, 'EUR'), currency: 'EUR' },
    ],
    transactions: [
      { id: 'txn-1', date: '2026-02-24T14:12:00.000Z', merchant: 'Stripe', account: 'Operating Cash', category: 'Revenue', note: 'Subscription settlement batch', amountMinor: toMinor(12480, 'USD'), currency: 'USD', type: 'income', status: 'posted' },
      { id: 'txn-2', date: '2026-02-24T09:18:00.000Z', merchant: 'Amazon Web Services', account: 'Corporate Card', category: 'Infrastructure', note: 'Monthly cloud usage', amountMinor: toMinor(-1860.42, 'USD'), currency: 'USD', type: 'expense', status: 'posted' },
      { id: 'txn-3', date: '2026-02-23T20:02:00.000Z', merchant: 'Linear', account: 'Corporate Card', category: 'Software', note: 'Engineering tools', amountMinor: toMinor(-420, 'USD'), currency: 'USD', type: 'expense', status: 'posted' },
      { id: 'txn-4', date: '2026-02-23T16:40:00.000Z', merchant: 'Mercury Transfer', account: 'Reserve Fund', category: 'Transfer', note: 'Sweep from operating cash', amountMinor: toMinor(8500, 'USD'), currency: 'USD', type: 'transfer', status: 'posted' },
      { id: 'txn-5', date: '2026-02-22T18:55:00.000Z', merchant: 'Delta Air Lines', account: 'Corporate Card', category: 'Travel', note: 'Client meeting flights', amountMinor: toMinor(-948.73, 'USD'), currency: 'USD', type: 'expense', status: 'pending' },
      { id: 'txn-6', date: '2026-02-22T12:21:00.000Z', merchant: 'Payroll', account: 'Operating Cash', category: 'Operations', note: 'Biweekly payroll', amountMinor: toMinor(-12400, 'USD'), currency: 'USD', type: 'expense', status: 'posted' },
      { id: 'txn-7', date: '2026-02-21T15:04:00.000Z', merchant: 'Ramp Cashback', account: 'Operating Cash', category: 'Rewards', note: 'Monthly cashback credit', amountMinor: toMinor(274.14, 'USD'), currency: 'USD', type: 'income', status: 'posted' },
      { id: 'txn-8', date: '2026-02-21T10:05:00.000Z', merchant: 'Google Ads', account: 'Corporate Card', category: 'Marketing', note: 'Search campaign spend', amountMinor: toMinor(-2368.2, 'USD'), currency: 'USD', type: 'expense', status: 'posted' },
      { id: 'txn-9', date: '2026-02-20T19:44:00.000Z', merchant: 'Notion', account: 'Corporate Card', category: 'Software', note: 'Workspace plan', amountMinor: toMinor(-96, 'USD'), currency: 'USD', type: 'expense', status: 'posted' },
      { id: 'txn-10', date: '2026-02-20T13:02:00.000Z', merchant: 'Client Wire', account: 'Operating Cash', category: 'Revenue', note: 'Retainer payment', amountMinor: toMinor(18250, 'USD'), currency: 'USD', type: 'income', status: 'posted' },
      { id: 'txn-11', date: '2026-02-19T09:10:00.000Z', merchant: 'Wise Transfer', account: 'EU Ops Wallet', category: 'Transfer', note: 'Fund EU operating account', amountMinor: toMinor(9500, 'EUR'), currency: 'EUR', type: 'transfer', status: 'posted' },
      { id: 'txn-12', date: '2026-02-18T07:40:00.000Z', merchant: 'Tokyo Data Center', account: 'JP Vendor Float', category: 'Infrastructure', note: 'Regional infra invoice', amountMinor: toMinor(-184000, 'JPY'), currency: 'JPY', type: 'expense', status: 'posted' },
      { id: 'txn-13', date: '2026-02-17T16:25:00.000Z', merchant: 'London Advisory', account: 'Operating Cash', category: 'Consulting', note: 'Strategy retainer', amountMinor: toMinor(-3200, 'GBP'), currency: 'GBP', type: 'expense', status: 'posted' },
    ],
  }
}

// Demo seeding is disabled, but these helpers are intentionally retained until the
// final demo-code purge so historical audit/event references remain easy to trace.
void [seedCurrencyCatalog, seedUsdFxRates, clearTable, buildSeedSnapshot]

function buildCurrencyCatalog(): CurrencyCatalogRow[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }

  const supported =
    intlWithSupportedValues.supportedValuesOf?.('currency') ?? [
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CAD',
      'AUD',
      'CHF',
      'CNY',
      'INR',
      'MXN',
      'BRL',
      'AED',
      'SGD',
      'HKD',
      'ZAR',
    ]

  const displayNames =
    typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(['en'], { type: 'currency' })
      : null

  return supported
    .map((code) => normalizeCurrencyCode(code))
    .filter((code, index, arr) => code && arr.indexOf(code) === index)
    .sort()
    .map((code) => ({
      code,
      name: displayNames?.of(code) ?? code,
      fractionDigits: currencyFractionDigits(code),
      symbol: currencySymbol(code),
    }))
}

function currencyFractionDigits(code: string): number {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrencyCode(code),
    }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

function currencySymbol(code: string): string | undefined {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrencyCode(code),
      currencyDisplay: 'symbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(1)
    return parts.find((part) => part.type === 'currency')?.value
  } catch {
    return undefined
  }
}

function buildUsdQuoteRates(codes: string[]) {
  const anchors: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 151.2,
    CAD: 1.35,
    AUD: 1.53,
    NZD: 1.67,
    CHF: 0.89,
    CNY: 7.2,
    HKD: 7.81,
    SGD: 1.34,
    INR: 83.1,
    KRW: 1342,
    TWD: 31.7,
    THB: 35.6,
    MYR: 4.6,
    IDR: 15750,
    PHP: 56.4,
    VND: 24750,
    AED: 3.6725,
    SAR: 3.75,
    QAR: 3.64,
    KWD: 0.307,
    BHD: 0.377,
    OMR: 0.3845,
    MXN: 17.0,
    BRL: 4.95,
    CLP: 955,
    COP: 4010,
    PEN: 3.78,
    ARS: 985,
    UYU: 40.1,
    ZAR: 18.3,
    EGP: 50.1,
    TRY: 32.6,
    ILS: 3.63,
    PLN: 4.03,
    CZK: 23.5,
    HUF: 363,
    SEK: 10.4,
    NOK: 10.6,
    DKK: 6.87,
    ISK: 138,
    RON: 4.57,
    BGN: 1.8,
  }

  const map = new Map<
    string,
    { rate: number; synthetic: boolean; source: string }
  >()

  for (const code of codes) {
    const normalized = normalizeCurrencyCode(code)
    if (anchors[normalized]) {
      map.set(normalized, {
        rate: anchors[normalized],
        synthetic: false,
        source: 'seeded-manual-2026',
      })
      continue
    }

    const hashed = hashCode(normalized)
    const digits = currencyFractionDigits(normalized)
    const magnitude =
      digits === 0
        ? [0.4, 1, 3, 10, 40, 120][hashed % 6]!
        : [0.2, 0.5, 0.8, 1.3, 2.7, 5.5, 12][hashed % 7]!
    const fine = 0.7 + ((hashed >>> 8) % 900) / 1000
    const rate = Number((magnitude * fine).toFixed(6))

    map.set(normalized, {
      rate: normalized === 'USD' ? 1 : rate,
      synthetic: normalized !== 'USD',
      source: normalized === 'USD' ? 'seeded-manual-2026' : 'seeded-synthetic-2026',
    })
  }

  if (!map.has('USD')) {
    map.set('USD', { rate: 1, synthetic: false, source: 'seeded-manual-2026' })
  }

  return map
}

function normalizeCurrencyCode(code: string) {
  return code.trim().toUpperCase()
}

function sanitizeLocale(locale: string) {
  try {
    return new Intl.NumberFormat(locale).resolvedOptions().locale
  } catch {
    return 'en-US'
  }
}

function hashCode(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
