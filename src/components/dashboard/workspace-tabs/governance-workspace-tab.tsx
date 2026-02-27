import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileDown,
  LoaderCircle,
  Lock,
  Smartphone,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import type { WorkspaceTabKey } from '@/components/dashboard/dashboard-types'
import { appEnv } from '@/env'
import { cn } from '@/lib/utils'
import { useOfflineFormDraft, usePwaReliability } from '@/components/pwa/pwa-reliability-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PrintReportDialog } from '@/components/dashboard/reporting/print-report-dialog'
import { KpiWhyDialog } from '@/components/dashboard/kpi-why-dialog'

type ExportRequestRow = {
  id: string
  exportKind: string
  format: string
  scope: string
  status: string
  includeAuditTrail: boolean
  includeDeletedArtifacts: boolean
  note: string
  requestedAt: number
  updatedAt: number
  completedAt: number | null
  latestFilename: string
  latestExpiresAt: number | null
}

type ExportDownloadRow = {
  id: string
  exportId: string
  status: string
  filename: string
  format: string
  byteSize: number
  checksumSha256: string
  contentType: string
  expiresAt: number | null
  createdAt: number
  updatedAt: number
  downloadToken: string
  downloadUrlPath: string
  downloadCount: number
  lastDownloadedAt: number | null
}

type RetentionPolicyRow = {
  id: string
  policyKey: string
  retentionDays: number
  enabled: boolean
  updatedAt: number | null
  source: 'db' | 'default' | string
}

type DeletionJobRow = {
  id: string
  jobType: string
  scope: string
  targetEntityType: string
  targetEntityId: string
  status: string
  dryRun: boolean
  reason: string
  requestedAt: number | null
  scheduledAt: number | null
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
  note: string
}

type AccountErasureSummary = {
  ok: boolean
  dryRun: boolean
  userId: string
  ownerKey: string
  confirmationRequiredPhrase: string
  candidates: {
    totalRows: number
    storageFiles: number
    byUserTable: Record<string, number>
    byOwnerKeyTable: Record<string, number>
  }
  deleted: {
    totalRows: number
    storageFiles: number
    byUserTable: Record<string, number>
    byOwnerKeyTable: Record<string, number>
  }
  touchedTables: string[]
  note: string
}

type ConsentSettingsRow = {
  id: string | null
  analyticsEnabled: boolean
  diagnosticsEnabled: boolean
  updatedAt: number | null
}

type ConsentLogRow = {
  id: string
  consentType: string
  enabled: boolean
  version: string
  reason: string
  createdAt: number
}

type AuditRow = {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: number
  userId: string
  source: string
  metadataJson: string
  beforeJson: string
  afterJson: string
  metadataSummary: string
  beforeSummary: string
  afterSummary: string
}

type NumberChangeTimelineRow = {
  id: string
  title: string
  detail: string
  at: number
  tone: 'positive' | 'neutral' | 'warning'
}

type SecurityTrustControl = {
  id: string
  title: string
  description: string
  status: string
  tone: 'positive' | 'neutral' | 'warning'
  icon: typeof ShieldCheck
}

type GovernanceWorkspaceData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  displayCurrency: string
  baseCurrency: string
  locale: string
  fxPolicy: {
    displayCurrency: string
    baseCurrency: string
    fxAsOfMs: number | null
    fxSources: string[]
    syntheticRates: boolean
  }
  exportsCenter: {
    requests: ExportRequestRow[]
    downloads: ExportDownloadRow[]
    stats: {
      totalRequests: number
      pendingRequests: number
      readyDownloads: number
      lastRequestAt: number | null
    }
  }
  privacy: {
    consentSettings: ConsentSettingsRow
    consentLogs: ConsentLogRow[]
    stats: {
      totalLogs: number
      analyticsEnabled: boolean
      diagnosticsEnabled: boolean
      lastConsentChangeAt: number | null
    }
  }
  retention: {
    retentionPolicies: RetentionPolicyRow[]
    deletionJobs: DeletionJobRow[]
    stats: {
      policyCount: number
      enabledPolicyCount: number
      openDeletionJobs: number
      lastDeletionJobAt: number | null
    }
  }
  auditTrail: {
    rows: AuditRow[]
    stats: {
      totalRows: number
      unfilteredTotalRows?: number
      lastEventAt: number | null
    }
    filterOptions: {
      entityTypes: string[]
      actions: string[]
    }
    appliedFilters?: {
      auditFrom: number | null
      auditTo: number | null
      auditAction: string | null
      auditEntityType: string | null
      auditSearch: string
      auditLimit: number
    }
  }
}

type RetentionDraftMap = Record<string, { retentionDays: string; enabled: boolean }>

type ExportRequestDraft = {
  exportKind: string
  format: string
  scope: string
  includeAuditTrail: boolean
  includeDeletedArtifacts: boolean
  note: string
}

type DeletionJobDraft = {
  jobType: string
  scope: string
  targetEntityType: string
  targetEntityId: string
  dryRun: boolean
  scheduledAtLocal: string
  reason: string
}

function emptyExportRequestDraft(): ExportRequestDraft {
  return {
    exportKind: 'full_account',
    format: 'json',
    scope: 'full_account',
    includeAuditTrail: true,
    includeDeletedArtifacts: false,
    note: '',
  }
}

function emptyDeletionJobDraft(): DeletionJobDraft {
  return {
    jobType: 'account_erasure',
    scope: 'account',
    targetEntityType: '',
    targetEntityId: '',
    dryRun: true,
    scheduledAtLocal: localDateTimeInputValue(Date.now() + 15 * 60 * 1000),
    reason: '',
  }
}

