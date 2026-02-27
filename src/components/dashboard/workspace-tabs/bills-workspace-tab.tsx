import { ArrowRightLeft, CalendarClock, CreditCard, DollarSign } from 'lucide-react'

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
  matchesCoreFinanceAccountScope,
  type CoreFinanceAccountScope,
} from './core-finance-coordination'

export function BillsWorkspaceTab({
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
  const allBills = data?.bills ?? []
  const bills = allBills.filter((bill) => matchesCoreFinanceAccountScope(accountScope, bill.linkedAccountId))
  const accountMap = new Map((data?.accountOptions ?? []).map((row) => [row.id, row.name]))

  const rows: CoreEntityWorkspaceRow[] = bills.map((bill) => ({
    id: bill.id,
    title: bill.name,
    subtitle: `${bill.cadence} · Due day ${bill.dueDay}`,
    amountLabel: money.format(bill.amount),
    badge: bill.isSubscription ? 'Sub' : bill.autopay ? 'Autopay' : undefined,
    hint: bill.linkedAccountId
      ? `Linked: ${accountMap.get(bill.linkedAccountId) ?? 'Account'} · ${bill.category || 'Uncategorized'}`
      : bill.category || undefined,
    createdAt: bill.createdAt,
  }))

  return (
    <div className="grid gap-4">
      <CoreFinanceOrchestrationPanel
        data={data}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
        accountScope={accountScope}
        onAccountScopeChange={onAccountScopeChange}
        currentTab="bills"
        onNavigateTab={onNavigateTab}
      />
      <CoreEntityWorkspaceTab
        icon={CalendarClock}
        title="Bills"
        description="Recurring obligations, subscriptions, and due dates used by month-close projections."
        recordsLabel="bills"
        viewerAuthenticated={data?.viewerAuthenticated}
        stats={[
          { label: 'Recurring total', value: money.format(bills.reduce((s, bill) => s + bill.amount, 0)) },
          { label: 'Autopay', value: String(bills.filter((bill) => bill.autopay).length) },
          { label: 'Subscriptions', value: String(bills.filter((bill) => bill.isSubscription).length) },
        ]}
        rows={rows}
        emptyLabel="No recurring bills found for the current account scope yet."
        onOpenManager={onOpenManager}
        thumbMode={thumbMode}
        thumbActions={[
          { id: 'bills-manager', label: 'Manage', icon: CalendarClock, onClick: onOpenManager },
          { id: 'bills-income', label: 'Income', icon: DollarSign, onClick: () => onNavigateTab('income') },
          { id: 'bills-cards', label: 'Cards', icon: CreditCard, onClick: () => onNavigateTab('cards') },
          { id: 'bills-ledger', label: 'Ledger', icon: ArrowRightLeft, onClick: () => onNavigateTab('transactions') },
        ]}
      />
    </div>
  )
}
