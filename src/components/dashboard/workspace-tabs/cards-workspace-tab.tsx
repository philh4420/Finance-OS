import { ArrowRightLeft, CalendarClock, CreditCard, Target } from 'lucide-react'

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

export function CardsWorkspaceTab({
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
  const cards = data?.cards ?? []
  const scopedCashflow = summarizeCoreFinanceScope(data, accountScope)
  const totalLimit = cards.reduce((sum, card) => sum + card.creditLimit, 0)
  const totalUsed = cards.reduce((sum, card) => sum + card.usedLimit, 0)
  const utilization = totalLimit ? (totalUsed / totalLimit) * 100 : 0

  const rows: CoreEntityWorkspaceRow[] = cards.map((card) => ({
    id: card.id,
    title: card.name,
    subtitle: `Due ${card.dueDay} · ${card.interestRate}% APR · Min ${money.format(card.minimumPayment)}`,
    amountLabel: `${money.format(card.usedLimit)} / ${money.format(card.creditLimit)}`,
    hint: `Spend/month ${money.format(card.spendPerMonth)}`,
    createdAt: card.createdAt,
  }))

  return (
    <div className="grid gap-4">
      <CoreFinanceOrchestrationPanel
        data={data}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
        accountScope={accountScope}
        onAccountScopeChange={onAccountScopeChange}
        currentTab="cards"
        onNavigateTab={onNavigateTab}
      />
      <CoreEntityWorkspaceTab
        icon={CreditCard}
        title="Cards"
        description="Credit utilization, APR, and minimum payment profiles feeding debt and cashflow models."
        recordsLabel="cards"
        viewerAuthenticated={data?.viewerAuthenticated}
        stats={[
          {
            label: 'Utilization',
            value: `${utilization.toFixed(1)}%`,
            tone: utilization > 40 ? 'warning' : 'neutral',
          },
          { label: 'Total used', value: money.format(totalUsed) },
          {
            label: `Scoped cashflow (${scopedCashflow.scopeLabel})`,
            value: money.format(scopedCashflow.netBeforeDebt),
            tone: scopedCashflow.netBeforeDebt >= 0 ? 'positive' : 'warning',
          },
        ]}
        rows={rows}
        emptyLabel="No credit cards found yet."
        onOpenManager={onOpenManager}
        thumbMode={thumbMode}
        thumbActions={[
          { id: 'cards-manager', label: 'Manage', icon: CreditCard, onClick: onOpenManager },
          { id: 'cards-bills', label: 'Bills', icon: CalendarClock, onClick: () => onNavigateTab('bills') },
          { id: 'cards-ledger', label: 'Ledger', icon: ArrowRightLeft, onClick: () => onNavigateTab('transactions') },
          { id: 'cards-plan', label: 'Planning', icon: Target, onClick: () => onNavigateTab('planning') },
        ]}
      />
    </div>
  )
}
