export type RangeKey = '30d' | '90d' | '1y'
export type TransactionFilter = 'all' | 'income' | 'expense' | 'transfer'
export type FinanceUserMode = 'personal' | 'household' | 'operator'
export type ConfidenceLevel = 'posted' | 'scheduled' | 'planned' | 'estimated' | 'mixed'
export type CoreEntityType = 'account' | 'income' | 'bill' | 'card' | 'loan'
export type CoreTabKey = 'accounts' | 'incomes' | 'bills' | 'cards' | 'loans'
export type WorkspaceTabKey =
  | 'dashboard'
  | 'planning'
  | 'accounts'
  | 'income'
  | 'bills'
  | 'cards'
  | 'loans'
  | 'shopping'
  | 'transactions'
  | 'reliability'
  | 'governance'
  | 'automation'

export type PhaseZeroDiagnostics = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  currentUserDocCount: number
  currentUserTableCount: number
  matchedCurrentData: boolean
  canClaimLegacyData: boolean
  recommendedLegacyUserId: string | null
  legacyCandidates: Array<{
    userId: string
    docCount: number
    tableCount: number
    tables: string[]
  }>
}

export type CoreFinanceEditorData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  accountOptions: Array<{
    id: string
    name: string
    type: string
    liquid: boolean
  }>
  accounts: Array<{
    id: string
    name: string
    type: string
    balance: number
    liquid: boolean
    createdAt: number
  }>
  incomes: Array<{
    id: string
    source: string
    amount: number
    cadence: string
    receivedDay: number
    destinationAccountId: string | null
    customInterval: number | null
    customUnit: string | null
    createdAt: number
  }>
  bills: Array<{
    id: string
    name: string
    amount: number
    cadence: string
    dueDay: number
    autopay: boolean
    isSubscription: boolean
    category: string
    scope: string
    linkedAccountId: string | null
    cancelReminderDays: number | null
    deductible: boolean
    createdAt: number
  }>
  cards: Array<{
    id: string
    name: string
    creditLimit: number
    usedLimit: number
    interestRate: number
    dueDay: number
    minimumPayment: number
    spendPerMonth: number
    createdAt: number
  }>
  loans: Array<{
    id: string
    name: string
    balance: number
    principalBalance: number
    accruedInterest: number
    cadence: string
    dueDay: number
    minimumPayment: number
    minimumPaymentType: string
    extraPayment: number
    subscriptionCost: number
    subscriptionOutstanding: number
    subscriptionPaymentCount: number
    createdAt: number
  }>
}

export type DashboardData = {
  summary: {
    totalAssets: number
    liabilities: number
    monthlyIncome: number
    monthlyExpenses: number
    liquidCash: number
  }
  accounts: Array<{
    id: string
    name: string
    type: string
    provider: string
    balance: number
    changePct: number
    currency?: string
    originalBalance?: number
    originalCurrency?: string
  }>
  portfolioSeries: Array<{
    label: string
    netWorth: number
    invested: number
    cash: number
  }>
  cashflowSeries: Array<{
    label: string
    income: number
    expenses: number
  }>
  allocations: Array<{
    name: string
    amount: number
    pct: number
    deltaPct: number
    risk: 'Low' | 'Medium' | 'High'
  }>
  budgets: Array<{
    category: string
    limit: number
    spent: number
    cadence: 'Monthly'
    status: 'Healthy' | 'Tight' | 'Exceeded'
  }>
  goals: Array<{
    id: string
    title: string
    target: number
    current: number
    dueLabel: string
    contribution: number
  }>
  insights: Array<{
    id: string
    title: string
    tone: 'positive' | 'neutral' | 'warning'
    detail: string
  }>
  watchlist: Array<{
    symbol: string
    price: number
    changePct: number
    priceCurrency?: string
    originalPrice?: number
    originalCurrency?: string
  }>
  upcomingBills: Array<{
    id: string
    name: string
    due: string
    amount: number
    currency?: string
    originalAmount?: number
    originalCurrency?: string
  }>
  transactions: Array<{
    id: string
    date: string
    merchant: string
    account: string
    category: string
    note: string
    amount: number
    currency?: string
    originalAmount?: number
    originalCurrency?: string
    type: TransactionFilter
    status: 'posted' | 'pending'
  }>
}