function localDateTimeInputValue(timestampMs: number) {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function parseLocalDateTimeInput(value: string) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseAuditDateInputStart(value: string) {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00`)
  const timestamp = parsed.getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function parseAuditDateInputEnd(value: string) {
  if (!value) return undefined
  const parsed = new Date(`${value}T23:59:59.999`)
  const timestamp = parsed.getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function formatTimestamp(value: number | null | undefined) {
  if (!value) return 'Not set'
  try {
    return format(new Date(value), 'dd MMM yyyy, HH:mm')
  } catch {
    return 'Invalid date'
  }
}

function formatRelativeTimestamp(value: number | null | undefined) {
  if (!value) return null
  try {
    return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
  } catch {
    return null
  }
}

function formatBytes(value: number) {
  const bytes = Math.max(0, Math.trunc(value))
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function humanizeToken(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const ACCOUNT_ERASURE_CONFIRMATION_FALLBACK = 'DELETE ALL MY DATA'

function sumRecordValues(record: Record<string, number> | undefined) {
  if (!record) return 0
  return Object.values(record).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

function topDeletionTables(record: Record<string, number> | undefined, limit = 8) {
  if (!record) return []
  return Object.entries(record)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Unexpected error'
}

function parsePositiveInt(value: string, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.trunc(numeric))
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'ready' || normalized === 'completed') return 'default'
  if (normalized === 'failed' || normalized === 'cancelled') return 'destructive'
  if (normalized === 'running' || normalized === 'processing') return 'secondary'
  return 'outline'
}

function booleanBadgeClasses(value: boolean) {
  return value
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-border bg-background/70 text-muted-foreground'
}

function policyLabel(policyKey: string) {
  const labels: Record<string, string> = {
    exports: 'Exports',
    deletion_jobs: 'Deletion Jobs',
    consent_logs: 'Consent Logs',
    finance_audit_events: 'Audit Trail',
    cycle_audit_ledger: 'Cycle Audit Ledger',
    client_ops_metrics: 'Client Ops Metrics',
  }
  return labels[policyKey] ?? humanizeToken(policyKey)
}

function normalizeAuditTimelineRow(row: AuditRow): NumberChangeTimelineRow | null {
  const action = row.action.toLowerCase()
  const entityType = row.entityType.toLowerCase()

  if (action.includes('phase3_purchase_post') || entityType.includes('purchase') || entityType.includes('ledger')) {
    return {
      id: row.id,
      title: 'Posted transaction',
      detail: row.entityId ? `Ledger/purchase record ${row.entityId}` : 'Ledger posting',
      at: row.createdAt,
      tone: 'positive' as const,
    }
  }

  if (entityType === 'bill' && (action.includes('update') || action.includes('phase1'))) {
    return {
      id: row.id,
      title: 'Bill due moved or updated',
      detail: row.entityId ? `Bill ${row.entityId} was edited` : 'Bill schedule updated',
      at: row.createdAt,
      tone: 'warning' as const,
    }
  }

  if (
    entityType.includes('planning') ||
    entityType.includes('personal_finance_state') ||
    action.includes('phase5_entity_update')
  ) {
    return {
      id: row.id,
      title: 'Plan edited',
      detail: row.entityType ? humanizeToken(row.entityType) : 'Planning entity changed',
      at: row.createdAt,
      tone: 'neutral' as const,
    }
  }

  if (action.includes('set_preferences') || action.includes('phase4') || action.includes('phase6')) {
    return {
      id: row.id,
      title: humanizeToken(row.action),
      detail: row.entityType ? humanizeToken(row.entityType) : 'Governance update',
      at: row.createdAt,
      tone: 'neutral' as const,
    }
  }

  return null
}

function JsonPreview({
  title,
  json,
}: {
  title: string
  json: string
}) {
  if (!json) return null
  return (
    <details className="rounded-lg border border-border/60 bg-background/40">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
        {title}
      </summary>
      <pre className="max-h-48 overflow-auto px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap text-foreground/85">
        {json}
      </pre>
    </details>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  why,
}: {
  icon: typeof ShieldCheck
  label: string
  value: string
  hint?: string | null
  why?: {
    explanation: string
    includes?: string[]
    excludes?: string[]
    confidence?: string
  }
}) {
  const resolvedWhy = why ?? defaultGovernanceMetricWhy(label)
  return (
    <Card className="finance-panel border-border/50 bg-card/40 shadow-none">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
          <p className="text-xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          <KpiWhyDialog
            kpi={label}
            explanation={resolvedWhy.explanation}
            includes={resolvedWhy.includes}
            excludes={resolvedWhy.excludes}
            confidence={resolvedWhy.confidence}
          />
        </div>
        <div className="rounded-xl border border-border/70 bg-background/60 p-2.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardContent>
    </Card>
  )
}

function defaultGovernanceMetricWhy(label: string) {
  const key = label.toLowerCase()
  if (key.includes('export')) {
    return {
      explanation: 'Counts export requests created in your workspace for reporting or privacy fulfillment.',
      includes: ['Queued requests', 'Completed requests', 'Cancelled requests'],
      excludes: ['Externally generated files not tied to userExports'],
      confidence: 'Source: live Convex userExports table',
    }
  }
  if (key.includes('download')) {
    return {
      explanation: 'Ready downloads reflect generated export artifacts available within retention windows.',
      includes: ['Downloads with status ready', 'Signed-link eligible artifacts'],
      excludes: ['Expired artifacts', 'Deleted artifacts'],
      confidence: 'Source: live Convex userExportDownloads table',
    }
  }
  if (key.includes('consent')) {
    return {
      explanation: 'Consent logs count recorded privacy preference changes with versioned reasons.',
      includes: ['Analytics consent changes', 'Diagnostics consent changes'],
      excludes: ['Current state without a change log row'],
      confidence: 'Source: live Convex consentLogs table',
    }
  }
  if (key.includes('deletion')) {
    return {
      explanation: 'Deletion jobs show currently open retention/deletion workflows.',
      includes: ['Requested', 'Scheduled', 'Running jobs'],
      excludes: ['Completed/failed historical rows'],
      confidence: 'Source: live Convex deletionJobs table',
    }
  }
  return {
    explanation: 'Governance KPI from live Convex compliance tables.',
    confidence: 'Source: Convex governance workspace',
  }
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/55 px-3 py-3">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn('text-xs', checked ? 'text-emerald-300' : 'text-muted-foreground')}>
          {checked ? 'On' : 'Off'}
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-border bg-background"
        />
      </div>
    </label>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: React.HTMLInputTypeAttribute
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="bg-background/60"
      />
    </div>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-border"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labels?: Record<string, string>
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-border/70 bg-background/60 px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option || '__empty'} value={option}>
            {labels?.[option] ?? humanizeToken(option || 'none')}
          </option>
        ))}
      </select>
    </div>
  )
}

export function GovernanceWorkspaceTab({
  displayCurrency,
  displayLocale,
  auditReadyMode = false,
  onAuditReadyModeChange,
  thumbMode = false,
  onNavigateTab,
}: {
  displayCurrency: string
  displayLocale: string
  auditReadyMode?: boolean
  onAuditReadyModeChange?: (enabled: boolean) => void
  thumbMode?: boolean
  onNavigateTab?: (tab: WorkspaceTabKey) => void
}) {
  const { isOnline, enqueueIntent, trackEvent } = usePwaReliability()
  const [exportDraft, setExportDraft, resetExportDraft] = useOfflineFormDraft<ExportRequestDraft>(
    'governance.export_request',
    emptyExportRequestDraft,
  )
  const [deletionDraft, setDeletionDraft, resetDeletionDraft] = useOfflineFormDraft<DeletionJobDraft>(
    'governance.deletion_job_request',
    emptyDeletionJobDraft,
  )
  const [retentionDrafts, setRetentionDrafts] = useState<RetentionDraftMap>({})
  const [privacyAnalyticsEnabled, setPrivacyAnalyticsEnabled] = useState(false)
  const [privacyDiagnosticsEnabled, setPrivacyDiagnosticsEnabled] = useState(false)
  const [privacyVersion, setPrivacyVersion] = useState('v2')
  const [privacyReason, setPrivacyReason] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('all')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditLimit, setAuditLimit] = useState('300')
  const [runRetentionDryRun, setRunRetentionDryRun] = useState(true)
  const [activeTab, setActiveTab] = useState<'exports' | 'privacy' | 'retention' | 'audit' | 'security'>(
    auditReadyMode ? 'audit' : 'exports',
  )
  const [showAccountErasureDialog, setShowAccountErasureDialog] = useState(false)
  const [accountErasureConfirmationText, setAccountErasureConfirmationText] = useState('')
  const [accountErasurePreview, setAccountErasurePreview] = useState<AccountErasureSummary | null>(null)

  const [submittingExport, setSubmittingExport] = useState(false)
  const [busyExportRequestId, setBusyExportRequestId] = useState<string | null>(null)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null)
  const [creatingDeletionJob, setCreatingDeletionJob] = useState(false)
  const [busyDeletionJobId, setBusyDeletionJobId] = useState<string | null>(null)
  const [runningRetentionSweep, setRunningRetentionSweep] = useState(false)
  const [previewingAccountErasure, setPreviewingAccountErasure] = useState(false)
  const [runningAccountErasure, setRunningAccountErasure] = useState(false)

  const deferredAuditSearch = useDeferredValue(auditSearch)
  const deferredAuditDateFrom = useDeferredValue(auditDateFrom)
  const deferredAuditDateTo = useDeferredValue(auditDateTo)
  const resolvedAuditLimit = Math.max(50, Math.min(2000, Number(auditLimit) || 300))

  useEffect(() => {
    if (!auditReadyMode) return
    setActiveTab('audit')
    setAuditActionFilter('all')
    setAuditEntityTypeFilter('all')
    if (!auditDateFrom) {
      const since = new Date()
      since.setDate(since.getDate() - 90)
      setAuditDateFrom(format(since, 'yyyy-MM-dd'))
    }
    if (auditLimit !== '500') {
      setAuditLimit('500')
    }
  }, [auditReadyMode, auditDateFrom, auditLimit])

  // Phase 6 module can exist before local codegen refresh in some environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = useQuery((api as any).governance.getPhaseSixGovernanceWorkspace, {
    displayCurrency,
    locale: displayLocale,
    auditLimit: resolvedAuditLimit,
    auditFrom: parseAuditDateInputStart(deferredAuditDateFrom),
    auditTo: parseAuditDateInputEnd(deferredAuditDateTo),
    auditAction: auditActionFilter !== 'all' ? auditActionFilter : undefined,
    auditEntityType: auditEntityTypeFilter !== 'all' ? auditEntityTypeFilter : undefined,
    auditSearch: deferredAuditSearch.trim() || undefined,
  }) as GovernanceWorkspaceData | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestUserExport = useMutation((api as any).governance.requestUserExport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateExportArtifact = useAction((api as any).governance.generateExportArtifact)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateExportRequestStatus = useMutation((api as any).governance.updateExportRequestStatus)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertRetentionPolicy = useMutation((api as any).governance.upsertRetentionPolicy)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runRetentionCleanupNow = useMutation((api as any).governance.runRetentionCleanupNow)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestDeletionJob = useMutation((api as any).governance.requestDeletionJob)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateDeletionJobStatus = useMutation((api as any).governance.updateDeletionJobStatus)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runAccountDataErasureNow = useMutation((api as any).governance.runAccountDataErasureNow)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateConsentSettings = useMutation((api as any).governance.updateConsentSettings)
  const consentSettings = workspace?.privacy.consentSettings
  const retentionPolicies = workspace?.retention.retentionPolicies

  useEffect(() => {
    if (!consentSettings) return
    setPrivacyAnalyticsEnabled(consentSettings.analyticsEnabled)
    setPrivacyDiagnosticsEnabled(consentSettings.diagnosticsEnabled)
  }, [consentSettings])

  useEffect(() => {
    if (!retentionPolicies) return
    setRetentionDrafts(
      Object.fromEntries(
        retentionPolicies.map((row) => [
          row.id,
          {
            retentionDays: String(row.retentionDays),
            enabled: row.enabled,
          },
        ]),
      ),
    )
  }, [retentionPolicies])

  const filteredAuditRows = useMemo(() => workspace?.auditTrail.rows ?? [], [workspace?.auditTrail.rows])
  const numberChangeTimelineRows = useMemo(
    () =>
      filteredAuditRows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((row) => normalizeAuditTimelineRow(row))
        .filter((row): row is NumberChangeTimelineRow => Boolean(row))
        .slice(0, 16),
    [filteredAuditRows],
  )
  const plainEnglishSummaries = useMemo(() => {
    if (!workspace) return []
    const retentionWindowDays =
      workspace.retention.retentionPolicies
        .filter((row) => row.enabled)
        .sort((a, b) => a.retentionDays - b.retentionDays)[0]?.retentionDays ?? null
    const analyticsState = workspace.privacy.stats.analyticsEnabled ? 'enabled' : 'disabled'
    const diagnosticsState = workspace.privacy.stats.diagnosticsEnabled ? 'enabled' : 'disabled'
    return [
      `Your export center currently has ${workspace.exportsCenter.stats.totalRequests} request${workspace.exportsCenter.stats.totalRequests === 1 ? '' : 's'} and ${workspace.exportsCenter.stats.readyDownloads} ready download${workspace.exportsCenter.stats.readyDownloads === 1 ? '' : 's'}.`,
      `Privacy telemetry is ${analyticsState} for analytics and ${diagnosticsState} for diagnostics.`,
      retentionWindowDays
        ? `Shortest active retention window is ${retentionWindowDays} days before cleanup rules apply.`
        : 'No active retention policy is currently configured.',
      `Audit trail currently contains ${workspace.auditTrail.stats.unfilteredTotalRows ?? workspace.auditTrail.stats.totalRows} event rows for this account.`,
    ]
  }, [workspace])
  const securityTrustControls = useMemo<SecurityTrustControl[]>(() => {
    const auditEventCount =
      workspace?.auditTrail.stats.unfilteredTotalRows ??
      workspace?.auditTrail.stats.totalRows ??
      0
    const hasWarningTimelineEvent = numberChangeTimelineRows.some((row) => row.tone === 'warning')
    const secureTransport =
      typeof window === 'undefined' ? true : window.location.protocol === 'https:'

    return [
      {
        id: 'tls_hsts',
        title: 'TLS 1.3 + HSTS in transit',
        description:
          'HTTPS transport is enforced with strict browser transport policies and secure header baselines.',
        status: secureTransport ? 'Active on HTTPS origin' : 'Needs HTTPS origin',
        tone: secureTransport ? 'positive' : 'warning',
        icon: Lock,
      },
      {
        id: 'aes_kms',
        title: 'AES-256 at rest + KMS managed keys',
        description:
          'Database, backups, and storage encryption are platform-managed with managed key controls.',
        status: 'Platform-managed controls',
        tone: 'positive',
        icon: ShieldCheck,
      },
      {
        id: 'rotation_logging',
        title: 'Key rotation + access logging',
        description:
          'Rotation and key access observability are covered by infrastructure controls and provider audit logs.',
        status: auditEventCount > 0 ? 'Audit evidence available' : 'Awaiting events',
        tone: auditEventCount > 0 ? 'positive' : 'neutral',
        icon: BookOpenCheck,
      },
      {
        id: 'auth_hardening',
        title: 'Passkeys/WebAuthn + MFA + suspicious-login controls',
        description:
          'Authentication hardening is managed through Clerk policies and applies to all signed-in sessions.',
        status: workspace?.viewerAuthenticated ? 'Clerk auth active' : 'Sign in required',
        tone: workspace?.viewerAuthenticated ? 'positive' : 'warning',
        icon: Smartphone,
      },
      {
        id: 'audit_anomaly',
        title: 'Immutable audit trail + anomaly alerts',
        description:
          'Financial mutations are logged, and warning events surface operational anomalies in timeline views.',
        status:
          auditEventCount > 0
            ? `${auditEventCount} audit event${auditEventCount === 1 ? '' : 's'} tracked`
            : 'No audit events yet',
        tone: hasWarningTimelineEvent ? 'warning' : auditEventCount > 0 ? 'positive' : 'neutral',
        icon: AlertTriangle,
      },
      {
        id: 'sdlc',
        title: 'Pen tests + dependency scanning + secure SDLC',
        description:
          'Use routine pen tests and automated package/type/lint checks before deployment to production.',
        status: 'Built-in operational checklist',
        tone: 'neutral',
        icon: CheckCircle2,
      },
      {
        id: 'compliance_path',
        title: 'Compliance path: SOC 2 Type II -> PCI DSS if needed',
        description:
          'SOC 2 Type II is the primary baseline; PCI DSS scope only applies if cardholder data is directly handled.',
        status: 'Roadmap + governance ready',
        tone: 'neutral',
        icon: ShieldCheck,
      },
    ]
  }, [numberChangeTimelineRows, workspace])
  const accountErasureRequiredPhrase =
    accountErasurePreview?.confirmationRequiredPhrase ?? ACCOUNT_ERASURE_CONFIRMATION_FALLBACK
  const canConfirmAccountErasure =
    accountErasureConfirmationText.trim() === accountErasureRequiredPhrase

  const onRequestExport = async () => {
    const payload = {
      exportKind: exportDraft.exportKind,
      format: exportDraft.format,
      scope: exportDraft.scope,
      includeAuditTrail: exportDraft.includeAuditTrail,
      includeDeletedArtifacts: exportDraft.includeDeletedArtifacts,
      note: exportDraft.note.trim() || undefined,
    }

    if (!isOnline) {
      enqueueIntent('governance.requestUserExport', payload, {
        label: 'Export request',
        formDraftKey: 'governance.export_request',
        clearDraftOnSuccess: true,
      })
      trackEvent({
        category: 'offline_queue',
        eventType: 'governance_export_queued_offline',
        feature: 'governance_exports',
        status: 'queued',
      })
      toast.success('Export request queued for reconnect sync')
      const preservedFormat = exportDraft.format
      resetExportDraft()
      setExportDraft((previous) => ({ ...previous, format: preservedFormat }))
      return
    }

    setSubmittingExport(true)
    try {
      await requestUserExport(payload)
      toast.success('Export request queued')
      const preservedFormat = exportDraft.format
      resetExportDraft()
      setExportDraft((previous) => ({ ...previous, format: preservedFormat }))
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setSubmittingExport(false)
    }
  }

  const onGenerateExportArtifact = async (requestId: string) => {
    setBusyExportRequestId(requestId)
    try {
      const result = await generateExportArtifact({ requestId })
      const filename =
        typeof result === 'object' &&
        result !== null &&
        'filename' in result &&
        typeof result.filename === 'string'
          ? result.filename
          : 'export file'
      toast.success(`Export ready: ${filename}`)
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setBusyExportRequestId(null)
    }
  }

  const onRunRetentionCleanupNow = async () => {
    setRunningRetentionSweep(true)
    try {
      const result = await runRetentionCleanupNow({ dryRun: runRetentionDryRun })
      const deletedTotal =
        typeof result === 'object' &&
        result !== null &&
        'deleted' in result &&
        typeof result.deleted === 'object' &&
        result.deleted !== null
          ? Object.values(result.deleted as Record<string, unknown>).reduce<number>(
              (sum, value) => sum + (typeof value === 'number' ? value : 0),
              0,
            )
          : 0
      const candidatesTotal =
        typeof result === 'object' &&
        result !== null &&
        'candidates' in result &&
        typeof result.candidates === 'object' &&
        result.candidates !== null
          ? Object.values(result.candidates as Record<string, unknown>).reduce<number>(
              (sum, value) => sum + (typeof value === 'number' ? value : 0),
              0,
            )
          : 0
      toast.success(
        runRetentionDryRun
          ? `Retention dry run complete (${candidatesTotal} candidates)`
          : `Retention cleanup complete (${deletedTotal} deletions)`,
      )
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setRunningRetentionSweep(false)
    }
  }

  const onPreviewAccountErasure = async () => {
    setPreviewingAccountErasure(true)
    try {
      const result = (await runAccountDataErasureNow({ dryRun: true })) as AccountErasureSummary
      setAccountErasurePreview(result)
      toast.success(
        `Deletion preview ready (${result.candidates.totalRows} rows, ${result.candidates.storageFiles} files)`,
      )
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setPreviewingAccountErasure(false)
    }
  }

  const onExecuteAccountErasure = async () => {
    setRunningAccountErasure(true)
    try {
      const result = (await runAccountDataErasureNow({
        dryRun: false,
        confirmationText: accountErasureConfirmationText,
      })) as AccountErasureSummary

      setAccountErasurePreview(result)
      setShowAccountErasureDialog(false)
      setAccountErasureConfirmationText('')

      toast.success(
        `Deleted ${result.deleted.totalRows} rows and ${result.deleted.storageFiles} storage files`,
      )
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setRunningAccountErasure(false)
    }
  }

  const onUpdateExportStatus = async (requestId: string, status: string) => {
    setBusyExportRequestId(requestId)
    try {
      await updateExportRequestStatus({ requestId, status })
      toast.success(`Export request ${humanizeToken(status)}`)
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setBusyExportRequestId(null)
    }
  }

  const onSaveRetentionPolicy = async (policy: RetentionPolicyRow) => {
    const draft = retentionDrafts[policy.id]
    const payload = {
      id: policy.source === 'db' ? policy.id : undefined,
      policyKey: policy.policyKey,
      retentionDays: parsePositiveInt(
        draft?.retentionDays ?? String(policy.retentionDays),
        policy.retentionDays,
      ),
      enabled: draft?.enabled ?? policy.enabled,
    }

    if (!isOnline) {
      enqueueIntent('governance.upsertRetentionPolicy', payload, {
        label: `${policyLabel(policy.policyKey)} retention policy`,
      })
      toast.success(`${policyLabel(policy.policyKey)} policy queued for reconnect sync`)
      return
    }

    setSavingPolicyId(policy.id)
    try {
      await upsertRetentionPolicy(payload)
      toast.success(`${policyLabel(policy.policyKey)} policy saved`)
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setSavingPolicyId(null)
    }
  }

  const onSavePrivacySettings = async () => {
    const payload = {
      analyticsEnabled: privacyAnalyticsEnabled,
      diagnosticsEnabled: privacyDiagnosticsEnabled,
      version: privacyVersion.trim() || undefined,
      reason: privacyReason.trim() || undefined,
    }

    if (!isOnline) {
      enqueueIntent('governance.updateConsentSettings', payload, {
        label: 'Privacy consent settings',
      })
      toast.success('Privacy settings queued for reconnect sync')
      return
    }

    setSavingPrivacy(true)
    try {
      const result = await updateConsentSettings(payload)
      const changedConsentCount =
        typeof result === 'object' &&
        result !== null &&
        'changedConsentCount' in result &&
        typeof result.changedConsentCount === 'number'
          ? result.changedConsentCount
          : 0
      toast.success(
        changedConsentCount > 0
          ? `Privacy settings saved (${changedConsentCount} consent log${changedConsentCount === 1 ? '' : 's'})`
          : 'Privacy settings saved (no changes detected)',
      )
      setPrivacyReason('')
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setSavingPrivacy(false)
    }
  }

  const onRequestDeletionJob = async () => {
    const payload = {
      jobType: deletionDraft.jobType,
      scope: deletionDraft.scope,
      targetEntityType: deletionDraft.targetEntityType.trim() || undefined,
      targetEntityId: deletionDraft.targetEntityId.trim() || undefined,
      scheduledAt: parseLocalDateTimeInput(deletionDraft.scheduledAtLocal),
      dryRun: deletionDraft.dryRun,
      reason: deletionDraft.reason.trim() || undefined,
    }

    if (!isOnline) {
      enqueueIntent('governance.requestDeletionJob', payload, {
        label: deletionDraft.dryRun ? 'Deletion dry-run job' : 'Deletion job',
        formDraftKey: 'governance.deletion_job_request',
        clearDraftOnSuccess: true,
      })
      toast.success(
        deletionDraft.dryRun
          ? 'Dry-run deletion job queued for reconnect sync'
          : 'Deletion job queued for reconnect sync',
      )
      resetDeletionDraft()
      return
    }

    setCreatingDeletionJob(true)
    try {
      await requestDeletionJob(payload)
      toast.success(deletionDraft.dryRun ? 'Dry-run deletion job requested' : 'Deletion job requested')
      resetDeletionDraft()
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setCreatingDeletionJob(false)
    }
  }

  const onUpdateDeletionStatus = async (jobId: string, status: string) => {
    setBusyDeletionJobId(jobId)
    try {
      await updateDeletionJobStatus({ jobId, status })
      toast.success(`Deletion job ${humanizeToken(status)}`)
    } catch (error) {
      toast.error(safeErrorMessage(error))
    } finally {
      setBusyDeletionJobId(null)
    }
  }

  if (workspace === undefined) {
    return (
      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading governance workspace…
        </CardContent>
      </Card>
    )
  }

  if (!workspace.viewerAuthenticated) {
    return (
      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Governance Center
          </CardTitle>
          <CardDescription>
            Sign in to access exports, privacy controls, retention policies, and audit history.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {thumbMode ? (
        <Card className="finance-panel border-primary/30 bg-primary/8 shadow-none">
          <CardHeader className="gap-2 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Thumb actions</CardTitle>
              <Badge variant="outline" className="border-primary/30 bg-primary/12 text-primary">
                <Smartphone className="h-3.5 w-3.5" />
                Governance
              </Badge>
            </div>
            <CardDescription>Quick controls for exports, privacy, retention, and audit views.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button size="sm" variant="outline" onClick={() => setActiveTab('exports')}>
              <Download className="h-4 w-4" />
              Exports
            </Button>
            <Button size="sm" variant="outline" onClick={() => setActiveTab('privacy')}>
              <Lock className="h-4 w-4" />
              Privacy
            </Button>
            <Button size="sm" variant="outline" onClick={() => setActiveTab('retention')}>
              <Trash2 className="h-4 w-4" />
              Retention
            </Button>
            <Button size="sm" variant="outline" onClick={() => setActiveTab('audit')}>
              <BookOpenCheck className="h-4 w-4" />
              Audit
            </Button>
            {onNavigateTab ? (
              <Button size="sm" variant="outline" onClick={() => onNavigateTab('reliability')}>
                <ShieldCheck className="h-4 w-4" />
                Reliability
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="finance-panel overflow-hidden border-border/60 bg-card/35 shadow-none">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-primary/10 via-sky-500/8 to-emerald-500/10" />
        <CardHeader className="relative gap-3 max-md:[&_[data-slot=card-action]]:col-start-1 max-md:[&_[data-slot=card-action]]:row-start-3 max-md:[&_[data-slot=card-action]]:row-span-1 max-md:[&_[data-slot=card-action]]:justify-self-stretch">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                <ShieldCheck className="h-3 w-3" />
                Governance
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/60">
                {workspace.auditTrail.stats.totalRows} audit events loaded
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/60">
                {workspace.privacy.stats.totalLogs} consent log entries
              </Badge>
            </div>
            <CardTitle className="text-lg tracking-tight">Compliance, Privacy & Data Governance</CardTitle>
            <CardDescription>
              Manage user exports, privacy consent, retention policies, deletion workflows, and auditability from one operational workspace.
            </CardDescription>
          </div>
          <CardAction className="w-full md:w-auto">
            <div className="flex w-full flex-col gap-2 md:items-end">
              <div className="flex w-full flex-wrap gap-2 md:justify-end">
                <Button
                  variant={auditReadyMode ? 'default' : 'outline'}
                  size="sm"
                  className="h-8"
                  onClick={() => onAuditReadyModeChange?.(!auditReadyMode)}
                >
                  <BookOpenCheck className="h-3.5 w-3.5" />
                  {auditReadyMode ? 'Audit-ready on' : 'Enable audit-ready'}
                </Button>
                <PrintReportDialog
                  displayCurrency={displayCurrency}
                  displayLocale={displayLocale}
                  auditReadyMode={auditReadyMode}
                />
              </div>
              <div className="w-full rounded-xl border border-border/60 bg-background/45 px-3 py-2 text-left text-xs text-muted-foreground md:min-w-[15rem] md:text-right">
                <div className="tracking-[0.12em] uppercase">Viewer</div>
                <div className="mt-1 truncate font-mono text-[11px] text-foreground/80">
                  {workspace.viewerUserId}
                </div>
              </div>
            </div>
          </CardAction>
        </CardHeader>
      </Card>

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm">Plain-English Governance Summary</CardTitle>
          <CardDescription>
            Quick human-readable status for privacy, retention, export readiness, and auditability.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {plainEnglishSummaries.map((summary) => (
            <div
              key={summary}
              className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5 text-sm text-muted-foreground"
            >
              {summary}
            </div>
          ))}
          <div className="rounded-xl border border-primary/20 bg-primary/8 px-3 py-2.5 text-sm">
            <p className="font-medium">FX conversion policy</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Base {workspace.fxPolicy.baseCurrency} {'->'} Display {workspace.fxPolicy.displayCurrency}
              {' '}| FX as-of {formatTimestamp(workspace.fxPolicy.fxAsOfMs)} | Source{' '}
              {workspace.fxPolicy.fxSources.length ? workspace.fxPolicy.fxSources.join(', ') : 'unknown'}
              {workspace.fxPolicy.syntheticRates ? ' | mixed real + synthetic rates' : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FileDown}
          label="Export Requests"
          value={String(workspace.exportsCenter.stats.totalRequests)}
          hint={workspace.exportsCenter.stats.lastRequestAt ? `Last ${formatRelativeTimestamp(workspace.exportsCenter.stats.lastRequestAt)}` : 'No requests yet'}
        />
        <MetricCard
          icon={Download}
          label="Ready Downloads"
          value={String(workspace.exportsCenter.stats.readyDownloads)}
          hint={`${workspace.exportsCenter.stats.pendingRequests} pending / processing`}
        />
        <MetricCard
          icon={Lock}
          label="Consent Logs"
          value={String(workspace.privacy.stats.totalLogs)}
          hint={workspace.privacy.stats.lastConsentChangeAt ? `Last ${formatRelativeTimestamp(workspace.privacy.stats.lastConsentChangeAt)}` : 'No changes logged'}
        />
        <MetricCard
          icon={Trash2}
          label="Deletion Jobs"
          value={String(workspace.retention.stats.openDeletionJobs)}
          hint={`${workspace.retention.stats.enabledPolicyCount}/${workspace.retention.stats.policyCount} retention policies enabled`}
        />
      </div>

      <Card className="finance-panel border-border/60 bg-card/35 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm">Number change timeline</CardTitle>
          <CardDescription>
            Timeline of KPI-driving events like posted transactions, bill schedule edits, and planning updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {numberChangeTimelineRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/35 px-4 py-6 text-sm text-muted-foreground">
              No recent number-changing events were detected in the current audit window.
            </div>
          ) : (
            <div className="space-y-2">
              {numberChangeTimelineRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-border/60 bg-background/45 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex h-2 w-2 rounded-full',
                          row.tone === 'positive' && 'bg-emerald-400',
                          row.tone === 'warning' && 'bg-amber-300',
                          row.tone === 'neutral' && 'bg-sky-300',
                        )}
                      />
                      <p className="text-sm font-medium">{row.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(row.at)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'exports' | 'privacy' | 'retention' | 'audit' | 'security')}
        className="space-y-4"
      >
        <div className="finance-panel rounded-xl border border-border/60 bg-card/30 p-2">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="exports" className="rounded-lg border border-border/60 bg-card/20 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/30">
              Exports
            </TabsTrigger>
            <TabsTrigger value="privacy" className="rounded-lg border border-border/60 bg-card/20 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/30">
              Privacy
            </TabsTrigger>
            <TabsTrigger value="retention" className="rounded-lg border border-border/60 bg-card/20 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/30">
              Retention & Deletion
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg border border-border/60 bg-card/20 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/30">
              Audit Trail
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-lg border border-border/60 bg-card/20 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/30">
              Security Trust Pack
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="exports" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Request Data Export</CardTitle>
                <CardDescription>
                  Queue an export bundle for privacy requests, finance reporting, or audit review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <SelectField
                    label="Export Type"
                    value={exportDraft.exportKind}
                    onChange={(value) => setExportDraft((prev) => ({ ...prev, exportKind: value }))}
                    options={['full_account', 'transactions', 'ledger', 'audit', 'gdpr_bundle']}
                    labels={{
                      full_account: 'Full account',
                      transactions: 'Transactions',
                      ledger: 'Ledger',
                      audit: 'Audit trail',
                      gdpr_bundle: 'GDPR bundle',
                    }}
                  />
                  <SelectField
                    label="Format"
                    value={exportDraft.format}
                    onChange={(value) => setExportDraft((prev) => ({ ...prev, format: value }))}
                    options={['json', 'csv']}
                    labels={{ json: 'JSON', csv: 'CSV' }}
                  />
                  <SelectField
                    label="Scope"
                    value={exportDraft.scope}
                    onChange={(value) => setExportDraft((prev) => ({ ...prev, scope: value }))}
                    options={['full_account', 'finance_only', 'privacy_only', 'audit_only']}
                    labels={{
                      full_account: 'Full account',
                      finance_only: 'Finance only',
                      privacy_only: 'Privacy only',
                      audit_only: 'Audit only',
                    }}
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleField
                    label="Include audit trail"
                    description="Attach finance audit events to the export bundle."
                    checked={exportDraft.includeAuditTrail}
                    onChange={(value) => setExportDraft((prev) => ({ ...prev, includeAuditTrail: value }))}
                  />
                  <ToggleField
                    label="Include deleted artifacts"
                    description="Include soft-deleted metadata if available."
                    checked={exportDraft.includeDeletedArtifacts}
                    onChange={(value) => setExportDraft((prev) => ({ ...prev, includeDeletedArtifacts: value }))}
                  />
                </div>

                <LabeledTextarea
                  label="Operator Note"
                  value={exportDraft.note}
                  onChange={(value) => setExportDraft((prev) => ({ ...prev, note: value }))}
                  placeholder="Why this export is being requested (optional)"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">
                    Export files are generated server-side into Convex storage and served via a signed download URL.
                  </div>
                  <Button onClick={onRequestExport} disabled={submittingExport}>
                    {submittingExport ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Queuing…
                      </>
                    ) : (
                      <>
                        <FileDown className="h-4 w-4" />
                        Request export
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Download Inventory</CardTitle>
                <CardDescription>
                  Export artifacts available for download or review in the current retention window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {workspace.exportsCenter.downloads.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                    No export downloads yet.
                  </div>
                ) : (
                  <ScrollArea className="h-[22rem] pr-3">
                    <div className="space-y-2">
                      {workspace.exportsCenter.downloads.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border/60 bg-background/45 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="text-sm leading-snug font-medium break-all">{row.filename}</div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>{row.format.toUpperCase()}</span>
                                <span>{formatBytes(row.byteSize)}</span>
                                <span>{formatRelativeTimestamp(row.createdAt)}</span>
                                {row.downloadCount > 0 ? <span>{row.downloadCount} downloads</span> : null}
                              </div>
                            </div>
                            <Badge variant={statusBadgeVariant(row.status)}>{humanizeToken(row.status)}</Badge>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>Expires: {formatTimestamp(row.expiresAt)}</div>
                            <div className="break-all">Checksum: {row.checksumSha256 || '—'}</div>
                          </div>
                          {row.lastDownloadedAt ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Last downloaded {formatRelativeTimestamp(row.lastDownloadedAt)}
                            </div>
                          ) : null}
                          {row.downloadUrlPath && appEnv.convexSiteUrl ? (
                            <div className="mt-3">
                              <Button asChild size="sm" variant="outline" className="h-8">
                                <a
                                  href={`${appEnv.convexSiteUrl}${row.downloadUrlPath}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Download file
                                </a>
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-3 text-xs text-muted-foreground">
                              Configure <code>VITE_CONVEX_SITE_URL</code> to open signed download links from the app.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Export Requests</CardTitle>
              <CardDescription>
                Review queued export jobs, mark test artifacts ready, or cancel stale requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.exportsCenter.requests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  No export requests yet.
                </div>
              ) : (
                <>
                  <div className="space-y-3 xl:hidden">
                    {workspace.exportsCenter.requests.map((row) => {
                      const busy = busyExportRequestId === row.id
                      const canGenerate = row.status === 'requested' || row.status === 'processing'
                      const canCancel = row.status === 'requested' || row.status === 'processing'
                      return (
                        <div key={row.id} className="rounded-xl border border-border/60 bg-background/35 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">
                                {humanizeToken(row.exportKind)} • {row.format.toUpperCase()}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Scope: {humanizeToken(row.scope)}
                              </div>
                            </div>
                            <Badge variant={statusBadgeVariant(row.status)}>{humanizeToken(row.status)}</Badge>
                          </div>

                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
                              <div className="tracking-[0.12em] text-muted-foreground uppercase">Requested</div>
                              <div className="mt-1">{formatTimestamp(row.requestedAt)}</div>
                              <div className="text-muted-foreground">{formatRelativeTimestamp(row.requestedAt)}</div>
                            </div>
                            <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
                              <div className="tracking-[0.12em] text-muted-foreground uppercase">Output</div>
                              <div className="mt-1 leading-relaxed break-all">
                                {row.latestFilename || 'Pending file generation'}
                              </div>
                              <div className="text-muted-foreground">
                                {row.latestExpiresAt ? `Expires ${formatTimestamp(row.latestExpiresAt)}` : 'No expiry set'}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1">
                            {row.includeAuditTrail ? (
                              <Badge variant="outline" className="border-border/70 bg-background/55 text-[10px]">Audit</Badge>
                            ) : null}
                            {row.includeDeletedArtifacts ? (
                              <Badge variant="outline" className="border-border/70 bg-background/55 text-[10px]">Deleted artifacts</Badge>
                            ) : null}
                          </div>

                          {row.note ? (
                            <div className="mt-2 rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs text-muted-foreground break-words">
                              Note: {row.note}
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            {canGenerate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onGenerateExportArtifact(row.id)}
                                disabled={busy}
                                className="h-8"
                              >
                                {busy ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                Generate export
                              </Button>
                            ) : null}
                            {canCancel ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onUpdateExportStatus(row.id, 'cancelled')}
                                disabled={busy}
                                className="h-8"
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="hidden overflow-hidden rounded-xl border border-border/60 bg-background/30 xl:block">
                    <Table className="w-full table-fixed">
                      <TableHeader>
                        <TableRow className="bg-background/45">
                          <TableHead className="w-[22rem] px-3">Request</TableHead>
                          <TableHead className="w-[9rem] px-3">Status</TableHead>
                          <TableHead className="w-[12rem] px-3">Requested</TableHead>
                          <TableHead className="px-3">Output</TableHead>
                          <TableHead className="w-[13rem] px-3 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workspace.exportsCenter.requests.map((row) => {
                          const busy = busyExportRequestId === row.id
                          const canGenerate = row.status === 'requested' || row.status === 'processing'
                          const canCancel = row.status === 'requested' || row.status === 'processing'
                          return (
                            <TableRow key={row.id} className="hover:bg-background/35">
                              <TableCell className="px-3 py-3 align-top whitespace-normal">
                                <div className="space-y-1">
                                  <div className="text-sm font-medium">
                                    {humanizeToken(row.exportKind)} • {row.format.toUpperCase()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Scope: {humanizeToken(row.scope)}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {row.includeAuditTrail ? (
                                      <Badge variant="outline" className="border-border/70 bg-background/55 text-[10px]">Audit</Badge>
                                    ) : null}
                                    {row.includeDeletedArtifacts ? (
                                      <Badge variant="outline" className="border-border/70 bg-background/55 text-[10px]">Deleted artifacts</Badge>
                                    ) : null}
                                  </div>
                                  {row.note ? (
                                    <div className="max-w-[24rem] text-xs text-muted-foreground break-words">
                                      Note: {row.note}
                                    </div>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <Badge variant={statusBadgeVariant(row.status)}>{humanizeToken(row.status)}</Badge>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top whitespace-normal">
                                <div className="text-xs">{formatTimestamp(row.requestedAt)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatRelativeTimestamp(row.requestedAt)}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top whitespace-normal">
                                <div className="text-xs leading-relaxed break-all">
                                  {row.latestFilename || 'Pending file generation'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {row.latestExpiresAt
                                    ? `Expires ${formatTimestamp(row.latestExpiresAt)}`
                                    : 'No expiry set'}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top whitespace-normal">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {canGenerate ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onGenerateExportArtifact(row.id)}
                                      disabled={busy}
                                      className="h-8"
                                    >
                                      {busy ? (
                                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Download className="h-3.5 w-3.5" />
                                      )}
                                      Generate export
                                    </Button>
                                  ) : null}
                                  {canCancel ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => onUpdateExportStatus(row.id, 'cancelled')}
                                      disabled={busy}
                                      className="h-8"
                                    >
                                      Cancel
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Consent Settings</CardTitle>
                <CardDescription>
                  Store user privacy preferences and append immutable consent log entries for changes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ToggleField
                  label="Analytics collection"
                  description="Allow analytics events used for product insights and usage reporting."
                  checked={privacyAnalyticsEnabled}
                  onChange={setPrivacyAnalyticsEnabled}
                />
                <ToggleField
                  label="Diagnostics collection"
                  description="Allow operational diagnostics and client troubleshooting metadata."
                  checked={privacyDiagnosticsEnabled}
                  onChange={setPrivacyDiagnosticsEnabled}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledInput
                    label="Consent Version"
                    value={privacyVersion}
                    onChange={setPrivacyVersion}
                    placeholder="v2"
                  />
                  <div className="rounded-xl border border-border/60 bg-background/45 px-3 py-2">
                    <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Last Updated</p>
                    <p className="mt-1 text-sm">{formatTimestamp(workspace.privacy.consentSettings.updatedAt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTimestamp(workspace.privacy.consentSettings.updatedAt) ?? 'No consent changes yet'}
                    </p>
                  </div>
                </div>
                <LabeledTextarea
                  label="Reason"
                  value={privacyReason}
                  onChange={setPrivacyReason}
                  placeholder="Optional reason for consent change (e.g. user request, policy update)"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">
                    Changes create new rows in <span className="font-medium text-foreground/80">consentLogs</span>.
                  </div>
                  <Button onClick={onSavePrivacySettings} disabled={savingPrivacy}>
                    {savingPrivacy ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Save consent settings
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Consent Change Log</CardTitle>
                <CardDescription>
                  Recent privacy settings changes recorded for audit and compliance verification.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {workspace.privacy.consentLogs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                    No consent changes recorded yet.
                  </div>
                ) : (
                  <ScrollArea className="h-[28rem] pr-3">
                    <div className="space-y-2">
                      {workspace.privacy.consentLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-border/60 bg-background/45 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-border/70 bg-background/60">
                                {humanizeToken(log.consentType)}
                              </Badge>
                              <Badge variant="outline" className={booleanBadgeClasses(log.enabled)}>
                                {log.enabled ? 'Enabled' : 'Disabled'}
                              </Badge>
                              <Badge variant="outline" className="border-border/70 bg-background/60">
                                {log.version}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatRelativeTimestamp(log.createdAt)}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {formatTimestamp(log.createdAt)}
                          </div>
                          {log.reason ? (
                            <div className="mt-2 rounded-lg border border-border/60 bg-background/35 px-3 py-2 text-xs">
                              {log.reason}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="retention" className="space-y-4">
          <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Retention Enforcement</CardTitle>
              <CardDescription>
                Run retention policy enforcement now for your account. Scheduled sweeps also run via Convex cron every 6 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-border/60 bg-background/55 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={runRetentionDryRun}
                  onChange={(event) => setRunRetentionDryRun(event.target.checked)}
                  className="h-4 w-4 rounded border-border bg-background"
                />
                Dry run only
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border/70 bg-background/60">
                  {workspace.retention.stats.enabledPolicyCount} active policies
                </Badge>
                <Button onClick={onRunRetentionCleanupNow} disabled={runningRetentionSweep}>
                  {runningRetentionSweep ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      {runRetentionDryRun ? 'Run dry run' : 'Run cleanup'}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="finance-panel border-red-500/20 bg-red-500/5 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                Account Data Erasure (Hard Delete)
              </CardTitle>
              <CardDescription>
                Permanently delete all current-user data rows from Convex (finance, planning, governance, telemetry) and associated export storage files. Global reference tables such as currencies and FX rates are preserved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
                <div className="rounded-xl border border-red-500/15 bg-background/35 p-3">
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-red-300" />
                    <div>
                      <p className="font-medium">Destructive action</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        This removes your app data from the database for the signed-in Clerk user and cannot be undone. Use the dry-run preview first to review row/file counts before confirming.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
                    Latest preview
                  </p>
                  {accountErasurePreview ? (
                    <div className="mt-2 space-y-1 text-xs">
                      <p>
                        Rows: <span className="font-medium text-foreground">{accountErasurePreview.candidates.totalRows}</span>
                      </p>
                      <p>
                        Storage files:{' '}
                        <span className="font-medium text-foreground">
                          {accountErasurePreview.candidates.storageFiles}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {topDeletionTables(accountErasurePreview.candidates.byUserTable, 3)
                          .map(([table, count]) => `${humanizeToken(table)} (${count})`)
                          .join(' · ') || 'No user rows found'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No preview yet. Run a dry run first.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">
                  Deletes user-scoped rows across known tables and `dashboardPreferences` / `dashboardSnapshots` owner records.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void onPreviewAccountErasure()}
                    disabled={previewingAccountErasure}
                  >
                    {previewingAccountErasure ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Previewing…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Preview delete impact
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowAccountErasureDialog(true)}
                    className="shadow-none"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete all data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Retention Policies</CardTitle>
                <CardDescription>
                  Configure per-artifact retention windows for governance and cleanup workflows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workspace.retention.retentionPolicies.map((policy) => {
                    const draft = retentionDrafts[policy.id] ?? {
                      retentionDays: String(policy.retentionDays),
                      enabled: policy.enabled,
                    }
                    const dirty =
                      draft.retentionDays !== String(policy.retentionDays) ||
                      draft.enabled !== policy.enabled ||
                      policy.source === 'default'
                    const busy = savingPolicyId === policy.id
                    return (
                      <div key={policy.id} className="rounded-xl border border-border/60 bg-background/45 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{policyLabel(policy.policyKey)}</div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {policy.policyKey}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {policy.source === 'default' ? (
                              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                                Default
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-border/70 bg-background/60">
                                {formatRelativeTimestamp(policy.updatedAt) ?? 'Saved'}
                              </Badge>
                            )}
                            <Badge variant="outline" className={booleanBadgeClasses(draft.enabled)}>
                              {draft.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                          <LabeledInput
                            label="Retention Days"
                            type="number"
                            value={draft.retentionDays}
                            onChange={(value) =>
                              setRetentionDrafts((prev) => ({
                                ...prev,
                                [policy.id]: { ...draft, retentionDays: value },
                              }))
                            }
                          />
                          <label className="flex h-10 items-center gap-2 rounded-lg border border-border/60 bg-background/55 px-3 text-sm">
                            <input
                              type="checkbox"
                              checked={draft.enabled}
                              onChange={(event) =>
                                setRetentionDrafts((prev) => ({
                                  ...prev,
                                  [policy.id]: { ...draft, enabled: event.target.checked },
                                }))
                              }
                              className="h-4 w-4 rounded border-border bg-background"
                            />
                            Enabled
                          </label>
                          <Button
                            onClick={() => onSaveRetentionPolicy(policy)}
                            disabled={busy || !dirty}
                            className="h-10"
                          >
                            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            Save
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">Request Deletion Job</CardTitle>
                <CardDescription>
                  Queue deletion or cleanup jobs with dry-run support before enabling destructive execution.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Job Type"
                    value={deletionDraft.jobType}
                    onChange={(value) => setDeletionDraft((prev) => ({ ...prev, jobType: value }))}
                    options={['account_erasure', 'hard_delete', 'retention_cleanup', 'export_cleanup']}
                    labels={{
                      account_erasure: 'Account erasure',
                      hard_delete: 'Hard delete',
                      retention_cleanup: 'Retention cleanup',
                      export_cleanup: 'Export cleanup',
                    }}
                  />
                  <SelectField
                    label="Scope"
                    value={deletionDraft.scope}
                    onChange={(value) => setDeletionDraft((prev) => ({ ...prev, scope: value }))}
                    options={['account', 'single_record', 'exports_only', 'audit_only']}
                    labels={{
                      account: 'Account',
                      single_record: 'Single record',
                      exports_only: 'Exports only',
                      audit_only: 'Audit only',
                    }}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledInput
                    label="Target Entity Type"
                    value={deletionDraft.targetEntityType}
                    onChange={(value) => setDeletionDraft((prev) => ({ ...prev, targetEntityType: value }))}
                    placeholder="bill / purchase / ledger_entry"
                  />
                  <LabeledInput
                    label="Target Entity ID"
                    value={deletionDraft.targetEntityId}
                    onChange={(value) => setDeletionDraft((prev) => ({ ...prev, targetEntityId: value }))}
                    placeholder="Optional specific record id"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <LabeledInput
                    label="Scheduled At"
                    type="datetime-local"
                    value={deletionDraft.scheduledAtLocal}
                    onChange={(value) => setDeletionDraft((prev) => ({ ...prev, scheduledAtLocal: value }))}
                  />
                  <label className="flex h-10 items-center justify-between rounded-lg border border-border/60 bg-background/55 px-3 text-sm">
                    <span>Dry run only</span>
                    <input
                      type="checkbox"
                      checked={deletionDraft.dryRun}
                      onChange={(event) => setDeletionDraft((prev) => ({ ...prev, dryRun: event.target.checked }))}
                      className="h-4 w-4 rounded border-border bg-background"
                    />
                  </label>
                </div>

                <LabeledTextarea
                  label="Reason"
                  value={deletionDraft.reason}
                  onChange={(value) => setDeletionDraft((prev) => ({ ...prev, reason: value }))}
                  placeholder="Reason for deletion request / compliance ticket reference"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/45 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Start with dry-run, then promote the job status when reviewed.
                  </div>
                  <Button onClick={onRequestDeletionJob} disabled={creatingDeletionJob}>
                    {creatingDeletionJob ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Request job
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Deletion Job Queue</CardTitle>
              <CardDescription>
                Track requested, scheduled, running, and completed deletion jobs with operator status controls.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workspace.retention.deletionJobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  No deletion jobs have been requested yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {workspace.retention.deletionJobs.map((job) => {
                    const busy = busyDeletionJobId === job.id
                    return (
                      <div key={job.id} className="rounded-xl border border-border/60 bg-background/45 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{humanizeToken(job.jobType)}</span>
                              <Badge variant={statusBadgeVariant(job.status)}>{humanizeToken(job.status)}</Badge>
                              {job.dryRun ? (
                                <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                                  Dry run
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Scope: {humanizeToken(job.scope)}
                              {job.targetEntityType ? ` • ${job.targetEntityType}` : ''}
                              {job.targetEntityId ? ` • ${job.targetEntityId}` : ''}
                            </div>
                            {job.reason ? (
                              <div className="max-w-3xl text-xs text-muted-foreground">{job.reason}</div>
                            ) : null}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Requested: {formatTimestamp(job.requestedAt)}</span>
                              <span>Scheduled: {formatTimestamp(job.scheduledAt)}</span>
                              {job.completedAt ? <span>Completed: {formatTimestamp(job.completedAt)}</span> : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            {job.status === 'requested' || job.status === 'scheduled' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={busy}
                                onClick={() => onUpdateDeletionStatus(job.id, 'running')}
                              >
                                {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />}
                                Run
                              </Button>
                            ) : null}
                            {job.status === 'running' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  disabled={busy}
                                  onClick={() => onUpdateDeletionStatus(job.id, 'completed')}
                                >
                                  Complete
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  disabled={busy}
                                  onClick={() => onUpdateDeletionStatus(job.id, 'failed')}
                                >
                                  Fail
                                </Button>
                              </>
                            ) : null}
                            {job.status !== 'completed' && job.status !== 'cancelled' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                disabled={busy}
                                onClick={() => onUpdateDeletionStatus(job.id, 'cancelled')}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={showAccountErasureDialog}
            onOpenChange={(open) => {
              setShowAccountErasureDialog(open)
              if (!open) setAccountErasureConfirmationText('')
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto border-red-500/20 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-200">
                  <AlertTriangle className="h-4 w-4" />
                  Confirm Account Data Erasure
                </DialogTitle>
                <DialogDescription>
                  This permanently deletes all data for the currently signed-in user from the Convex database, including finance records, planning data, governance logs, telemetry, and export artifacts.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm">
                  <p className="font-medium text-red-200">Before continuing</p>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                    <li>Use the preview button to confirm how many rows/files will be removed.</li>
                    <li>Export any records you want to keep before running the hard delete.</li>
                    <li>This action is user-scoped and irreversible.</li>
                  </ul>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                    <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
                      Previewed Rows
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {accountErasurePreview ? accountErasurePreview.candidates.totalRows : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/45 p-3">
                    <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
                      Previewed Storage Files
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {accountErasurePreview ? accountErasurePreview.candidates.storageFiles : '—'}
                    </p>
                  </div>
                </div>

                {accountErasurePreview ? (
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
                      Largest Affected Tables
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {topDeletionTables(accountErasurePreview.candidates.byUserTable, 8).map(
                        ([table, count]) => (
                          <Badge key={table} variant="outline" className="border-border/70 bg-background/60">
                            {humanizeToken(table)} · {count}
                          </Badge>
                        ),
                      )}
                      {topDeletionTables(accountErasurePreview.candidates.byUserTable, 8).length === 0 ? (
                        <span className="text-xs text-muted-foreground">No user rows found in preview.</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Total user-table rows in preview: {sumRecordValues(accountErasurePreview.candidates.byUserTable)}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    Type to confirm
                  </label>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                    <div className="font-mono text-sm text-foreground">{accountErasureRequiredPhrase}</div>
                  </div>
                  <Input
                    value={accountErasureConfirmationText}
                    onChange={(event) => setAccountErasureConfirmationText(event.target.value)}
                    placeholder={accountErasureRequiredPhrase}
                    className="bg-background/60"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => void onPreviewAccountErasure()}
                  disabled={previewingAccountErasure || runningAccountErasure}
                >
                  {previewingAccountErasure ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Previewing…
                    </>
                  ) : (
                    'Refresh preview'
                  )}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void onExecuteAccountErasure()}
                  disabled={!canConfirmAccountErasure || runningAccountErasure}
                >
                  {runningAccountErasure ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Permanently delete all data
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Audit Trail Filters</CardTitle>
            <CardDescription>
                Server-side filtering with date range + query terms, then client rendering of the returned window.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_0.8fr_0.8fr_0.8fr_auto] lg:items-end">
                <LabeledInput
                  label="Search"
                  value={auditSearch}
                  onChange={setAuditSearch}
                  placeholder="action, entity id, source, metadata…"
                />
                <SelectField
                  label="Action"
                  value={auditActionFilter}
                  onChange={setAuditActionFilter}
                  options={['all', ...workspace.auditTrail.filterOptions.actions]}
                  labels={{ all: 'All actions' }}
                />
                <SelectField
                  label="Entity Type"
                  value={auditEntityTypeFilter}
                  onChange={setAuditEntityTypeFilter}
                  options={['all', ...workspace.auditTrail.filterOptions.entityTypes]}
                  labels={{ all: 'All entities' }}
                />
                <LabeledInput
                  label="From"
                  type="date"
                  value={auditDateFrom}
                  onChange={setAuditDateFrom}
                />
                <LabeledInput
                  label="To"
                  type="date"
                  value={auditDateTo}
                  onChange={setAuditDateTo}
                />
                <SelectField
                  label="Limit"
                  value={auditLimit}
                  onChange={setAuditLimit}
                  options={['100', '300', '500', '1000', '2000']}
                />
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    setAuditSearch('')
                    setAuditActionFilter('all')
                    setAuditEntityTypeFilter('all')
                    setAuditDateFrom('')
                    setAuditDateTo('')
                    setAuditLimit('300')
                  }}
                >
                  Reset
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="border-border/70 bg-background/60">
                  {filteredAuditRows.length} returned
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-background/60">
                  {workspace.auditTrail.stats.totalRows} matching
                </Badge>
                {typeof workspace.auditTrail.stats.unfilteredTotalRows === 'number' ? (
                  <Badge variant="outline" className="border-border/70 bg-background/60">
                    {workspace.auditTrail.stats.unfilteredTotalRows} total
                  </Badge>
                ) : null}
                <span>
                  Latest event: {formatTimestamp(workspace.auditTrail.stats.lastEventAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Audit Events</CardTitle>
              <CardDescription>
                Recent finance audit entries with metadata and before/after payload previews for operator review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredAuditRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                  No audit events match the current filters.
                </div>
              ) : (
                <ScrollArea className="h-[40rem] pr-3">
                  <div className="space-y-3">
                    {filteredAuditRows.map((row) => (
                      <div key={row.id} className="rounded-xl border border-border/60 bg-background/45 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary">
                                {row.action}
                              </Badge>
                              {row.entityType ? (
                                <Badge variant="outline" className="border-border/70 bg-background/60">
                                  {row.entityType}
                                </Badge>
                              ) : null}
                              {row.source ? (
                                <Badge variant="outline" className="border-border/70 bg-background/60">
                                  {row.source}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatTimestamp(row.createdAt)} • {formatRelativeTimestamp(row.createdAt)}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              Entity: {row.entityId || '—'}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate max-w-[48rem]">
                              Audit row: {row.id}
                            </div>
                            {(row.metadataSummary || row.beforeSummary || row.afterSummary) ? (
                              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                {row.metadataSummary ? <span>meta: {row.metadataSummary}</span> : null}
                                {row.beforeSummary ? <span>before: {row.beforeSummary}</span> : null}
                                {row.afterSummary ? <span>after: {row.afterSummary}</span> : null}
                              </div>
                            ) : null}
                          </div>
                          <Badge variant="outline" className="border-border/70 bg-background/60 font-mono text-[10px]">
                            {row.userId.slice(0, 16)}…
                          </Badge>
                        </div>

                        {(row.metadataJson || row.beforeJson || row.afterJson) ? (
                          <>
                            <Separator className="my-3" />
                            <div className="grid gap-2 lg:grid-cols-3">
                              <JsonPreview title="Metadata JSON" json={row.metadataJson} />
                              <JsonPreview title="Before JSON" json={row.beforeJson} />
                              <JsonPreview title="After JSON" json={row.afterJson} />
                            </div>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card className="finance-panel border-border/50 bg-card/35 shadow-none">
            <CardHeader className="gap-2">
              <CardTitle className="text-sm">Security Trust Pack (Included)</CardTitle>
              <CardDescription>
                Core security controls are included for all users and are not a paid add-on.
              </CardDescription>
              <CardAction>
                <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/12 text-emerald-200">
                  Included for all users
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                {securityTrustControls.map((control) => {
                  const Icon = control.icon
                  return (
                    <div
                      key={control.id}
                      className="rounded-xl border border-border/65 bg-background/45 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <div className="rounded-lg border border-border/65 bg-card/45 p-2">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{control.title}</p>
                            <p className="text-xs text-muted-foreground">{control.description}</p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-5 shrink-0 rounded-full px-1.5 text-[10px]',
                            control.tone === 'positive' && 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200',
                            control.tone === 'warning' && 'border-amber-400/45 bg-amber-500/12 text-amber-200',
                            control.tone === 'neutral' && 'border-border/65 bg-card/55 text-muted-foreground',
                          )}
                        >
                          {control.status}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                <p className="text-sm font-medium">Operational next steps</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keep Clerk passkey/MFA policies enabled, run dependency and pen-test cycles each release window, and keep Governance/Audit tabs as the source of truth for change evidence.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActiveTab('audit')
                    }}
                  >
                    Open audit trail
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onNavigateTab?.('reliability')
                    }}
                  >
                    Open reliability tab
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
