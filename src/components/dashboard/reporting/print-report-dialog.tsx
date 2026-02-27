import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from 'convex/react'
import {
  BookCheck,
  Brush,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Printer,
  Settings2,
  Target,
  Users,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

type WorkspaceSectionKey =
  | 'dashboard'
  | 'coreFinance'
  | 'transactions'
  | 'automation'
  | 'planning'
  | 'governance'
  | 'reliability'

type SectionToggleState = Record<WorkspaceSectionKey, boolean>

type ReportModeKey =
  | 'executiveSummary'
  | 'householdBudgetReview'
  | 'debtReductionReview'
  | 'auditPack'

type ReportAudienceKey = 'self' | 'partner' | 'accountant'

type ReportThemeKey = 'executiveCobalt' | 'householdSage' | 'graphiteLedger'

type PrintReportDialogProps = {
  displayCurrency: string
  displayLocale: string
  auditReadyMode?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}

type SectionDefinition = {
  key: WorkspaceSectionKey
  label: string
  description: string
}

type ReportSectionData = {
  key: WorkspaceSectionKey
  label: string
  description: string
  queryName: string
  data: unknown
  loaded: boolean
}

type ReportModeDefinition = {
  key: ReportModeKey
  label: string
  description: string
  title: string
  subtitle: string
  sections: SectionToggleState
}

type ReportAudienceDefinition = {
  key: ReportAudienceKey
  label: string
  description: string
  languageSummary: string
  detailLevel: 'concise' | 'balanced' | 'technical'
}

type ReportThemeDefinition = {
  key: ReportThemeKey
  label: string
  description: string
  className: string
}

type KeyDecisionItem = {
  id: string
  priority: 'High' | 'Medium' | 'Low'
  title: string
  why: string
  recommendation: string
  owner: string
}

type VarianceCommentaryItem = {
  id: string
  metric: string
  planned: number
  actual: number
  delta: number
  commentary: string
  direction: 'favorable' | 'watch' | 'adverse'
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Executive snapshot, cash positions, cards, loans, trends, and high-level insights.',
  },
  {
    key: 'coreFinance',
    label: 'Accounts, Income, Bills, Cards & Loans',
    description: 'Phase 1 core finance entities from the normalized Convex database.',
  },
  {
    key: 'transactions',
    label: 'Transactions & Ledger',
    description: 'Phase 3 purchases, splits, ledger entries/lines, and transaction history.',
  },
  {
    key: 'automation',
    label: 'Rules & Automation',
    description: 'Rules, smart suggestions, monthly automation controls, and cycle alerts.',
  },
  {
    key: 'planning',
    label: 'Planning, Goals & Envelopes',
    description: 'Forecasts, plan versions, action tasks, goals, goal events, and envelopes.',
  },
  {
    key: 'governance',
    label: 'Governance & Compliance',
    description: 'Exports, privacy, retention/deletion, and audit trail records.',
  },
  {
    key: 'reliability',
    label: 'PWA Reliability & Observability',
    description: 'Reminder feed, client telemetry, and operational reliability metrics.',
  },
]

const REPORT_MODE_DEFINITIONS: ReportModeDefinition[] = [
  {
    key: 'executiveSummary',
    label: 'Executive Summary',
    description: 'Top-level finance narrative for month-over-month position and immediate actions.',
    title: 'Financial Command Center | Executive Summary',
    subtitle:
      'Decision-ready snapshot covering cash position, obligations, priorities, and near-term actions.',
    sections: {
      dashboard: true,
      coreFinance: true,
      transactions: false,
      automation: false,
      planning: true,
      governance: false,
      reliability: false,
    },
  },
  {
    key: 'householdBudgetReview',
    label: 'Household Budget Review',
    description: 'Cashflow, recurring obligations, and spend control for household planning reviews.',
    title: 'Financial Command Center | Household Budget Review',
    subtitle:
      'Household budget lens covering income cadence, recurring commitments, shopping behavior, and plan adherence.',
    sections: {
      dashboard: true,
      coreFinance: true,
      transactions: true,
      automation: false,
      planning: true,
      governance: false,
      reliability: false,
    },
  },
  {
    key: 'debtReductionReview',
    label: 'Debt Reduction Review',
    description: 'Debt load, repayment sequencing, and minimum-vs-extra-payment progress.',
    title: 'Financial Command Center | Debt Reduction Review',
    subtitle:
      'Debt-focused review covering cards, loans, repayment pressure, and projected payoff trajectory.',
    sections: {
      dashboard: true,
      coreFinance: true,
      transactions: true,
      automation: true,
      planning: true,
      governance: false,
      reliability: false,
    },
  },
  {
    key: 'auditPack',
    label: 'Audit Pack',
    description: 'Traceable, evidence-first pack for governance, review, and external stakeholders.',
    title: 'Financial Command Center | Audit Pack',
    subtitle:
      'Audit-ready report emphasizing traceability, controls, policy state, and evidence-backed financial records.',
    sections: {
      dashboard: true,
      coreFinance: true,
      transactions: true,
      automation: true,
      planning: true,
      governance: true,
      reliability: true,
    },
  },
]

const REPORT_AUDIENCE_DEFINITIONS: ReportAudienceDefinition[] = [
  {
    key: 'self',
    label: 'Self',
    description: 'Concise and action-first language for personal decision making.',
    languageSummary: 'Practical, plain language with short decision prompts.',
    detailLevel: 'concise',
  },
  {
    key: 'partner',
    label: 'Partner',
    description: 'Shared-household language with tradeoffs and collaborative actions.',
    languageSummary: 'Balanced language that supports discussion and agreement.',
    detailLevel: 'balanced',
  },
  {
    key: 'accountant',
    label: 'Accountant',
    description: 'Technical phrasing, stronger audit traceability, and deeper context.',
    languageSummary: 'Formal reporting tone with data lineage and reconciliation context.',
    detailLevel: 'technical',
  },
]

const REPORT_THEME_DEFINITIONS: ReportThemeDefinition[] = [
  {
    key: 'executiveCobalt',
    label: 'Executive Cobalt',
    description: 'Premium blue-forward board style with strong hierarchy.',
    className: 'print-theme-executive-cobalt',
  },
  {
    key: 'householdSage',
    label: 'Household Sage',
    description: 'Calm green-neutral style designed for household monthly reviews.',
    className: 'print-theme-household-sage',
  },
  {
    key: 'graphiteLedger',
    label: 'Graphite Ledger',
    description: 'Formal grayscale-ledger style optimized for audit packets.',
    className: 'print-theme-graphite-ledger',
  },
]

