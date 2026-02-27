import { ArrowRightLeft, BriefcaseBusiness, CalendarClock, Target } from 'lucide-react'

import type {
  CoreFinanceEditorData,
  WorkspaceTabKey,
} from '@/components/dashboard/dashboard-types'
import { createCurrencyFormatters } from '@/lib/currency'

import {
  CoreEntityWorkspaceTab,
  type CoreEntityWorkspaceRow,
} from './core-entity-workspace-tab'
import {
  CoreFinanceOrchestrationPanel,
} from './core-finance-orchestration-panel'
import {
  summarizeCoreFinanceScope,
  type CoreFinanceAccountScope,
} from './core-finance-coordination'

export function LoansWorkspaceTab({
  data,
  displayCurrency,
  displayLocale,
  accountScope,
  onAccountScopeChange,
  onNavigateTab,
  onOpenManager,
  thumbMode = false,
}: {
  data: CoreFinanceEditorData | undefined
  displayCurrency: string
  displayLocale: string
  accountScope: CoreFinanceAccountScope
  onAccountScopeChange: (next: CoreFinanceAccountScope) => void
  onNavigateTab: (tab: WorkspaceTabKey) => void
  onOpenManager: () => void
  thumbMode?: boolean
}) {
  const money = createCurrencyFormatters(displayLocale, displayCurrency).money
  const loans = data?.loans ?? []
  const scopedCashflow = summarizeCoreFinanceScope(data, accountScope)
  const totalBalance = loans.reduce((sum, loan) => sum + loan.balance, 0)
  const totalMin = loans.reduce((sum, loan) => sum + loan.minimumPayment, 0)
  const rows: CoreEntityWorkspaceRow[] = loans.map((loan) => ({
    id: loan.id,
    title: loan.name,
    subtitle: `${loan.cadence} · Due day ${loan.dueDay} · ${loan.minimumPaymentType}`,
    amountLabel: money.format(loan.balance),
    hint: `Min ${money.format(loan.minimumPayment)} · Extra ${money.format(loan.extraPayment)}`,
    createdAt: loan.createdAt,
  }))

  return (
    <div className="grid gap-4">
      <CoreFinanceOrchestrationPanel
        data={data}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
        accountScope={accountScope}
        onAccountScopeChange={onAccountScopeChange}
        currentTab="loans"
        onNavigateTab={onNavigateTab}
      />
      <CoreEntityWorkspaceTab
        icon={BriefcaseBusiness}
        title="Loans"
        description="Loan balances, repayment cadence, and minimum payment rules stored in Convex."
        recordsLabel="loans"
        viewerAuthenticated={data?.viewerAuthenticated}
        stats={[
          {
            label: 'Total balance',
            value: money.format(totalBalance),
            tone: totalBalance > 0 ? 'warning' : 'neutral',
          },
          { label: 'Min payments', value: money.format(totalMin) },
          {
            label: `Scoped cashflow (${scopedCashflow.scopeLabel})`,
            value: money.format(scopedCashflow.netBeforeDebt),
            tone: scopedCashflow.netBeforeDebt >= 0 ? 'positive' : 'warning',
          },
        ]}
        rows={rows}
        emptyLabel="No loans found yet."
        onOpenManager={onOpenManager}
        thumbMode={thumbMode}
        thumbActions={[
          { id: 'loans-manager', label: 'Manage', icon: BriefcaseBusiness, onClick: onOpenManager },
          { id: 'loans-bills', label: 'Bills', icon: CalendarClock, onClick: () => onNavigateTab('bills') },
          { id: 'loans-ledger', label: 'Ledger', icon: ArrowRightLeft, onClick: () => onNavigateTab('transactions') },
          { id: 'loans-plan', label: 'Planning', icon: Target, onClick: () => onNavigateTab('planning') },
        ]}
      />
    </div>
  )
}
