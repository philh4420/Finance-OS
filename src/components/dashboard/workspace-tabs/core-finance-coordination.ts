import type { CoreFinanceEditorData } from '@/components/dashboard/dashboard-types'

export const CORE_FINANCE_ACCOUNT_SCOPE_ALL = 'all'
export const CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED = 'unlinked'

export type CoreFinanceAccountScope = string

type ScopeDescriptor =
  | { kind: 'all' }
  | { kind: 'unlinked' }
  | { kind: 'account'; accountId: string }

function parseCoreFinanceAccountScope(scope: CoreFinanceAccountScope): ScopeDescriptor {
  if (scope === CORE_FINANCE_ACCOUNT_SCOPE_UNLINKED) return { kind: 'unlinked' }
  if (scope.startsWith('account:')) {
    const accountId = scope.slice('account:'.length)
    if (accountId) return { kind: 'account', accountId }
  }
  return { kind: 'all' }
}

function monthlyEquivalent(amount: number, cadence: string) {
  if (cadence === 'weekly') return (amount * 52) / 12
  if (cadence === 'biweekly') return (amount * 26) / 12
  if (cadence === 'quarterly') return amount / 3
  if (cadence === 'yearly' || cadence === 'annual') return amount / 12
  if (cadence === 'custom') return amount
  return amount
}

export function coreFinanceAccountScopeForId(accountId: string): CoreFinanceAccountScope {
  return `account:${accountId}`
}

export function matchesCoreFinanceAccountScope(
  scope: CoreFinanceAccountScope,
  accountId: string | null | undefined,
) {
  const parsed = parseCoreFinanceAccountScope(scope)
  if (parsed.kind === 'all') return true
  if (parsed.kind === 'unlinked') return !accountId
  return accountId === parsed.accountId
}

export function summarizeCoreFinanceScope(
  data: CoreFinanceEditorData | undefined,
  scope: CoreFinanceAccountScope,
) {
  const parsed = parseCoreFinanceAccountScope(scope)
  const incomes = (data?.incomes ?? []).filter((row) =>
    matchesCoreFinanceAccountScope(scope, row.destinationAccountId),
  )
  const bills = (data?.bills ?? []).filter((row) =>
    matchesCoreFinanceAccountScope(scope, row.linkedAccountId),
  )
  const incomeRunRate = incomes.reduce((sum, row) => sum + monthlyEquivalent(row.amount, row.cadence), 0)
  const billRunRate = bills.reduce((sum, row) => sum + monthlyEquivalent(row.amount, row.cadence), 0)
  const accountName =
    parsed.kind === 'account'
      ? data?.accountOptions.find((row) => row.id === parsed.accountId)?.name ?? 'Selected account'
      : null
  return {
    incomeRunRate,
    billRunRate,
    netBeforeDebt: incomeRunRate - billRunRate,
    incomeCount: incomes.length,
    billCount: bills.length,
    scopeKind: parsed.kind,
    accountId: parsed.kind === 'account' ? parsed.accountId : null,
    scopeLabel:
      parsed.kind === 'all'
        ? 'All accounts'
        : parsed.kind === 'unlinked'
          ? 'Unlinked records'
          : accountName,
  }
}

export function monthlyEquivalentForFinanceWorkspace(amount: number, cadence: string) {
  return monthlyEquivalent(amount, cadence)
}