const REPORT_MODE_BY_KEY: Record<ReportModeKey, ReportModeDefinition> = Object.fromEntries(
  REPORT_MODE_DEFINITIONS.map((mode) => [mode.key, mode]),
) as Record<ReportModeKey, ReportModeDefinition>

const REPORT_AUDIENCE_BY_KEY: Record<ReportAudienceKey, ReportAudienceDefinition> =
  Object.fromEntries(
    REPORT_AUDIENCE_DEFINITIONS.map((preset) => [preset.key, preset]),
  ) as Record<ReportAudienceKey, ReportAudienceDefinition>

const REPORT_THEME_BY_KEY: Record<ReportThemeKey, ReportThemeDefinition> = Object.fromEntries(
  REPORT_THEME_DEFINITIONS.map((theme) => [theme.key, theme]),
) as Record<ReportThemeKey, ReportThemeDefinition>

const MONEY_KEY_RE = /(amount|balance|budget|cost|debt|income|expense|value|worth|price|payment|limit|spent|available|allocation|target|current|principal|interest|liability|net)/i
const TIMESTAMP_KEY_RE = /(At|Time|Timestamp|Date)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatReportTimestamp(value: number) {
  try {
    return format(new Date(value), 'dd MMM yyyy, HH:mm')
  } catch {
    return 'Invalid date'
  }
}

function looksLikeTimestamp(key: string, value: number) {
  return TIMESTAMP_KEY_RE.test(key) && value > 1_000_000_000_000 && value < 9_999_999_999_999
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value)
}

