import { useDeferredValue, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import {
  BellRing,
  CloudOff,
  CloudUpload,
  LoaderCircle,
  Radio,
  RefreshCcw,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../../convex/_generated/api'
import type { WorkspaceTabKey } from '@/components/dashboard/dashboard-types'
import { usePwaReliability } from '@/components/pwa/pwa-reliability-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

type ReliabilityTelemetryRow = {
  id: string
  createdAt: number
  category: string
  eventType: string
  severity: string
  status: string
  feature: string
  message: string
  route: string
  online: boolean | null
  visibilityState: string
  sessionId: string
  source: string
  latencyMs: number
  metricValue: number
  metadataJson: string
  metadataSummary: string
}

type ReliabilityWorkspaceData = {
  viewerAuthenticated: boolean
  viewerUserId: string | null
  locale: string
  notifications: {
    viewerAuthenticated: boolean
    viewerUserId: string | null
    timezone: string
    preferences: {
      dueRemindersEnabled: boolean
      monthlyCycleAlertsEnabled: boolean
      goalAlertsEnabled: boolean
    }
    reminders: Array<{
      id: string
      kind: string
      title: string
      body: string
      dueAt: number | null
      route: string
      severity: string
      dedupeKey: string
    }>
  }
  telemetry: {
    rows: ReliabilityTelemetryRow[]
    stats: {
      totalRows: number
      filteredRows: number
      errorRows: number
      offlineRows: number
      syncRows: number
      lastEventAt: number | null
    }
    filterOptions: {
      categories: string[]
      eventTypes: string[]
      features: string[]
    }
    appliedFilters: {
      telemetryLimit: number
      telemetryFrom: number | null
      telemetryTo: number | null
      telemetryCategory: string | null
      telemetrySearch: string
    }
  }
}

function formatTimestamp(value: number | null | undefined) {
  if (!value) return 'n/a'
  return format(value, 'dd MMM yyyy, HH:mm')
}

function formatRelative(value: number | null | undefined) {
  if (!value) return null
  return formatDistanceToNowStrict(value, { addSuffix: true })
}

function parseDateStart(value: string) {
  if (!value) return undefined
  const ts = new Date(`${value}T00:00:00`).getTime()
  return Number.isFinite(ts) ? ts : undefined
}

function parseDateEnd(value: string) {
  if (!value) return undefined
  const ts = new Date(`${value}T23:59:59.999`).getTime()
  return Number.isFinite(ts) ? ts : undefined
}

function severityTone(value: string) {
  const normalized = value.toLowerCase()
  if (normalized === 'error' || normalized === 'high') return 'destructive'
  if (normalized === 'warning' || normalized === 'medium') return 'outline'
  return 'secondary'
}

export function ReliabilityWorkspaceTab({
  displayLocale,
  thumbMode = false,
  onNavigateTab,
}: {
  displayLocale: string
  thumbMode?: boolean
  onNavigateTab?: (tab: WorkspaceTabKey) => void
}) {
  const {
    isOnline,
    isFlushing,
    lastFlushAt,
    lastFlushSummary,
    backgroundSyncSupported,
    notificationsSupported,
    notificationPermission,
    reminderFeed,
    telemetryQueueCount,
    offlineIntents,
    formDraftSummaries,
    requestNotificationPermission,
    sendTestNotification,
    flushQueues,
    registerBackgroundSync,
    clearFailedOfflineIntents,
    clearAllOfflineIntents,
    clearAllFormDrafts,
    trackEvent,
  } = usePwaReliability()

  const [telemetrySearch, setTelemetrySearch] = useState('')
  const [telemetryCategory, setTelemetryCategory] = useState('all')
  const [telemetryDateFrom, setTelemetryDateFrom] = useState('')
  const [telemetryDateTo, setTelemetryDateTo] = useState('')
  const [telemetryLimit, setTelemetryLimit] = useState('250')

  const deferredTelemetrySearch = useDeferredValue(telemetrySearch)
  const deferredTelemetryDateFrom = useDeferredValue(telemetryDateFrom)
  const deferredTelemetryDateTo = useDeferredValue(telemetryDateTo)
  const resolvedTelemetryLimit = Math.max(50, Math.min(2000, Number(telemetryLimit) || 250))

  // Phase 7 module may exist before local codegen refresh in some environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspace = useQuery((api as any).reliability.getPhaseSevenReliabilityWorkspace, {
    locale: displayLocale,
    telemetryLimit: resolvedTelemetryLimit,
    telemetryCategory: telemetryCategory !== 'all' ? telemetryCategory : undefined,
    telemetrySearch: deferredTelemetrySearch.trim() || undefined,
    telemetryFrom: parseDateStart(deferredTelemetryDateFrom),
    telemetryTo: parseDateEnd(deferredTelemetryDateTo),
  }) as ReliabilityWorkspaceData | undefined

  const telemetryRows = workspace?.telemetry.rows ?? []
  const telemetryStats = workspace?.telemetry.stats
  const telemetryFilters = workspace?.telemetry.filterOptions
  const notificationRows = reminderFeed?.reminders ?? workspace?.notifications.reminders ?? []

  const queueStatusTone = useMemo(() => {
    if (!isOnline) return 'secondary'
    if (offlineIntents.length > 0 || telemetryQueueCount > 0) return 'secondary'
    return 'default'
  }, [isOnline, offlineIntents.length, telemetryQueueCount])

  const onFlushNow = async () => {
    const result = await flushQueues('reliability_tab_manual_flush')
    if (result.ok) {
      toast.success(
        `Sync completed (${result.intentsSucceeded} intents, ${result.telemetrySent} telemetry)`,
      )
    } else {
      toast(result.reason === 'offline' ? 'Offline queue waiting' : 'Sync did not complete', {
        description:
          result.reason === 'offline'
            ? 'Reconnect to flush queued actions and telemetry.'
            : result.reason,
      })
    }
  }

  const onEnableNotifications = async () => {
    const permission = await requestNotificationPermission()
    if (permission === 'granted') {
      toast.success('Notifications enabled')
    } else if (permission === 'denied') {
      toast.error('Notifications blocked', {
        description: 'Allow notifications in browser/site settings to receive due reminders.',
      })
    } else {
      toast('Notifications not available')
    }
  }

  const onSendTestNotification = async () => {
    const ok = await sendTestNotification('/?view=reliability')
    if (!ok) {
      toast.error('Unable to send test notification')
      return
    }
    toast.success('Test notification sent')
  }

  const onRegisterBgSync = async () => {
    const ok = await registerBackgroundSync('reliability_tab_manual')
    if (ok) {
      toast.success('Background sync registered')
    } else {
      toast('Background sync unavailable', {
        description: 'The browser will use reconnect/focus retry instead.',
      })
    }
  }

  const onClearFailedIntents = () => {
    clearFailedOfflineIntents()
    toast.success('Failed queued actions cleared')
  }

  const onClearAllQueues = () => {
    clearAllOfflineIntents()
    toast.success('Offline action queue cleared')
  }

  const onClearDrafts = () => {
    clearAllFormDrafts()
    toast.success('Local form drafts cleared')
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
                Reliability
              </Badge>
            </div>
            <CardDescription>One-thumb sync and reminder controls for mobile PWA ops.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button size="sm" variant="outline" onClick={() => void onFlushNow()} disabled={isFlushing}>
              <RefreshCcw className="h-4 w-4" />
              Flush
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onRegisterBgSync()}>
              <Radio className="h-4 w-4" />
              Bg sync
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onEnableNotifications()}>
              <BellRing className="h-4 w-4" />
              Notify
            </Button>
            {onNavigateTab ? (
              <Button size="sm" variant="outline" onClick={() => onNavigateTab('governance')}>
                <ShieldAlert className="h-4 w-4" />
                Governance
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="text-primary h-4 w-4" />
              Reliability & PWA Ops
            </CardTitle>
            <CardDescription>
              Offline queue health, notification reminders, and client telemetry for the installed
              finance workspace.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isOnline ? 'default' : 'secondary'} className="gap-1">
              {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
            <Badge variant={queueStatusTone as 'default' | 'secondary' | 'outline'}>
              {offlineIntents.length + telemetryQueueCount} queued items
            </Badge>
            <Badge variant="outline" className="border-border/70">
              {backgroundSyncSupported ? 'Background Sync ready' : 'Reconnect fallback'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Card className="border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudUpload className="h-4 w-4 text-primary" />
                Sync Queue
              </CardTitle>
              <CardDescription>
                Retry queued mutations and telemetry on reconnect, focus, or background sync wake.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-card/30 p-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                    Action intents
                  </p>
                  <p className="mt-1 text-xl font-semibold">{offlineIntents.length}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/30 p-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                    Telemetry buffer
                  </p>
                  <p className="mt-1 text-xl font-semibold">{telemetryQueueCount}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-card/30 p-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                    Last flush
                  </p>
                  <p className="mt-1 text-sm font-medium">{formatTimestamp(lastFlushAt)}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatRelative(lastFlushAt) ?? 'No sync run yet'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void onFlushNow()}
                  disabled={isFlushing}
                  className="gap-2"
                >
                  {isFlushing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Flush now
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onRegisterBgSync()}>
                  <Radio className="h-4 w-4" />
                  Register Background Sync
                </Button>
                <Button size="sm" variant="outline" onClick={onClearFailedIntents}>
                  Clear failed intents
                </Button>
                <Button size="sm" variant="outline" onClick={onClearAllQueues}>
                  Clear all intents
                </Button>
              </div>

              {lastFlushSummary ? (
                <div className="rounded-xl border border-border/70 bg-card/25 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={lastFlushSummary.ok ? 'default' : 'secondary'}>
                      {lastFlushSummary.ok ? 'Last flush ok' : 'Last flush incomplete'}
                    </Badge>
                    <span className="text-muted-foreground">
                      {lastFlushSummary.intentsSucceeded}/{lastFlushSummary.intentsProcessed} intents
                      replayed
                    </span>
                    <span className="text-muted-foreground">
                      {lastFlushSummary.telemetrySent} telemetry sent
                    </span>
                    {lastFlushSummary.telemetryDropped > 0 ? (
                      <span className="text-amber-400">
                        {lastFlushSummary.telemetryDropped} dropped
                      </span>
                    ) : null}
                  </div>
                  {!lastFlushSummary.ok ? (
                    <p className="mt-2 text-muted-foreground">
                      Reason: <span className="text-foreground">{lastFlushSummary.reason}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Queued Actions</p>
                  <Badge variant="outline" className="border-border/70">
                    {offlineIntents.length}
                  </Badge>
                </div>
                {offlineIntents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No queued mutations. Offline submissions will appear here and auto-retry.
                  </p>
                ) : (
                  <ScrollArea className="h-52 pr-2">
                    <div className="space-y-2">
                      {offlineIntents.map((intent) => (
                        <div
                          key={intent.id}
                          className="rounded-xl border border-border/70 bg-card/25 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">
                                {intent.metadata?.label ?? intent.kind}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {intent.kind} · queued {formatRelative(intent.createdAt) ?? 'now'}
                              </p>
                            </div>
                            <Badge
                              variant={intent.lastError ? 'secondary' : 'outline'}
                              className="border-border/70"
                            >
                              {intent.lastError
                                ? `Retry ${intent.attempts}`
                                : intent.attempts > 0
                                  ? `Retried ${intent.attempts}`
                                  : 'Pending'}
                            </Badge>
                          </div>
                          {intent.lastError ? (
                            <p className="mt-2 text-xs text-amber-400">{intent.lastError}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudOff className="h-4 w-4 text-primary" />
                Local Draft Queue
              </CardTitle>
              <CardDescription>
                Autosaved form drafts persist locally and sync across tabs using shared storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-border/70">
                  {formDraftSummaries.length} drafts
                </Badge>
                <Button size="sm" variant="outline" onClick={onClearDrafts}>
                  Clear all drafts
                </Button>
              </div>
              {formDraftSummaries.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No local drafts stored yet. Phase 7 draft persistence activates on Governance
                  forms (exports and deletion jobs).
                </p>
              ) : (
                <div className="space-y-2">
                  {formDraftSummaries.slice(0, 8).map((draft) => (
                    <div
                      key={draft.key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/25 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{draft.key}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatRelative(draft.updatedAt) ?? 'just now'}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-border/70 tabular-nums">
                        {draft.byteSize} B
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="h-4 w-4 text-primary" />
                Notifications & Reminders
              </CardTitle>
              <CardDescription>
                Permission-gated reminders for due items and cycle alerts using the service worker.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={notificationsSupported ? 'outline' : 'secondary'}
                  className="border-border/70"
                >
                  <Smartphone className="mr-1 h-3.5 w-3.5" />
                  {notificationsSupported ? 'Notifications supported' : 'Notifications unsupported'}
                </Badge>
                <Badge
                  variant={
                    notificationPermission === 'granted'
                      ? 'default'
                      : notificationPermission === 'denied'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {notificationPermission}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void onEnableNotifications()}>
                  Enable notifications
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onSendTestNotification()}>
                  Send test notification
                </Button>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/25 p-3 text-xs">
                <p className="font-medium text-foreground">Reminder sources</p>
                <p className="mt-1 text-muted-foreground">
                  Due bills, loan payments, and cycle alerts are queried from Convex and deduped
                  locally before notification delivery.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Upcoming reminders</p>
                  <Badge variant="outline" className="border-border/70">
                    {notificationRows.length}
                  </Badge>
                </div>
                {notificationRows.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No reminders returned from Convex right now.
                  </p>
                ) : (
                  <ScrollArea className="h-64 pr-2">
                    <div className="space-y-2">
                      {notificationRows.map((row) => (
                        <button
                          key={`${row.kind}-${row.id}-${row.dedupeKey}`}
                          type="button"
                          className="w-full rounded-xl border border-border/70 bg-card/25 p-3 text-left transition hover:border-primary/30 hover:bg-card/35"
                          onClick={() => {
                            trackEvent({
                              category: 'notifications',
                              eventType: 'reminder_row_clicked',
                              feature: 'reliability_tab',
                              status: 'open_route',
                              message: row.kind,
                            })
                            window.location.assign(row.route)
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{row.title}</p>
                              <p className="text-muted-foreground mt-1 text-xs">{row.body}</p>
                            </div>
                            <Badge
                              variant={
                                severityTone(row.severity) as
                                  | 'destructive'
                                  | 'outline'
                                  | 'secondary'
                              }
                            >
                              {row.severity}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mt-2 text-xs">
                            {row.dueAt
                              ? `${formatTimestamp(row.dueAt)} · ${formatRelative(row.dueAt) ?? ''}`
                              : 'No due timestamp'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/35 shadow-none backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Telemetry Snapshot
              </CardTitle>
              <CardDescription>
                Live client telemetry from <code className="font-mono">clientOpsMetrics</code> with
                server-side filtering.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">Search</label>
                  <Input
                    value={telemetrySearch}
                    onChange={(event) => setTelemetrySearch(event.target.value)}
                    placeholder="event, status, route, metadata"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">Category</label>
                  <select
                    value={telemetryCategory}
                    onChange={(event) => setTelemetryCategory(event.target.value)}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <option value="all">All categories</option>
                    {telemetryFilters?.categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">From date</label>
                  <Input
                    type="date"
                    value={telemetryDateFrom}
                    onChange={(event) => setTelemetryDateFrom(event.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">To date</label>
                  <Input
                    type="date"
                    value={telemetryDateTo}
                    onChange={(event) => setTelemetryDateTo(event.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-muted-foreground text-xs font-medium">Rows</label>
                <Input
                  type="number"
                  min={50}
                  max={2000}
                  step={50}
                  value={telemetryLimit}
                  onChange={(event) => setTelemetryLimit(event.target.value)}
                  className="h-8 w-28"
                />
                {telemetryStats ? (
                  <>
                    <Badge variant="outline" className="border-border/70">
                      {telemetryStats.filteredRows}/{telemetryStats.totalRows} rows
                    </Badge>
                    <Badge variant="outline" className="border-border/70">
                      {telemetryStats.errorRows} errors
                    </Badge>
                    <Badge variant="outline" className="border-border/70">
                      {telemetryStats.syncRows} sync events
                    </Badge>
                  </>
                ) : null}
              </div>

              <div className="rounded-xl border border-border/70 bg-card/20">
                {workspace === undefined ? (
                  <div className="flex items-center gap-2 p-4 text-sm">
                    <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                    Loading telemetry from Convex...
                  </div>
                ) : telemetryRows.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No telemetry rows matched the current filters yet.
                  </div>
                ) : (
                  <ScrollArea className="h-[26rem]">
                    <div className="space-y-2 p-2 lg:hidden">
                      {telemetryRows.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium break-words">{row.eventType}</p>
                              <p className="text-muted-foreground mt-1 text-xs">
                                {formatTimestamp(row.createdAt)} · {formatRelative(row.createdAt) ?? ''}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="border-border/70">
                                {row.category}
                              </Badge>
                              <Badge
                                variant={
                                  severityTone(row.severity) as
                                    | 'destructive'
                                    | 'outline'
                                    | 'secondary'
                                }
                              >
                                {row.severity}
                              </Badge>
                              <Badge
                                variant={
                                  row.status === 'error' || row.status === 'failed'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {row.status || 'n/a'}
                              </Badge>
                            </div>
                          </div>

                          {row.message ? (
                            <p className="text-muted-foreground mt-2 text-xs break-words">{row.message}</p>
                          ) : null}
                          {row.metadataSummary ? (
                            <p className="text-muted-foreground mt-1 text-[11px] break-words">
                              {row.metadataSummary}
                            </p>
                          ) : null}

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs">
                              <div className="tracking-[0.12em] text-muted-foreground uppercase">Feature</div>
                              <div className="mt-1 break-words">{row.feature || 'client'}</div>
                              <div className="text-muted-foreground break-words">{row.source || 'unknown'}</div>
                            </div>
                            <div className="rounded-lg border border-border/50 bg-background/35 px-2.5 py-2 text-xs">
                              <div className="tracking-[0.12em] text-muted-foreground uppercase">Route</div>
                              <div className="mt-1 break-words">{row.route || 'n/a'}</div>
                              <div className="text-muted-foreground">
                                {row.online === null
                                  ? 'online:n/a'
                                  : row.online
                                    ? 'online:true'
                                    : 'online:false'}
                                {Number.isFinite(row.latencyMs)
                                  ? ` · latency ${Math.round(row.latencyMs)}ms`
                                  : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden lg:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[156px]">Time</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Feature</TableHead>
                            <TableHead>Route</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {telemetryRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="align-top text-xs">
                                <div>{formatTimestamp(row.createdAt)}</div>
                                <div className="text-muted-foreground">
                                  {formatRelative(row.createdAt) ?? ''}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="border-border/70">
                                    {row.category}
                                  </Badge>
                                  <Badge
                                    variant={
                                      severityTone(row.severity) as
                                        | 'destructive'
                                        | 'outline'
                                        | 'secondary'
                                    }
                                  >
                                    {row.severity}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm font-medium">{row.eventType}</p>
                                {row.message ? (
                                  <p className="text-muted-foreground mt-1 text-xs">{row.message}</p>
                                ) : null}
                                {row.metadataSummary ? (
                                  <p className="text-muted-foreground mt-1 text-[11px]">
                                    {row.metadataSummary}
                                  </p>
                                ) : null}
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex flex-col gap-1">
                                  <Badge
                                    variant={
                                      row.status === 'error' || row.status === 'failed'
                                        ? 'destructive'
                                        : 'secondary'
                                    }
                                  >
                                    {row.status || 'n/a'}
                                  </Badge>
                                  <span className="text-muted-foreground text-xs">
                                    {row.online === null
                                      ? 'online:n/a'
                                      : row.online
                                        ? 'online:true'
                                        : 'online:false'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="align-top text-xs">
                                <div>{row.feature || 'client'}</div>
                                <div className="text-muted-foreground">{row.source || 'unknown'}</div>
                              </TableCell>
                              <TableCell className="max-w-[18rem] align-top text-xs">
                                <div className="truncate">{row.route || 'n/a'}</div>
                                {Number.isFinite(row.latencyMs) ? (
                                  <div className="text-muted-foreground">
                                    latency {Math.round(row.latencyMs)}ms
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
