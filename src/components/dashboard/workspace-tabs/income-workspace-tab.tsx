import { CalendarClock, DollarSign, Landmark, Target } from 'lucide-react'

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

function monthlyEquivalent(amount: number, cadence: string) {
  if (cadence === 'weekly') return amount * 52 / 12
  if (cadence === 'biweekly') return amount * 26 / 12
  return amount
}

function incomeIntervalDays(income: CoreFinanceEditorData['incomes'][number]) {
  const cadence = income.cadence.toLowerCase()
  if (cadence === 'weekly') return 7
  if (cadence === 'biweekly' || cadence === 'fortnightly') return 14
  if (cadence === 'custom') {
    const interval = Math.max(1, Math.trunc(income.customInterval ?? 1))
    const unit = String(income.customUnit ?? 'weeks').toLowerCase()
    if (unit.startsWith('week')) return interval * 7
    if (unit.startsWith('day')) return interval
  }
  return null
}

function nextMonthlyOccurrence(day: number, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDayThisMonth = new Date(year, month + 1, 0).getDate()
  const thisMonth = new Date(year, month, Math.min(lastDayThisMonth, Math.max(1, day)))
  if (thisMonth >= new Date(year, month, now.getDate())) return thisMonth
  const lastDayNextMonth = new Date(year, month + 2, 0).getDate()
  return new Date(year, month + 1, Math.min(lastDayNextMonth, Math.max(1, day)))
}

function nextIncomeDateLabel(income: CoreFinanceEditorData['incomes'][number]) {
  const intervalDays = incomeIntervalDays(income)
  let next: Date | null = null
  let estimated = false

  if (intervalDays) {
    const anchor = new Date(income.createdAt || Date.now())
    anchor.setHours(9, 0, 0, 0)
    const now = new Date()
    now.setSeconds(0, 0)
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000
    if (anchor.getTime() >= now.getTime()) {
      next = anchor
    } else {
      const elapsed = now.getTime() - anchor.getTime()
      const steps = Math.max(0, Math.floor(elapsed / intervalMs))
      const candidate = new Date(anchor.getTime() + steps * intervalMs)
      next = candidate.getTime() >= now.getTime() ? candidate : new Date(candidate.getTime() + intervalMs)
    }
    estimated = true
  } else {
    next = nextMonthlyOccurrence(income.receivedDay || 1)
  }

  if (!next) return null

  const label = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(next)

  return estimated ? `${label} (est.)` : label
}

export function IncomeWorkspaceTab({
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
  const allIncomes = data?.incomes ?? []
  const incomes = allIncomes.filter((income) =>
    matchesCoreFinanceAccountScope(accountScope, income.destinationAccountId),
  )
  const accountMap = new Map((data?.accountOptions ?? []).map((row) => [row.id, row.name]))
  const monthlyRunRate = incomes.reduce(
    (sum, income) => sum + monthlyEquivalent(income.amount, income.cadence),
    0,
  )

  const rows: CoreEntityWorkspaceRow[] = incomes.map((income) => {
    const nextPayLabel = nextIncomeDateLabel(income)
    return {
      id: income.id,
      title: income.source,
      subtitle: `${income.cadence} · Day ${income.receivedDay}${nextPayLabel ? ` · Next ${nextPayLabel}` : ''}`,
      amountLabel: money.format(income.amount),
      badge: 'Income',
      hint: income.destinationAccountId
        ? `Destination: ${accountMap.get(income.destinationAccountId) ?? 'Linked account'}`
        : undefined,
      createdAt: income.createdAt,
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
        currentTab="income"
        onNavigateTab={onNavigateTab}
      />
      <CoreEntityWorkspaceTab
        icon={DollarSign}
        title="Income"
        description="Recurring income schedules used for monthly cashflow planning and cycle checks."
        recordsLabel="income sources"
        viewerAuthenticated={data?.viewerAuthenticated}
        stats={[
          { label: 'Sources', value: String(incomes.length) },
          { label: 'Monthly run rate', value: money.format(monthlyRunRate), tone: 'positive' },
          {
            label: 'Custom cadence',
            value: String(incomes.filter((income) => income.cadence === 'custom').length),
          },
        ]}
        rows={rows}
        emptyLabel="No income schedules found for the current account scope yet."
        onOpenManager={onOpenManager}
        thumbMode={thumbMode}
        thumbActions={[
          { id: 'income-manager', label: 'Manage', icon: DollarSign, onClick: onOpenManager },
          { id: 'income-accounts', label: 'Accounts', icon: Landmark, onClick: () => onNavigateTab('accounts') },
          { id: 'income-bills', label: 'Bills', icon: CalendarClock, onClick: () => onNavigateTab('bills') },
          { id: 'income-planning', label: 'Planning', icon: Target, onClick: () => onNavigateTab('planning') },
        ]}
      />
    </div>
  )
}