function formatCurrency(value: number, locale: string, currency: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${formatNumber(value, locale)}`
  }
}

function formatScalarValue(
  value: unknown,
  key: string,
  locale: string,
  currency: string,
) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (looksLikeTimestamp(key, value)) return formatReportTimestamp(value)
    if (Number.isInteger(value) && Math.abs(value) > 1_000_000_000_000) return String(value)
    if (MONEY_KEY_RE.test(key)) return formatCurrency(value, locale, currency)
    return formatNumber(value, locale)
  }
  if (typeof value === 'string') return value || '—'
  if (Array.isArray(value)) return `${value.length} items`
  if (isRecord(value)) return `${Object.keys(value).length} fields`
  return String(value)
}

function formatCellValue(
  row: Record<string, unknown>,
  key: string,
  locale: string,
  currency: string,
) {
  const value = row[key]
  if (isRecord(value) || Array.isArray(value)) {
    const json = safeJsonPreview(value)
    return json.length > 180 ? `${json.slice(0, 177)}...` : json
  }
  return formatScalarValue(value, key, locale, currency)
}

function safeJsonPreview(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function collectColumnKeys(rows: Record<string, unknown>[]) {
  const ordered = new Map<string, true>()
  for (const row of rows.slice(0, 50)) {
    for (const key of Object.keys(row)) {
      if (!ordered.has(key)) ordered.set(key, true)
    }
  }
  return Array.from(ordered.keys())
}

function isObjectArray(value: unknown[]): value is Record<string, unknown>[] {
  return value.every((item) => isRecord(item))
}

function estimateRows(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + 1 + estimateRows(entry), 0)
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>((sum, entry) => sum + estimateRows(entry), 0)
  }
  return 0
}

function topLevelArrayCount(value: unknown): number {
  if (!isRecord(value)) return 0
  return Object.values(value).reduce<number>(
    (sum, entry) => sum + (Array.isArray(entry) ? entry.length : 0),
    0,
  )
}

function topLevelRecordFieldCount(value: unknown): number {
  if (!isRecord(value)) return 0
  return Object.keys(value).length
}

function summarizeAuthState(data: unknown) {
  if (!isRecord(data)) return null
  if (typeof data.viewerAuthenticated !== 'boolean') return null
  return data.viewerAuthenticated ? 'Signed-in data' : 'Auth required / empty viewer'
}

function numberOr(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toObject(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function toObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
}

function findSectionData(sections: ReportSectionData[], key: WorkspaceSectionKey) {
  return sections.find((section) => section.key === key)?.data
}

function estimateRunwayMonths(liquidCash: number, monthlyExpenses: number) {
  if (monthlyExpenses <= 0) return null
  return liquidCash / monthlyExpenses
}

function buildKeyDecisions({
  sections,
  audience,
  locale,
  currency,
}: {
  sections: ReportSectionData[]
  audience: ReportAudienceDefinition
  locale: string
  currency: string
}): KeyDecisionItem[] {
  const ownerLabel =
    audience.key === 'self'
      ? 'You'
      : audience.key === 'partner'
        ? 'You + Partner'
        : 'Finance Owner'

  const dashboardRoot = toObject(findSectionData(sections, 'dashboard'))
  const dashboardData = toObject(dashboardRoot?.data)
  const summary = toObject(dashboardData?.summary)

  const planningRoot = toObject(findSectionData(sections, 'planning'))
  const planningForecast = toObject(planningRoot?.forecast)
  const planningTasks = toObject(planningForecast?.tasks)

  const coreFinanceRoot = toObject(findSectionData(sections, 'coreFinance'))
  const cards = toObjectArray(coreFinanceRoot?.cards)
  const loans = toObjectArray(coreFinanceRoot?.loans)

  const governanceRoot = toObject(findSectionData(sections, 'governance'))
  const auditTrail = toObject(governanceRoot?.auditTrail)
  const auditStats = toObject(auditTrail?.stats)

  const monthlyIncome = numberOr(summary?.monthlyIncome)
  const monthlyExpenses = numberOr(summary?.monthlyExpenses)
  const monthlyNet = monthlyIncome - monthlyExpenses
  const liquidCash = numberOr(summary?.liquidCash)
  const runwayMonths = estimateRunwayMonths(liquidCash, monthlyExpenses)

  const totalCardDebt = cards.reduce((sum, row) => sum + Math.max(0, numberOr(row.usedLimit)), 0)
  const totalLoanDebt = loans.reduce(
    (sum, row) =>
      sum + Math.max(numberOr(row.balance), numberOr(row.principalBalance)),
    0,
  )
  const totalDebt = totalCardDebt + totalLoanDebt
  const blockedTasks = numberOr(planningTasks?.blocked)
  const auditRows = numberOr(auditStats?.totalRows)

  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  })

  const decisions: KeyDecisionItem[] = []

  if (runwayMonths != null && runwayMonths < 1.5) {
    decisions.push({
      id: 'runway-stabilize',
      priority: 'High',
      title: 'Stabilize short cash runway',
      why: `Liquid runway is ${runwayMonths.toFixed(1)} months against current obligations.`,
      recommendation:
        'Pause controllable spend for one cycle and prioritize obligations due before next payday.',
      owner: ownerLabel,
    })
  } else if (runwayMonths != null && runwayMonths >= 3) {
    decisions.push({
      id: 'runway-allocate',
      priority: 'Medium',
      title: 'Allocate surplus buffer intentionally',
      why: `Runway is ${runwayMonths.toFixed(1)} months with positive coverage.`,
      recommendation:
        'Pre-allocate surplus toward debt acceleration or priority goals before discretionary spend.',
      owner: ownerLabel,
    })
  }

  if (monthlyNet < 0) {
    decisions.push({
      id: 'monthly-net-negative',
      priority: 'High',
      title: 'Return monthly cashflow to positive',
      why: `Current net is ${currencyFormatter.format(monthlyNet)} per month.`,
      recommendation:
        'Reduce variable categories first, then re-sequence debt payments while maintaining minimums.',
      owner: ownerLabel,
    })
  } else if (monthlyNet > 0) {
    decisions.push({
      id: 'monthly-net-positive',
      priority: 'Medium',
      title: 'Protect positive monthly net',
      why: `Current net is ${currencyFormatter.format(monthlyNet)} per month.`,
      recommendation:
        'Lock a fixed allocation split for goals and debt to prevent surplus drift.',
      owner: ownerLabel,
    })
  }

  if (totalDebt > 0) {
    decisions.push({
      id: 'debt-stack',
      priority: totalDebt > Math.max(liquidCash * 1.5, 1) ? 'High' : 'Medium',
      title: 'Execute debt repayment sequence',
      why: `Cards + loans total ${currencyFormatter.format(totalDebt)}.`,
      recommendation:
        'Use one repayment strategy for the next 90 days (highest APR first or smallest balance first) and keep it consistent.',
      owner: ownerLabel,
    })
  }

  if (blockedTasks > 0) {
    decisions.push({
      id: 'planning-unblock',
      priority: 'Medium',
      title: 'Unblock planning backlog',
      why: `${blockedTasks} planning task${blockedTasks === 1 ? '' : 's'} are blocked.`,
      recommendation:
        'Convert blocked items into dated owners or remove them from the active month plan to keep forecasts reliable.',
      owner: ownerLabel,
    })
  }

  if (auditRows > 0 && audience.key === 'accountant') {
    decisions.push({
      id: 'audit-traceability',
      priority: 'Low',
      title: 'Attach evidence references to monthly close',
      why: `${auditRows} audit events are loaded for traceability review.`,
      recommendation:
        'Use audit IDs and export checksums in close notes to strengthen external review readiness.',
      owner: 'Finance Owner',
    })
  }

  if (decisions.length === 0) {
    decisions.push({
      id: 'baseline-capture',
      priority: 'Medium',
      title: 'Capture first operating baseline',
      why: 'Not enough signal is available yet to prioritize evidence-based monthly decisions.',
      recommendation:
        'Add one income, one due bill, and one posted purchase so next report can rank decisions with confidence.',
      owner: ownerLabel,
    })
  }

  return decisions.slice(0, audience.detailLevel === 'concise' ? 3 : 5)
}

function buildVarianceCommentary({
  sections,
  audience,
}: {
  sections: ReportSectionData[]
  audience: ReportAudienceDefinition
}): VarianceCommentaryItem[] {
  const planningRoot = toObject(findSectionData(sections, 'planning'))
  const forecast = toObject(planningRoot?.forecast)
  const baseline = toObject(forecast?.baseline)
  const activePlan = toObject(forecast?.activePlanningVersionSummary)
  const envelopeTotals = toObject(toObject(forecast?.envelopes)?.totals)

  const rows: VarianceCommentaryItem[] = []
  if (!baseline || !activePlan) {
    const plannedEnvelope = numberOr(envelopeTotals?.planned)
    const actualEnvelope = numberOr(envelopeTotals?.actual)
    if (plannedEnvelope > 0 || actualEnvelope > 0) {
      const delta = actualEnvelope - plannedEnvelope
      rows.push({
        id: 'envelope-spend',
        metric: 'Envelope spend',
        planned: plannedEnvelope,
        actual: actualEnvelope,
        delta,
        direction: delta <= 0 ? 'favorable' : 'adverse',
        commentary:
          delta <= 0
            ? 'Spend is within planned envelopes for the selected cycle.'
            : 'Spend is above planned envelopes; review category-level overruns before month close.',
      })
    }
    return rows
  }

  const addVariance = (
    id: string,
    metric: string,
    planned: number,
    actual: number,
    opts: { lowerIsBetter: boolean; short: string; long: string },
  ) => {
    const delta = actual - planned
    const withinTolerance = Math.abs(delta) <= Math.max(1, Math.abs(planned) * 0.05)
    const favorable = opts.lowerIsBetter ? delta <= 0 : delta >= 0
    const direction: VarianceCommentaryItem['direction'] = withinTolerance
      ? 'watch'
      : favorable
        ? 'favorable'
        : 'adverse'

    const commentary =
      direction === 'watch'
        ? `${metric} is tracking close to plan. ${opts.short}`
        : direction === 'favorable'
          ? `${metric} is favorable versus plan. ${opts.short}`
          : `${metric} is adverse versus plan. ${opts.long}`

    rows.push({
      id,
      metric,
      planned,
      actual,
      delta,
      commentary,
      direction,
    })
  }

  addVariance('income', 'Monthly income', numberOr(activePlan.plannedIncome), numberOr(baseline.monthlyIncome), {
    lowerIsBetter: false,
    short: 'Maintain the current cadence and continue monitoring pay-cycle timing.',
    long: 'Verify missed/late income events and update cadence assumptions if this repeats next cycle.',
  })
  addVariance(
    'expenses',
    'Monthly expenses',
    numberOr(activePlan.plannedExpenses),
    numberOr(baseline.monthlyExpenses),
    {
      lowerIsBetter: true,
      short: 'Discipline is holding; keep envelope caps and due-day sequencing in place.',
      long: 'Drill into controllable categories and reschedule discretionary purchases after fixed obligations.',
    },
  )
  addVariance('net', 'Monthly net', numberOr(activePlan.plannedNet), numberOr(baseline.monthlyNet), {
    lowerIsBetter: false,
    short: 'Net performance is stable against plan.',
    long: 'Close the gap by combining expense control with targeted income or debt-payment adjustments.',
  })

  const plannedEnvelope = numberOr(envelopeTotals?.planned)
  const actualEnvelope = numberOr(envelopeTotals?.actual)
  if (plannedEnvelope > 0 || actualEnvelope > 0) {
    addVariance('envelopes', 'Envelope spend', plannedEnvelope, actualEnvelope, {
      lowerIsBetter: true,
      short: 'Envelope pacing is under control in this cycle.',
      long: 'Envelope overrun indicates category leakage; re-baseline planned allocations for next cycle.',
    })
  }

  if (audience.detailLevel === 'technical') return rows
  if (audience.detailLevel === 'balanced') return rows.slice(0, 3)
  return rows.slice(0, 2)
}

function varianceSummaryLine(
  rows: VarianceCommentaryItem[],
  locale: string,
  currency: string,
  audience: ReportAudienceDefinition,
) {
  if (rows.length === 0) {
    return 'No active planned-vs-actual model was found for this window. Add or activate a planning version to enable variance commentary.'
  }
  const adverseTotal = rows
    .filter((row) => row.direction === 'adverse')
    .reduce((sum, row) => sum + Math.max(0, row.delta), 0)
  const favorableTotal = rows
    .filter((row) => row.direction === 'favorable')
    .reduce((sum, row) => sum + Math.max(0, Math.abs(row.delta)), 0)

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  })

  if (audience.key === 'accountant') {
    return `Aggregate favorable variance: ${formatter.format(favorableTotal)}. Aggregate adverse variance: ${formatter.format(adverseTotal)}.`
  }
  if (audience.key === 'partner') {
    return `Favorable movement is about ${formatter.format(favorableTotal)}, while adverse movement is about ${formatter.format(adverseTotal)}.`
  }
  return `You are seeing about ${formatter.format(favorableTotal)} favorable movement and ${formatter.format(adverseTotal)} adverse movement.`
}

function renderTableOfObjects({
  rows,
  path,
  locale,
  currency,
}: {
  rows: Record<string, unknown>[]
  path: string
  locale: string
  currency: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
        No rows.
      </div>
    )
  }

  const columns = collectColumnKeys(rows)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="print-report-table min-w-full table-fixed border-collapse text-[11px] leading-relaxed">
          <caption className="sr-only">{path}</caption>
          <thead>
            <tr className="bg-slate-100/90 text-slate-700">
              {columns.map((columnKey) => (
                <th
                  key={`${path}:${columnKey}`}
                  scope="col"
                  className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold tracking-[0.03em] last:border-r-0"
                >
                  {humanizeKey(columnKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${path}:row:${rowIndex}`} className="align-top odd:bg-white even:bg-slate-50/45">
                {columns.map((columnKey) => (
                  <td
                    key={`${path}:row:${rowIndex}:${columnKey}`}
                    className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700 align-top last:border-r-0"
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {formatCellValue(row, columnKey, locale, currency)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderPrimitiveList({
  values,
  path,
  locale,
  currency,
}: {
  values: unknown[]
  path: string
  locale: string
  currency: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="print-report-table min-w-full border-collapse text-[11px] leading-relaxed">
        <caption className="sr-only">{path}</caption>
        <thead>
          <tr className="bg-slate-100/90 text-slate-700">
            <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
              #
            </th>
            <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {values.map((value, index) => (
            <tr key={`${path}:${index}`} className="odd:bg-white even:bg-slate-50/45">
              <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-500">{index + 1}</td>
              <td className="border-b border-slate-100 px-2 py-1.5 text-slate-700">
                {formatScalarValue(value, 'value', locale, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportNode({
  title,
  value,
  path,
  depth,
  locale,
  currency,
}: {
  title: string
  value: unknown
  path: string
  depth: number
  locale: string
  currency: string
}) {
  if (depth > 5) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        Nested depth limit reached at {title}.
      </div>
    )
  }

  if (Array.isArray(value)) {
    const objectRows = isObjectArray(value) ? value : null
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h4>
          <Badge variant="outline" className="border-slate-300 bg-white text-[10px] text-slate-600">
            {value.length} rows
          </Badge>
        </div>
        {objectRows
          ? renderTableOfObjects({ rows: objectRows, path, locale, currency })
          : renderPrimitiveList({ values: value, path, locale, currency })}
      </div>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    const scalarEntries = entries.filter(([, entry]) => !isRecord(entry) && !Array.isArray(entry))
    const nestedEntries = entries.filter(([, entry]) => isRecord(entry) || Array.isArray(entry))

    return (
      <div className="space-y-3">
        {title ? <h4 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h4> : null}
        {scalarEntries.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="print-report-table min-w-full border-collapse text-[11px] leading-relaxed">
              <caption className="sr-only">{path}</caption>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700">
                  <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Field
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {scalarEntries.map(([entryKey, entryValue]) => (
                  <tr key={`${path}:${entryKey}`} className="odd:bg-white even:bg-slate-50/45">
                    <th
                      scope="row"
                      className="w-[28%] border-b border-r border-slate-100 px-2 py-1.5 text-left font-medium text-slate-600"
                    >
                      {humanizeKey(entryKey)}
                    </th>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-slate-700">
                      <div className="whitespace-pre-wrap break-words">
                        {formatScalarValue(entryValue, entryKey, locale, currency)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {nestedEntries.map(([entryKey, entryValue]) => (
          <div key={`${path}:${entryKey}`} className="space-y-2">
            <ReportNode
              title={humanizeKey(entryKey)}
              value={entryValue}
              path={`${path}.${entryKey}`}
              depth={depth + 1}
              locale={locale}
              currency={currency}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
      {formatScalarValue(value, title, locale, currency)}
    </div>
  )
}

function PrintReportDocument({
  reportTitle,
  subtitle,
  reportPreparedAt,
  displayCurrency,
  displayLocale,
  reportMode,
  audiencePreset,
  themeTemplate,
  keyDecisions,
  varianceCommentary,
  varianceSummary,
  sections,
}: {
  reportTitle: string
  subtitle: string
  reportPreparedAt: number
  displayCurrency: string
  displayLocale: string
  reportMode: ReportModeDefinition
  audiencePreset: ReportAudienceDefinition
  themeTemplate: ReportThemeDefinition
  keyDecisions: KeyDecisionItem[]
  varianceCommentary: VarianceCommentaryItem[]
  varianceSummary: string
  sections: ReportSectionData[]
}) {
  const totalEstimatedRows = sections.reduce((sum, section) => sum + estimateRows(section.data), 0)
  const detailIsTechnical = audiencePreset.detailLevel === 'technical'

  return (
    <div className="print-report-shell" aria-hidden="true">
      <div
        className={cn(
          'print-report-root mx-auto w-full max-w-[1120px] p-8 text-slate-900',
          themeTemplate.className,
        )}
      >
        <header className="print-report-page print-report-no-break relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="print-report-header-bg pointer-events-none absolute inset-0" />
          <div className="relative space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-slate-600 uppercase">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
                  Finance OS Print Report
                </div>
                <div>
                  <h1 className="text-3xl leading-tight font-semibold tracking-tight text-slate-950">
                    {reportTitle}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</p>
                </div>
              </div>
              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/92 p-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="tracking-[0.14em] text-slate-500 uppercase">Mode</div>
                    <div className="mt-1 font-medium text-slate-800">{reportMode.label}</div>
                  </div>
                  <div>
                    <div className="tracking-[0.14em] text-slate-500 uppercase">Audience</div>
                    <div className="mt-1 font-medium text-slate-800">{audiencePreset.label}</div>
                  </div>
                  <div>
                    <div className="tracking-[0.14em] text-slate-500 uppercase">Generated</div>
                    <div className="mt-1 font-medium text-slate-800">
                      {formatReportTimestamp(reportPreparedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="tracking-[0.14em] text-slate-500 uppercase">Locale</div>
                    <div className="mt-1 font-medium text-slate-800">{displayLocale}</div>
                  </div>
                  <div>
                    <div className="tracking-[0.14em] text-slate-500 uppercase">Display Currency</div>
                    <div className="mt-1 font-medium text-slate-800">{displayCurrency}</div>
                  </div>
                  <div>
                    <div className="tracking-[0.14em] text-slate-500 uppercase">Sections</div>
                    <div className="mt-1 font-medium text-slate-800">{sections.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white/92 p-4">
                <div className="text-[10px] tracking-[0.18em] text-slate-500 uppercase">Estimated Rows</div>
                <div className="mt-1 text-xl font-semibold tracking-tight">{formatNumber(totalEstimatedRows, displayLocale)}</div>
                <div className="text-xs text-slate-500">Across selected app sections</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/92 p-4">
                <div className="text-[10px] tracking-[0.18em] text-slate-500 uppercase">Data Source</div>
                <div className="mt-1 text-xl font-semibold tracking-tight">Convex + Live Queries</div>
                <div className="text-xs text-slate-500">Authenticated workspace snapshots at print time</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/92 p-4">
                <div className="text-[10px] tracking-[0.18em] text-slate-500 uppercase">Audience Lens</div>
                <div className="mt-1 text-base font-semibold tracking-tight">{audiencePreset.languageSummary}</div>
                <div className="text-xs text-slate-500">{themeTemplate.label} theme template applied</div>
              </div>
            </div>
          </div>
        </header>

        <section className="print-report-section mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Included Sections</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {sections.map((section) => (
              <div key={section.key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-slate-900">{section.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-600">{section.description}</div>
                  </div>
                  <Badge variant="outline" className="border-slate-300 bg-white text-[10px] text-slate-600">
                    {topLevelArrayCount(section.data)} rows
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] tracking-[0.12em] uppercase">
                  {detailIsTechnical ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
                      {section.queryName}
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
                      Live workspace snapshot
                    </span>
                  )}
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
                    {topLevelRecordFieldCount(section.data)} top-level fields
                  </span>
                  {summarizeAuthState(section.data) ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
                      {summarizeAuthState(section.data)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="print-report-section mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-slate-700" />
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Key Decisions This Month</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Decision set generated from live workspace state for {format(new Date(reportPreparedAt), 'MMMM yyyy')} under the {reportMode.label.toLowerCase()} mode.
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="print-report-table min-w-full border-collapse text-[11px] leading-relaxed">
              <caption className="sr-only">Key decisions this month</caption>
              <thead>
                <tr className="bg-slate-100/90 text-slate-700">
                  <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Priority
                  </th>
                  <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Decision
                  </th>
                  <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Why This Matters
                  </th>
                  <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Recommended Move
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody>
                {keyDecisions.map((decision) => (
                  <tr key={decision.id} className="align-top odd:bg-white even:bg-slate-50/45">
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 font-medium text-slate-700">
                      {decision.priority}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-800">
                      {decision.title}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700">
                      {decision.why}
                    </td>
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700">
                      {decision.recommendation}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1.5 text-slate-700">
                      {decision.owner}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="print-report-section mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-700" />
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Variance Commentary</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">{varianceSummary}</p>
          {varianceCommentary.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
              Planned vs actual commentary is unavailable because no active planning baseline exists in this print scope.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="print-report-table min-w-full border-collapse text-[11px] leading-relaxed">
                <caption className="sr-only">Planned versus actual variance commentary</caption>
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700">
                    <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                      Metric
                    </th>
                    <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                      Planned
                    </th>
                    <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                      Actual
                    </th>
                    <th scope="col" className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold">
                      Variance
                    </th>
                    <th scope="col" className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold">
                      Commentary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {varianceCommentary.map((row) => (
                    <tr key={row.id} className="align-top odd:bg-white even:bg-slate-50/45">
                      <td className="border-b border-r border-slate-100 px-2 py-1.5 font-medium text-slate-800">
                        {row.metric}
                      </td>
                      <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700">
                        {formatCurrency(row.planned, displayLocale, displayCurrency)}
                      </td>
                      <td className="border-b border-r border-slate-100 px-2 py-1.5 text-slate-700">
                        {formatCurrency(row.actual, displayLocale, displayCurrency)}
                      </td>
                      <td className="border-b border-r border-slate-100 px-2 py-1.5 font-medium">
                        <span
                          className={cn(
                            row.direction === 'favorable' && 'text-emerald-700',
                            row.direction === 'watch' && 'text-amber-700',
                            row.direction === 'adverse' && 'text-rose-700',
                          )}
                        >
                          {row.delta >= 0 ? '+' : ''}
                          {formatCurrency(row.delta, displayLocale, displayCurrency)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-slate-700">
                        {row.commentary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {sections.map((section, index) => (
          <section
            key={section.key}
            className={cn(
              'print-report-section mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm',
              index > 0 ? 'print-report-page-break' : '',
            )}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.label}</h2>
                <p className="mt-1 text-sm text-slate-600">{section.description}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                {detailIsTechnical ? <div>{section.queryName}</div> : null}
                <div>{formatNumber(estimateRows(section.data), displayLocale)} estimated rows</div>
              </div>
            </div>
            <ReportNode
              title={`${section.label} Workspace`}
              value={section.data}
              path={section.key}
              depth={0}
              locale={displayLocale}
              currency={displayCurrency}
            />
          </section>
        ))}

        <footer className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
          Printed from Financial Command Center. This report is generated from live app workspace queries at
          print time and may contain sensitive data.
        </footer>
      </div>
    </div>
  )
}

export function PrintReportDialog({
  displayCurrency,
  displayLocale,
  auditReadyMode = false,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: PrintReportDialogProps) {
  const defaultMode = REPORT_MODE_BY_KEY.executiveSummary
  const [internalOpen, setInternalOpen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [reportModeKey, setReportModeKey] = useState<ReportModeKey>('executiveSummary')
  const [reportAudienceKey, setReportAudienceKey] = useState<ReportAudienceKey>('self')
  const [reportThemeKey, setReportThemeKey] = useState<ReportThemeKey>('executiveCobalt')
  const [reportTitle, setReportTitle] = useState(defaultMode.title)
  const [subtitle, setSubtitle] = useState(defaultMode.subtitle)
  const [sectionsEnabled, setSectionsEnabled] = useState<SectionToggleState>(defaultMode.sections)
  const [reportPreparedAt, setReportPreparedAt] = useState<number>(() => Date.now())
  const printFallbackTimerRef = useRef<number | null>(null)

  const open = controlledOpen ?? internalOpen
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(next)
    }
    onOpenChange?.(next)
  }

  const reportMode = REPORT_MODE_BY_KEY[reportModeKey]
  const reportAudience = REPORT_AUDIENCE_BY_KEY[reportAudienceKey]
  const reportTheme = REPORT_THEME_BY_KEY[reportThemeKey]

  const applyReportModePreset = (modeKey: ReportModeKey, emitToast = false) => {
    const mode = REPORT_MODE_BY_KEY[modeKey]
    setReportModeKey(mode.key)
    setReportTitle(mode.title)
    setSubtitle(mode.subtitle)
    setSectionsEnabled({ ...mode.sections })
    if (emitToast) {
      toast.success(`${mode.label} preset applied`)
    }
  }

  const onDialogOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) return
    if (!auditReadyMode) return
    applyReportModePreset('auditPack')
    setReportAudienceKey('accountant')
    setReportThemeKey('graphiteLedger')
  }

  const shouldLoad = open || printing
  const dashboardData = useQuery(
    api.dashboard.getDashboard,
    shouldLoad && sectionsEnabled.dashboard
      ? {
          displayCurrency,
          locale: displayLocale,
        }
      : 'skip',
  )
  const coreFinanceData = useQuery(
    api.dashboard.getCoreFinanceEditorData,
    shouldLoad && sectionsEnabled.coreFinance ? {} : 'skip',
  )
  const transactionsData = useQuery(
    api.dashboard.getPhaseThreePurchaseWorkspace,
    shouldLoad && sectionsEnabled.transactions
      ? {
          displayCurrency,
          locale: displayLocale,
          limit: 300,
        }
      : 'skip',
  )
  const automationData = useQuery(
    api.automation.getPhaseFourAutomationWorkspace,
    shouldLoad && sectionsEnabled.automation
      ? {
          displayCurrency,
          locale: displayLocale,
        }
      : 'skip',
  )
  const planningData = useQuery(
    api.planning.getPhaseFivePlanningWorkspace,
    shouldLoad && sectionsEnabled.planning
      ? {
          displayCurrency,
          locale: displayLocale,
        }
      : 'skip',
  )
  const governanceData = useQuery(
    api.governance.getPhaseSixGovernanceWorkspace,
    shouldLoad && sectionsEnabled.governance
      ? {
          displayCurrency,
          locale: displayLocale,
          auditLimit: 2000,
        }
      : 'skip',
  )
  const reliabilityData = useQuery(
    api.reliability.getPhaseSevenReliabilityWorkspace,
    shouldLoad && sectionsEnabled.reliability
      ? {
          locale: displayLocale,
          telemetryLimit: 1000,
        }
      : 'skip',
  )

  const reportSections = useMemo<ReportSectionData[]>(() => {
    const sourceMap: Record<WorkspaceSectionKey, { data: unknown; queryName: string }> = {
      dashboard: {
        data: dashboardData,
        queryName: 'dashboard.getDashboard',
      },
      coreFinance: {
        data: coreFinanceData,
        queryName: 'dashboard.getCoreFinanceEditorData',
      },
      transactions: {
        data: transactionsData,
        queryName: 'dashboard.getPhaseThreePurchaseWorkspace',
      },
      automation: {
        data: automationData,
        queryName: 'automation.getPhaseFourAutomationWorkspace',
      },
      planning: {
        data: planningData,
        queryName: 'planning.getPhaseFivePlanningWorkspace',
      },
      governance: {
        data: governanceData,
        queryName: 'governance.getPhaseSixGovernanceWorkspace',
      },
      reliability: {
        data: reliabilityData,
        queryName: 'reliability.getPhaseSevenReliabilityWorkspace',
      },
    }

    return SECTION_DEFINITIONS.filter((section) => sectionsEnabled[section.key]).map((section) => ({
      key: section.key,
      label: section.label,
      description: section.description,
      queryName: sourceMap[section.key].queryName,
      data: sourceMap[section.key].data,
      loaded: sourceMap[section.key].data !== undefined,
    }))
  }, [
    automationData,
    coreFinanceData,
    dashboardData,
    governanceData,
    planningData,
    reliabilityData,
    sectionsEnabled,
    transactionsData,
  ])

  const loadingSections = reportSections.filter((section) => !section.loaded)
  const allLoaded = reportSections.length > 0 && loadingSections.length === 0

  const reportReadySections = useMemo(
    () => reportSections.filter((section) => section.loaded) as ReportSectionData[],
    [reportSections],
  )

  const keyDecisions = useMemo(
    () =>
      buildKeyDecisions({
        sections: reportReadySections,
        audience: reportAudience,
        locale: displayLocale,
        currency: displayCurrency,
      }),
    [displayCurrency, displayLocale, reportAudience, reportReadySections],
  )

  const varianceCommentary = useMemo(
    () =>
      buildVarianceCommentary({
        sections: reportReadySections,
        audience: reportAudience,
      }),
    [reportAudience, reportReadySections],
  )

  const varianceSummary = useMemo(
    () =>
      varianceSummaryLine(
        varianceCommentary,
        displayLocale,
        displayCurrency,
        reportAudience,
      ),
    [displayCurrency, displayLocale, reportAudience, varianceCommentary],
  )

  useEffect(() => {
    if (!printing) return

    document.body.classList.add('printing-report')

    const handleAfterPrint = () => {
      document.body.classList.remove('printing-report')
      if (printFallbackTimerRef.current != null) {
        window.clearTimeout(printFallbackTimerRef.current)
        printFallbackTimerRef.current = null
      }
      setPrinting(false)
      toast.success('Print dialog closed')
    }

    window.addEventListener('afterprint', handleAfterPrint)
    printFallbackTimerRef.current = window.setTimeout(() => {
      document.body.classList.remove('printing-report')
      setPrinting(false)
    }, 15000)

    const timer = window.setTimeout(() => {
      try {
        window.print()
      } catch {
        toast.error('Unable to open the print dialog')
        document.body.classList.remove('printing-report')
        setPrinting(false)
      }
    }, 120)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('afterprint', handleAfterPrint)
      if (printFallbackTimerRef.current != null) {
        window.clearTimeout(printFallbackTimerRef.current)
        printFallbackTimerRef.current = null
      }
      document.body.classList.remove('printing-report')
    }
  }, [printing])

  const onPrint = () => {
    if (reportSections.length === 0) {
      toast.error('Select at least one report section')
      return
    }
    if (!allLoaded) {
      toast.message(`Still loading ${loadingSections.length} section${loadingSections.length === 1 ? '' : 's'}…`)
      return
    }
    setReportPreparedAt(Date.now())
    toast.success('Preparing professional print layout…')
    setPrinting(true)
  }

  const toggleSection = (key: WorkspaceSectionKey) => {
    setSectionsEnabled((previous) => ({ ...previous, [key]: !previous[key] }))
  }

  const setAllSections = (enabled: boolean) => {
    setSectionsEnabled({
      dashboard: enabled,
      coreFinance: enabled,
      transactions: enabled,
      automation: enabled,
      planning: enabled,
      governance: enabled,
      reliability: enabled,
    })
  }

  const reportPortal =
    typeof document !== 'undefined' && reportReadySections.length > 0
      ? createPortal(
          <PrintReportDocument
            reportTitle={reportTitle.trim() || reportMode.title}
            subtitle={
              subtitle.trim() || reportMode.subtitle
            }
            reportPreparedAt={reportPreparedAt}
            displayCurrency={displayCurrency}
            displayLocale={displayLocale}
            reportMode={reportMode}
            audiencePreset={reportAudience}
            themeTemplate={reportTheme}
            keyDecisions={keyDecisions}
            varianceCommentary={varianceCommentary}
            varianceSummary={varianceSummary}
            sections={reportReadySections}
          />,
          document.body,
        )
      : null

  return (
    <>
      <Dialog open={open} onOpenChange={onDialogOpenChange}>
        {showTrigger ? (
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 border-border/70 bg-background/65">
              <Printer className="h-3.5 w-3.5" />
              Print report
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent className="h-[92dvh] max-h-[92dvh] w-[min(96vw,1100px)] max-w-[1100px] min-h-0 overflow-hidden border-border/70 bg-background/98 p-0 sm:max-w-[1100px]">
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto]">
            <DialogHeader className="shrink-0 border-b border-border/60 bg-gradient-to-r from-primary/8 via-sky-500/6 to-emerald-500/6 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4 text-left">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-lg tracking-tight">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    Professional Print Report
                  </DialogTitle>
                  <DialogDescription className="mt-1 max-w-3xl text-sm">
                    Build premium print-ready reports from live Convex workspace queries with report modes,
                    audience presets, variance commentary, and multi-page table headers.
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {auditReadyMode ? (
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      Audit-ready preset
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="border-border/70 bg-background/60">
                    {reportMode.label}
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/60">
                    {reportAudience.label} audience
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/60">
                    {reportTheme.label}
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/60">
                    {displayCurrency} display
                  </Badge>
                  <Badge variant="outline" className="border-border/70 bg-background/60">
                    {displayLocale}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 gap-0 lg:grid-cols-[0.95fr_1.05fr]">
              <ScrollArea className="h-full min-h-0 border-r border-border/60">
                <div className="space-y-5 p-6">
                  <Card className="finance-panel border-border/60 bg-card/40 shadow-none">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Settings2 className="h-4 w-4 text-primary" />
                        Report Setup
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                            <BookCheck className="h-3.5 w-3.5" />
                            Report Mode
                          </label>
                          <select
                            value={reportModeKey}
                            onChange={(event) => applyReportModePreset(event.target.value as ReportModeKey, true)}
                            className="h-9 w-full rounded-lg border border-border/70 bg-background/70 px-2.5 text-sm outline-none transition focus:border-border"
                          >
                            {REPORT_MODE_DEFINITIONS.map((mode) => (
                              <option key={mode.key} value={mode.key}>
                                {mode.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">{reportMode.description}</p>
                        </div>
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                            <Users className="h-3.5 w-3.5" />
                            Audience
                          </label>
                          <select
                            value={reportAudienceKey}
                            onChange={(event) => setReportAudienceKey(event.target.value as ReportAudienceKey)}
                            className="h-9 w-full rounded-lg border border-border/70 bg-background/70 px-2.5 text-sm outline-none transition focus:border-border"
                          >
                            {REPORT_AUDIENCE_DEFINITIONS.map((audience) => (
                              <option key={audience.key} value={audience.key}>
                                {audience.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">{reportAudience.description}</p>
                        </div>
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                            <Brush className="h-3.5 w-3.5" />
                            Theme Template
                          </label>
                          <select
                            value={reportThemeKey}
                            onChange={(event) => setReportThemeKey(event.target.value as ReportThemeKey)}
                            className="h-9 w-full rounded-lg border border-border/70 bg-background/70 px-2.5 text-sm outline-none transition focus:border-border"
                          >
                            {REPORT_THEME_DEFINITIONS.map((theme) => (
                              <option key={theme.key} value={theme.key}>
                                {theme.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">{reportTheme.description}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                          Report Title
                        </label>
                        <Input
                          value={reportTitle}
                          onChange={(event) => setReportTitle(event.target.value)}
                          className="bg-background/70"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                          Subtitle
                        </label>
                        <textarea
                          rows={3}
                          value={subtitle}
                          onChange={(event) => setSubtitle(event.target.value)}
                          className="w-full rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-border"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => applyReportModePreset(reportModeKey, true)}
                        >
                          Apply mode defaults
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllSections(true)}>
                          Select all
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllSections(false)}>
                          Clear all
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <div className="text-sm font-medium">Included App Sections</div>
                      <div className="space-y-2">
                        {SECTION_DEFINITIONS.map((section) => {
                          const enabled = sectionsEnabled[section.key]
                          const loading = reportSections.find((row) => row.key === section.key)?.loaded === false
                          const loaded = reportSections.find((row) => row.key === section.key)?.loaded === true

                          return (
                            <label
                              key={section.key}
                              className={cn(
                                'flex items-start gap-3 rounded-xl border px-3 py-3 transition',
                                enabled
                                  ? 'border-primary/25 bg-primary/6'
                                  : 'border-border/60 bg-background/45',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => toggleSection(section.key)}
                                className="mt-1 h-4 w-4 rounded border-border bg-background"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-medium">{section.label}</div>
                                  {enabled && loading ? (
                                    <Badge variant="outline" className="border-border/70 bg-background/60 text-[10px]">
                                      <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                                      Loading
                                    </Badge>
                                  ) : null}
                                  {enabled && loaded ? (
                                    <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-300">
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      Ready
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                  {section.description}
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>

              <ScrollArea className="h-full min-h-0">
                <div className="space-y-4 p-6">
                  <Card className="finance-panel border-border/60 bg-card/40 shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">Print Readiness</div>
                          <div className="text-xs text-muted-foreground">
                            Live Convex data is queried when this modal is open.
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'border-border/70 bg-background/60',
                            allLoaded && reportSections.length > 0 && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
                          )}
                        >
                          {reportSections.length === 0
                            ? 'No sections selected'
                            : allLoaded
                              ? 'Ready to print'
                              : `${loadingSections.length} loading`}
                        </Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                          <div className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Selected Sections</div>
                          <div className="mt-1 text-xl font-semibold tracking-tight">
                            {reportSections.length}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                          <div className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Estimated Rows</div>
                          <div className="mt-1 text-xl font-semibold tracking-tight">
                            {formatNumber(
                              reportReadySections.reduce((sum, section) => sum + estimateRows(section.data), 0),
                              displayLocale,
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <div className="text-sm font-medium">Included Data Snapshot</div>
                      {reportSections.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center text-sm text-muted-foreground">
                          Select one or more app sections to build the report.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {reportSections.map((section) => {
                            const rowEstimate = section.loaded ? estimateRows(section.data) : 0
                            const authSummary = section.loaded ? summarizeAuthState(section.data) : null
                            return (
                              <div
                                key={section.key}
                                className="rounded-xl border border-border/60 bg-background/45 px-3 py-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-medium">{section.label}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="border-border/70 bg-background/60 text-[10px]">
                                      {reportAudience.detailLevel === 'technical'
                                        ? section.queryName
                                        : 'Live workspace snapshot'}
                                    </Badge>
                                    <Badge variant="outline" className="border-border/70 bg-background/60 text-[10px]">
                                      {section.loaded ? `${formatNumber(rowEstimate, displayLocale)} rows` : 'Loading'}
                                    </Badge>
                                  </div>
                                </div>
                                {authSummary ? (
                                  <div className="mt-1 text-xs text-muted-foreground">{authSummary}</div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Narrative Preview</div>
                        <Badge variant="outline" className="border-border/70 bg-background/60 text-[10px]">
                          {reportAudience.detailLevel}
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                          <div className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Key Decisions</div>
                          <div className="mt-1 text-xl font-semibold tracking-tight">{keyDecisions.length}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                          <div className="text-xs tracking-[0.14em] text-muted-foreground uppercase">Variance Rows</div>
                          <div className="mt-1 text-xl font-semibold tracking-tight">{varianceCommentary.length}</div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {keyDecisions.slice(0, 2).map((decision) => (
                          <div
                            key={decision.id}
                            className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5"
                          >
                            <div className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                              {decision.priority} priority
                            </div>
                            <div className="mt-1 text-sm font-medium">{decision.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{decision.why}</div>
                          </div>
                        ))}
                        {keyDecisions.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-3 py-3 text-xs text-muted-foreground">
                            Decision commentary will appear once live workspace signal is available.
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-6 py-4" showCloseButton>
              <Button variant="outline" onClick={() => setReportPreparedAt(Date.now())}>
                Refresh timestamp
              </Button>
              <Button onClick={onPrint} disabled={printing || reportSections.length === 0 || !allLoaded}>
                {printing ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Opening print dialog…
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" />
                    Print {reportMode.label}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {reportPortal}
    </>
  )
}
