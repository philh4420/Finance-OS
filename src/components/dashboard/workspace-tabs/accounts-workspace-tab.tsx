import { ArrowRightLeft, CalendarClock, DollarSign, Landmark } from 'lucide-react'

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
import type { CoreFinanceAccountScope } from './core-finance-coordination'

export function AccountsWorkspaceTab({
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
  const accounts = data?.accounts ?? []
  const incomes = data?.incomes ?? []
  const bills = data?.bills ?? []
  const liquidCount = accounts.filter((account) => account.liquid).length
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)
  const typeCount = new Set(accounts.map((account) => account.type)).size

  const rows: CoreEntityWorkspaceRow[] = accounts.map((account) => {
    const linkedIncomeCount = incomes.filter((row) => row.destinationAccountId === account.id).length
    const linkedBillCount = bills.filter((row) => row.linkedAccountId === account.id).length
    return {
      id: account.id,
      title: account.name,
      subtitle: `${account.type} · ${account.liquid ? 'Liquid' : 'Non-liquid'}`,
      amountLabel: money.format(account.balance),
      createdAt: account.createdAt,
      badge:
        accountScope === `account:${account.id}`
          ? 'Focused'
          : linkedIncomeCount || linkedBillCount
            ? 'Linked'
            : undefined,
      hint: `${linkedIncomeCount} income links · ${linkedBillCount} bill links`,
    }
  })

  return (
    <div className="grid gap-4">
      <CoreFinanceOrchestrationPanel
        data={data}
        displayCurrency={displayCurrency}
        displayLocale={displayLocale}
        accountScope={accountScope}
        onAccountScopeChange={onAccountScopeChange}
        currentTab="accounts"
        onNavigateTab={onNavigateTab}
      />
      <CoreEntityWorkspaceTab
        icon={Landmark}
        title="Accounts"
        description="Bank, savings, investment, and debt accounts powering the live dashboard totals and cashflow routing."
        recordsLabel="accounts"
        viewerAuthenticated={data?.viewerAuthenticated}
        stats={[
          { label: 'Total balance', value: money.format(totalBalance) },
          { label: 'Liquid accounts', value: String(liquidCount) },
          { label: 'Account types', value: String(typeCount || 0) },
        ]}
        rows={rows}
        emptyLabel="No accounts found for this user yet."
        onOpenManager={onOpenManager}
        thumbMode={thumbMode}
        thumbActions={[
          { id: 'accounts-manager', label: 'Manage', icon: Landmark, onClick: onOpenManager },
          { id: 'accounts-income', label: 'Income', icon: DollarSign, onClick: () => onNavigateTab('income') },
          { id: 'accounts-bills', label: 'Bills', icon: CalendarClock, onClick: () => onNavigateTab('bills') },
          { id: 'accounts-ledger', label: 'Ledger', icon: ArrowRightLeft, onClick: () => onNavigateTab('transactions') },
        ]}
      />
    </div>
  )
}
