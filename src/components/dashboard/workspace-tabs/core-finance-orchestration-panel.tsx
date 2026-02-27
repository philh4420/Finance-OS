import {
  ArrowRightLeft,
  Banknote,
  CalendarClock,
  CreditCard,
  Landmark,
  Link2,
  ReceiptText,
} from 'lucide-react'

import type {
  CoreFinanceEditorData,
  WorkspaceTabKey,
} from '@/components/dashboard/dashboard-types'
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
import {
  CORE_FINANCE_ACCOUNT_SCOPE_ALL,
  CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED,
  coreFinanceAccountScopeForId,
  monthlyEquivalentForFinanceWorkspace,
  summarizeCoreFinanceScope,
  type CoreFinanceAccountScope,
} from './core-finance-coordination'

type TabLink = {
  id: WorkspaceTabKey
  label: string
}

type AccountRoutingSummary = {
  id: string
  name: string
  type: string
  liquid: boolean
  balance: number
  monthlyIncome: number
  monthlyBills: number
  incomeCount: number
  billCount: number
}

function buildAccountRoutingSummaries(data: CoreFinanceEditorData | undefined): AccountRoutingSummary[] {
  if (!data) return []
  return data.accounts.map((account) => {
    const linkedIncomes = data.incomes.filter((row) => row.destinationAccountId === account.id)
    const linkedBills = data.bills.filter((row) => row.linkedAccountId === account.id)
    const monthlyIncome = linkedIncomes.reduce(
      (sum, row) => sum + monthlyEquivalentForFinanceWorkspace(row.amount, row.cadence),
      0,
    )
    const monthlyBills = linkedBills.reduce(
      (sum, row) => sum + monthlyEquivalentForFinanceWorkspace(row.amount, row.cadence),
      0,
    )
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      liquid: account.liquid,
      balance: account.balance,
      monthlyIncome,
      monthlyBills,
      incomeCount: linkedIncomes.length,
      billCount: linkedBills.length,
    }
  })
}

function FlowMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'positive' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-3">
      <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-sm font-semibold',
          tone === 'positive' && 'text-emerald-300',
          tone === 'warning' && 'text-amber-300',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function CoreFinanceOrchestrationPanel({
  data,
  displayCurrency,
  displayLocale,
  accountScope,
  onAccountScopeChange,
  currentTab,
  onNavigateTab,
}: {
  data: CoreFinanceEditorData | undefined
  displayCurrency: string
  displayLocale: string
  accountScope: CoreFinanceAccountScope
  onAccountScopeChange: (next: CoreFinanceAccountScope) => void
  currentTab: WorkspaceTabKey
  onNavigateTab: (tab: WorkspaceTabKey) => void
}) {
  const money = createCurrencyFormatters(displayLocale, displayCurrency).money
  const accountOptions = data?.accountOptions ?? []
  const routingSummaries = buildAccountRoutingSummaries(data)
  const scoped = summarizeCoreFinanceScope(data, accountScope)

  const totalIncomeRunRate = (data?.incomes ?? []).reduce(
    (sum, row) => sum + monthlyEquivalentForFinanceWorkspace(row.amount, row.cadence),
    0,
  )
  const totalBillRunRate = (data?.bills ?? []).reduce(
    (sum, row) => sum + monthlyEquivalentForFinanceWorkspace(row.amount, row.cadence),
    0,
  )
  const totalCardMinimums = (data?.cards ?? []).reduce((sum, row) => sum + row.minimumPayment, 0)
  const totalLoanService = (data?.loans ?? []).reduce(
    (sum, row) => sum + row.minimumPayment + row.extraPayment,
    0,
  )
  const netAfterKnownObligations =
    totalIncomeRunRate - totalBillRunRate - totalCardMinimums - totalLoanService
  const unlinkedIncomeCount = (data?.incomes ?? []).filter((row) => !row.destinationAccountId).length
  const unlinkedBillCount = (data?.bills ?? []).filter((row) => !row.linkedAccountId).length

  const tabLinks: TabLink[] = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'income', label: 'Income' },
    { id: 'bills', label: 'Bills' },
    { id: 'cards', label: 'Cards' },
    { id: 'loans', label: 'Loans' },
    { id: 'shopping', label: 'Shopping' },
    { id: 'transactions', label: 'Transactions' },
  ]

  return (
    <Card className="finance-panel border-primary/20 bg-primary/6 shadow-none">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Finance Operating Model
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/55">
                {displayCurrency} display
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'border-border/70 bg-background/55',
                  (unlinkedIncomeCount > 0 || unlinkedBillCount > 0) &&
                    'border-amber-500/30 bg-amber-500/10 text-amber-200',
                )}
              >
                <Link2 className="h-3.5 w-3.5" />
                {unlinkedIncomeCount + unlinkedBillCount} unlinked cashflow rows
              </Badge>
            </div>
            <CardTitle className="mt-2 text-base">
              Shared routing and obligation controls across finance tabs
            </CardTitle>
            <CardDescription>
              Accounts, income, bills, cards, loans, and shopping now share the same live workspace context so you can route cashflow and review obligations as one operating model.
            </CardDescription>
          </div>
          <div className="flex min-w-[16rem] flex-col gap-2">
            <label className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Account Scope
            </label>
            <select
              value={accountScope}
              onChange={(event) => onAccountScopeChange(event.target.value)}
              className="h-10 w-full rounded-xl border border-border/70 bg-background/60 px-3 text-sm"
            >
              <option value={CORE_FINANCE_ACCOUNT_SCOPE_ALL}>All accounts (global operating model)</option>
              <option value={CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED}>Unlinked income and bills</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={coreFinanceAccountScopeForId(account.id)}>
                  {account.name} ({account.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabLinks.map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              variant={currentTab === tab.id ? 'secondary' : 'outline'}
              className={cn(
                'h-8 rounded-lg shadow-none',
                currentTab === tab.id && 'border-primary/25 bg-primary/10 text-primary',
              )}
              onClick={() => onNavigateTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <FlowMetric label="Income Run Rate" value={money.format(totalIncomeRunRate)} tone="positive" />
          <FlowMetric label="Bills Run Rate" value={money.format(totalBillRunRate)} />
          <FlowMetric label="Card Minimums" value={money.format(totalCardMinimums)} tone={totalCardMinimums > 0 ? 'warning' : 'neutral'} />
          <FlowMetric label="Loan Service" value={money.format(totalLoanService)} tone={totalLoanService > 0 ? 'warning' : 'neutral'} />
          <FlowMetric
            label="Net After Obligations"
            value={money.format(netAfterKnownObligations)}
            tone={netAfterKnownObligations >= 0 ? 'positive' : 'warning'}
          />
          <FlowMetric
            label={`Scoped: ${scoped.scopeLabel}`}
            value={money.format(scoped.netBeforeDebt)}
            tone={scoped.netBeforeDebt >= 0 ? 'positive' : 'warning'}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Account routing coverage</p>
                <p className="text-xs text-muted-foreground">
                  Linked income and bill schedules grouped by account to expose routing gaps.
                </p>
              </div>
              {accountOptions.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => onNavigateTab('accounts')}
                >
                  <Landmark className="h-3.5 w-3.5" />
                  Review accounts
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              {routingSummaries.length ? (
                routingSummaries.map((row) => {
                  const rowScope = coreFinanceAccountScopeForId(row.id)
                  const focused = accountScope === rowScope
                  const scheduledNet = row.monthlyIncome - row.monthlyBills
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        onAccountScopeChange(focused ? CORE_FINANCE_ACCOUNT_SCOPE_ALL : rowScope)
                      }
                      className={cn(
                        'w-full rounded-xl border px-3 py-2.5 text-left transition',
                        focused
                          ? 'border-primary/30 bg-primary/10'
                          : 'border-border/50 bg-card/25 hover:border-border/70 hover:bg-card/35',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{row.name}</p>
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {row.type}
                            </Badge>
                            {row.liquid ? (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                                Liquid
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.incomeCount} income links · {row.billCount} bill links · balance {money.format(row.balance)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Scheduled net</p>
                          <p
                            className={cn(
                              'text-sm font-semibold',
                              scheduledNet >= 0 ? 'text-emerald-300' : 'text-amber-300',
                            )}
                          >
                            {money.format(scheduledNet)}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 bg-card/20 px-4 py-6 text-sm text-muted-foreground">
                  Add accounts, income, and bills to activate shared routing coverage across tabs.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <div className="mb-2">
              <p className="text-sm font-medium">Coordination notes</p>
              <p className="text-xs text-muted-foreground">
                Cards and loans are tracked as global obligations unless explicitly tied through transaction posting/allocation flows.
              </p>
            </div>
            <div className="space-y-2">
              <div className="rounded-xl border border-border/50 bg-card/25 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Banknote className="h-4 w-4 text-emerald-300" />
                  Scoped cashflow before debt service
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scoped.scopeLabel}: {scoped.incomeCount} income rows minus {scoped.billCount} bill rows
                </p>
                <p
                  className={cn(
                    'mt-2 text-base font-semibold',
                    scoped.netBeforeDebt >= 0 ? 'text-emerald-300' : 'text-amber-300',
                  )}
                >
                  {money.format(scoped.netBeforeDebt)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border/50 bg-card/25 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    Cards
                  </div>
                  <p className="mt-1 text-sm font-semibold">{data?.cards.length ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {money.format(totalCardMinimums)} minimums
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/25 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    Bills
                  </div>
                  <p className="mt-1 text-sm font-semibold">{data?.bills.length ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {unlinkedBillCount} unlinked
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/25 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />
                    Income
                  </div>
                  <p className="mt-1 text-sm font-semibold">{data?.incomes.length ?? 0}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {unlinkedIncomeCount} unlinked
                  </p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/25 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Routing health
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    {unlinkedIncomeCount + unlinkedBillCount === 0 ? 'Complete' : 'Needs linking'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Link income and bills to accounts
                  </p>
                </div>
              </div>
              {(unlinkedIncomeCount > 0 || unlinkedBillCount > 0) && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      onAccountScopeChange(CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED)
                      onNavigateTab(unlinkedIncomeCount > 0 ? 'income' : 'bills')
                    }}
                  >
                    Review unlinked rows
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onNavigateTab('transactions')}>
                    Transaction allocations
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
