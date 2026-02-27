/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { getPwaBusTabId, publishPwaBusMessage, subscribePwaBus } from '@/lib/pwa/pwa-bus'
import {
  type ClientTelemetryEvent,
  type FormDraftSummary,
  type OfflineIntent,
  type OfflineIntentKind,
  appendTelemetryEvents,
  claimReminderDedupeKey,
  claimToastDedupeKey,
  clearAllFormDrafts,
  clearFormDraft,
  clearOfflineIntents,
  enqueueOfflineIntent,
  listFormDraftSummaries,
  listOfflineIntents,
  listTelemetryBuffer,
  patchOfflineIntent,
  readFormDraft,
  releaseSyncLock,
  removeOfflineIntent,
  shiftTelemetryEvents,
  tryAcquireSyncLock,
  writeFormDraft,
} from '@/lib/pwa/offline-queue'

type ReminderFeed = {
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
    kind: 'cycle_alert' | 'bill_due' | 'loan_due' | string
    title: string
    body: string
    dueAt: number | null
    route: string
    severity: 'low' | 'medium' | 'high' | string
    dedupeKey: string
  }>
}

type FlushSummary = {
  ok: boolean
  reason: string
  telemetrySent: number
  telemetryDropped: number
  intentsProcessed: number
  intentsSucceeded: number
  intentsFailed: number
}

type PwaReliabilityContextValue = {
  tabId: string
  isOnline: boolean
  isFlushing: boolean
  lastFlushAt: number | null
  lastFlushSummary: FlushSummary | null
  notificationsSupported: boolean
  backgroundSyncSupported: boolean
  notificationPermission: NotificationPermission | 'unsupported'
  reminderFeed: ReminderFeed | undefined
  offlineIntents: OfflineIntent[]
  telemetryQueueCount: number
  formDraftSummaries: FormDraftSummary[]
  draftRevision: number
  requestNotificationPermission: () => Promise<NotificationPermission | 'unsupported'>
  sendTestNotification: (route?: string) => Promise<boolean>
  flushQueues: (reason?: string) => Promise<FlushSummary>
  registerBackgroundSync: (reason?: string) => Promise<boolean>
  enqueueIntent: (
    kind: OfflineIntentKind,
    args: Record<string, unknown>,
    metadata?: OfflineIntent['metadata'],
  ) => OfflineIntent
  clearFailedOfflineIntents: () => void
  clearAllOfflineIntents: () => void
  clearAllFormDrafts: () => void
  trackEvent: (event: ClientTelemetryEvent) => void
  claimSharedToastKey: (key: string, ttlMs?: number) => boolean
  readDraftValue: <T>(key: string, fallback: T) => T
  writeDraftValue: <T>(key: string, value: T) => void
  clearDraftValue: (key: string) => void
}

const PwaReliabilityContext = createContext<PwaReliabilityContextValue | null>(null)

const BACKGROUND_SYNC_TAG = 'finance-os-sync'

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong'
}

function currentRoute() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

function backgroundSyncSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window.ServiceWorkerRegistration !== 'undefined' &&
    'sync' in window.ServiceWorkerRegistration.prototype
  )
}

async function postServiceWorkerNotification(payload: {
  title: string
  body: string
  route?: string
  tag?: string
  data?: Record<string, unknown>
}) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    if (notificationsSupported() && Notification.permission === 'granted') {
      new Notification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        data: { route: payload.route, ...(payload.data ?? {}) },
      })
      return true
    }
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    if (registration.active) {
      registration.active.postMessage({
        type: 'PWA_SHOW_NOTIFICATION',
        payload,
      })
      return true
    }
    if (typeof registration.showNotification === 'function') {
      await registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        data: { route: payload.route, ...(payload.data ?? {}) },
      })
      return true
    }
  } catch {
    // Fallback below.
  }

  if (notificationsSupported() && Notification.permission === 'granted') {
    new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { route: payload.route, ...(payload.data ?? {}) },
    })
    return true
  }

  return false
}

export function PwaReliabilityProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId } = useAuth()
  const tabId = useMemo(() => getPwaBusTabId(), [])
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [isFlushing, setIsFlushing] = useState(false)
  const [lastFlushAt, setLastFlushAt] = useState<number | null>(null)
  const [lastFlushSummary, setLastFlushSummary] = useState<FlushSummary | null>(null)
  const [telemetryQueueCount, setTelemetryQueueCount] = useState(() => listTelemetryBuffer().length)
  const [offlineIntents, setOfflineIntents] = useState<OfflineIntent[]>(() => listOfflineIntents())
  const [formDraftSummaries, setFormDraftSummaries] = useState<FormDraftSummary[]>(() =>
    listFormDraftSummaries(),
  )
  const [draftRevision, setDraftRevision] = useState(0)
  const [minuteBucket, setMinuteBucket] = useState(() => Math.floor(Date.now() / 60_000))
  const flushInFlightRef = useRef<Promise<FlushSummary> | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ingestClientOpsMetricsBatch = useMutation((api as any).reliability.ingestClientOpsMetricsBatch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const governanceRequestUserExport = useMutation((api as any).governance.requestUserExport)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const governanceUpdateConsentSettings = useMutation((api as any).governance.updateConsentSettings)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const governanceRequestDeletionJob = useMutation((api as any).governance.requestDeletionJob)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const governanceUpsertRetentionPolicy = useMutation((api as any).governance.upsertRetentionPolicy)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashboardRecordPurchaseWithLedgerPosting = useMutation((api as any).dashboard.recordPurchaseWithLedgerPosting)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashboardUpsertCoreFinanceEntity = useMutation((api as any).dashboard.upsertCoreFinanceEntity)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashboardDeleteCoreFinanceEntity = useMutation((api as any).dashboard.deleteCoreFinanceEntity)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reminderFeed = useQuery((api as any).reliability.getNotificationReminderFeed, {
    lookaheadDays: 3,
    limit: 8,
    minuteBucket,
  }) as ReminderFeed | undefined

  const refreshLocalSnapshots = useCallback(() => {
    setTelemetryQueueCount(listTelemetryBuffer().length)
    setOfflineIntents(listOfflineIntents())
    setFormDraftSummaries(listFormDraftSummaries())
  }, [])

  const publishQueueSnapshot = useCallback(
    (reason: string) => {
      const payload = {
        reason,
        telemetryQueueCount: listTelemetryBuffer().length,
        offlineIntentCount: listOfflineIntents().length,
        formDraftCount: listFormDraftSummaries().length,
      }
      publishPwaBusMessage('pwa.queue.updated', payload)
    },
    [],
  )

  const trackEvent = useCallback(
    (event: ClientTelemetryEvent) => {
      const enriched: ClientTelemetryEvent = {
        source: 'phase7_pwa_provider',
        route: currentRoute(),
        online:
          typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
            ? navigator.onLine
            : true,
        visibilityState:
          typeof document !== 'undefined' ? document.visibilityState : 'visible',
        createdAt: Date.now(),
        sessionId: tabId,
        ...event,
      }
      appendTelemetryEvents([enriched])
      setTelemetryQueueCount(listTelemetryBuffer().length)
      publishQueueSnapshot('telemetry_append')
    },
    [publishQueueSnapshot, tabId],
  )

  const claimSharedToastKey = useCallback((key: string, ttlMs = 30_000) => {
    const claimed = claimToastDedupeKey(key, ttlMs)
    if (claimed) {
      publishPwaBusMessage('pwa.toast.claimed', { key, ttlMs })
    }
    return claimed
  }, [])

  const registerBackgroundSync = useCallback(
    async (reason = 'manual') => {
      if (!backgroundSyncSupported()) return false
      try {
        const registration = await navigator.serviceWorker.ready
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (registration as any).sync.register(BACKGROUND_SYNC_TAG)
        trackEvent({
          category: 'sync',
          eventType: 'background_sync_registered',
          feature: 'pwa_reliability',
          status: 'ok',
          message: reason,
        })
        return true
      } catch (error) {
        trackEvent({
          category: 'sync',
          eventType: 'background_sync_register_failed',
          feature: 'pwa_reliability',
          severity: 'warning',
          status: 'error',
          message: safeErrorMessage(error),
        })
        return false
      }
    },
    [trackEvent],
  )

  const requestNotificationPermission = useCallback(async () => {
    if (!notificationsSupported()) return 'unsupported' as const
    try {
      const permission = await Notification.requestPermission()
      trackEvent({
        category: 'notifications',
        eventType: 'permission_result',
        feature: 'pwa_reliability',
        status: permission,
      })
      return permission
    } catch (error) {
      trackEvent({
        category: 'notifications',
        eventType: 'permission_error',
        feature: 'pwa_reliability',
        severity: 'warning',
        status: 'error',
        message: safeErrorMessage(error),
      })
      return notificationsSupported() ? Notification.permission : ('unsupported' as const)
    }
  }, [trackEvent])

  const sendTestNotification = useCallback(
    async (route = '/?view=reliability') => {
      const supported = notificationsSupported()
      if (!supported) return false
      if (Notification.permission !== 'granted') {
        const permission = await requestNotificationPermission()
        if (permission !== 'granted') return false
      }
      const ok = await postServiceWorkerNotification({
        title: 'Finance OS notification test',
        body: 'Phase 7 reminders are active on this device.',
        route,
        tag: `finance-os-test-${tabId}`,
        data: { kind: 'test', route },
      })
      trackEvent({
        category: 'notifications',
        eventType: 'test_notification',
        feature: 'pwa_reliability',
        status: ok ? 'sent' : 'failed',
      })
      return ok
    },
    [requestNotificationPermission, tabId, trackEvent],
  )

  const replayOfflineIntent = useCallback(
    async (intent: OfflineIntent) => {
      switch (intent.kind) {
        case 'governance.requestUserExport':
          await governanceRequestUserExport(intent.args)
          return
        case 'governance.updateConsentSettings':
          await governanceUpdateConsentSettings(intent.args)
          return
        case 'governance.requestDeletionJob':
          await governanceRequestDeletionJob(intent.args)
          return
        case 'governance.upsertRetentionPolicy':
          await governanceUpsertRetentionPolicy(intent.args)
          return
        case 'dashboard.recordPurchaseWithLedgerPosting':
          await dashboardRecordPurchaseWithLedgerPosting(intent.args)
          return
        case 'dashboard.upsertCoreFinanceEntity':
          await dashboardUpsertCoreFinanceEntity(intent.args)
          return
        case 'dashboard.deleteCoreFinanceEntity':
          await dashboardDeleteCoreFinanceEntity(intent.args)
          return
        default:
          throw new Error(`Unsupported offline intent: ${intent.kind}`)
      }
    },
    [
      dashboardDeleteCoreFinanceEntity,
      dashboardRecordPurchaseWithLedgerPosting,
      dashboardUpsertCoreFinanceEntity,
      governanceRequestDeletionJob,
      governanceRequestUserExport,
      governanceUpdateConsentSettings,
      governanceUpsertRetentionPolicy,
    ],
  )

  const flushQueues = useCallback(
    async (reason = 'manual'): Promise<FlushSummary> => {
      if (flushInFlightRef.current) return flushInFlightRef.current

      const run = (async () => {
        if (!isOnline) {
          const summary: FlushSummary = {
            ok: false,
            reason: 'offline',
            telemetrySent: 0,
            telemetryDropped: 0,
            intentsProcessed: 0,
            intentsSucceeded: 0,
            intentsFailed: 0,
          }
          setLastFlushSummary(summary)
          return summary
        }
        if (!tryAcquireSyncLock(tabId)) {
          const summary: FlushSummary = {
            ok: false,
            reason: 'locked_by_other_tab',
            telemetrySent: 0,
            telemetryDropped: 0,
            intentsProcessed: 0,
            intentsSucceeded: 0,
            intentsFailed: 0,
          }
          setLastFlushSummary(summary)
          return summary
        }

        setIsFlushing(true)
        trackEvent({
          category: 'sync',
          eventType: 'flush_start',
          feature: 'pwa_reliability',
          status: 'started',
          message: reason,
        })

        let telemetrySent = 0
        let telemetryDropped = 0
        let intentsProcessed = 0
        let intentsSucceeded = 0
        let intentsFailed = 0

        try {
          if (isSignedIn) {
            for (let guard = 0; guard < 6; guard += 1) {
              const telemetryBuffer = listTelemetryBuffer()
              if (telemetryBuffer.length === 0) break
              const batch = telemetryBuffer.slice(0, 200)
              try {
                const result = await ingestClientOpsMetricsBatch({
                  eventsJson: JSON.stringify(batch),
                })
                const acceptedCount =
                  typeof result?.acceptedCount === 'number'
                    ? Math.max(0, Math.trunc(result.acceptedCount))
                    : batch.length
                const insertedCount =
                  typeof result?.insertedCount === 'number'
                    ? Math.max(0, Math.trunc(result.insertedCount))
                    : acceptedCount
                shiftTelemetryEvents(Math.max(1, acceptedCount))
                telemetrySent += insertedCount
                telemetryDropped += Math.max(0, acceptedCount - insertedCount)
              } catch (error) {
                const message = safeErrorMessage(error)
                if (message.toLowerCase().includes('unauthor')) {
                  break
                }
                throw error
              }
            }
          }

          if (isSignedIn) {
            const intents = listOfflineIntents()
            for (const intent of intents.slice(0, 50)) {
              intentsProcessed += 1
              try {
                await replayOfflineIntent(intent)
                removeOfflineIntent(intent.id)
                intentsSucceeded += 1
                if (intent.metadata?.clearDraftOnSuccess && intent.metadata.formDraftKey) {
                  clearFormDraft(intent.metadata.formDraftKey)
                }
              } catch (error) {
                intentsFailed += 1
                patchOfflineIntent(intent.id, {
                  attempts: intent.attempts + 1,
                  lastError: safeErrorMessage(error),
                })
              }
            }
          }

          const summary: FlushSummary = {
            ok: true,
            reason,
            telemetrySent,
            telemetryDropped,
            intentsProcessed,
            intentsSucceeded,
            intentsFailed,
          }
          setLastFlushSummary(summary)
          setLastFlushAt(Date.now())
          refreshLocalSnapshots()
          publishQueueSnapshot('flush_complete')
          trackEvent({
            category: 'sync',
            eventType: 'flush_complete',
            feature: 'pwa_reliability',
            status: 'ok',
            metricValue: intentsSucceeded + telemetrySent,
            summary,
          })
          return summary
        } catch (error) {
          const summary: FlushSummary = {
            ok: false,
            reason: safeErrorMessage(error),
            telemetrySent,
            telemetryDropped,
            intentsProcessed,
            intentsSucceeded,
            intentsFailed,
          }
          setLastFlushSummary(summary)
          refreshLocalSnapshots()
          publishQueueSnapshot('flush_failed')
          trackEvent({
            category: 'sync',
            eventType: 'flush_error',
            feature: 'pwa_reliability',
            severity: 'warning',
            status: 'error',
            message: safeErrorMessage(error),
          })
          return summary
        } finally {
          setIsFlushing(false)
          releaseSyncLock(tabId)
        }
      })()

      flushInFlightRef.current = run
      try {
        return await run
      } finally {
        flushInFlightRef.current = null
      }
    },
    [
      ingestClientOpsMetricsBatch,
      isOnline,
      isSignedIn,
      publishQueueSnapshot,
      refreshLocalSnapshots,
      replayOfflineIntent,
      tabId,
      trackEvent,
    ],
  )

  const enqueueIntentWithSync = useCallback(
    (
      kind: OfflineIntentKind,
      args: Record<string, unknown>,
      metadata?: OfflineIntent['metadata'],
    ) => {
      const row = enqueueOfflineIntent(kind, args, metadata)
      refreshLocalSnapshots()
      publishQueueSnapshot('intent_enqueued')
      trackEvent({
        category: 'offline_queue',
        eventType: 'intent_enqueued',
        feature: 'pwa_reliability',
        status: 'queued',
        message: kind,
        queueIntentId: row.id,
        intentKind: kind,
      })
      void registerBackgroundSync('intent_enqueued')
      return row
    },
    [publishQueueSnapshot, refreshLocalSnapshots, registerBackgroundSync, trackEvent],
  )

  const readDraftValue = useCallback(<T,>(key: string, fallback: T) => {
    return readFormDraft<T>(key, fallback)
  }, [])

  const writeDraftValue = useCallback(
    <T,>(key: string, value: T) => {
      writeFormDraft(key, value)
      setDraftRevision((v) => v + 1)
      refreshLocalSnapshots()
      publishQueueSnapshot('draft_saved')
      trackEvent({
        category: 'drafts',
        eventType: 'draft_saved',
        feature: 'forms',
        status: 'ok',
        message: key,
      })
    },
    [publishQueueSnapshot, refreshLocalSnapshots, trackEvent],
  )

  const clearDraftValue = useCallback(
    (key: string) => {
      clearFormDraft(key)
      setDraftRevision((v) => v + 1)
      refreshLocalSnapshots()
      publishQueueSnapshot('draft_cleared')
    },
    [publishQueueSnapshot, refreshLocalSnapshots],
  )

  const clearFailedOfflineIntents = useCallback(() => {
    clearOfflineIntents((row) => row.attempts > 0 && !!row.lastError)
    refreshLocalSnapshots()
    publishQueueSnapshot('failed_intents_cleared')
  }, [publishQueueSnapshot, refreshLocalSnapshots])

  const clearAllOfflineIntents = useCallback(() => {
    clearOfflineIntents()
    refreshLocalSnapshots()
    publishQueueSnapshot('all_intents_cleared')
  }, [publishQueueSnapshot, refreshLocalSnapshots])

  const clearAllDraftsAndRefresh = useCallback(() => {
    clearAllFormDrafts()
    setDraftRevision((v) => v + 1)
    refreshLocalSnapshots()
    publishQueueSnapshot('all_drafts_cleared')
  }, [publishQueueSnapshot, refreshLocalSnapshots])

  useEffect(() => {
    refreshLocalSnapshots()
  }, [refreshLocalSnapshots])

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      trackEvent({
        category: 'network',
        eventType: 'online',
        feature: 'pwa_reliability',
        status: 'ok',
      })
      void flushQueues('window_online')
    }
    const onOffline = () => {
      setIsOnline(false)
      trackEvent({
        category: 'network',
        eventType: 'offline',
        feature: 'pwa_reliability',
        severity: 'warning',
        status: 'offline',
      })
    }
    const onVisibility = () => {
      trackEvent({
        category: 'lifecycle',
        eventType: 'visibility_change',
        feature: 'pwa_reliability',
        status: document.visibilityState,
      })
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void flushQueues('tab_visible')
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flushQueues, trackEvent])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMinuteBucket(Math.floor(Date.now() / 60_000))
      if (navigator.onLine && isSignedIn) {
        void flushQueues('interval_tick')
      }
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [flushQueues, isSignedIn])

  useEffect(() => {
    trackEvent({
      category: 'lifecycle',
      eventType: 'provider_ready',
      feature: 'pwa_reliability',
      status: 'ok',
    })
    publishPwaBusMessage('pwa.session.state', {
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
    })
    void registerBackgroundSync('provider_mount')
    if (navigator.onLine) {
      void flushQueues('provider_mount')
    }
    // mount-only behavior uses latest values intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    publishPwaBusMessage('pwa.session.state', {
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
    })
  }, [isSignedIn, userId])

  useEffect(() => {
    const unsubscribe = subscribePwaBus((message) => {
      if (message.tabId === tabId) return
      if (message.type === 'pwa.queue.updated') {
        refreshLocalSnapshots()
      }
      if (message.type === 'pwa.sync.request' && navigator.onLine) {
        void flushQueues('bus_sync_request')
      }
    })
    return unsubscribe
  }, [flushQueues, refreshLocalSnapshots, tabId])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tag?: string } | null
      if (!data?.type) return
      if (data.type === 'PWA_BG_SYNC_FLUSH') {
        publishPwaBusMessage('pwa.sync.request', { source: 'service_worker', tag: data.tag ?? '' })
        if (navigator.onLine) {
          void flushQueues('service_worker_sync')
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [flushQueues])

  useEffect(() => {
    if (!reminderFeed?.viewerAuthenticated) return
    if (!notificationsSupported()) return
    if (Notification.permission !== 'granted') return
    if (document.visibilityState !== 'hidden') return

    const enabled =
      reminderFeed.preferences.dueRemindersEnabled ||
      reminderFeed.preferences.monthlyCycleAlertsEnabled ||
      reminderFeed.preferences.goalAlertsEnabled
    if (!enabled) return

    const now = Date.now()
    const candidates = reminderFeed.reminders
      .filter((row) => !row.dueAt || row.dueAt <= now + 3 * 24 * 60 * 60 * 1000)
      .slice(0, 3)

    if (candidates.length === 0) return

    for (const reminder of candidates) {
      const dedupeKey = `reminder:${reminder.dedupeKey}`
      if (!claimReminderDedupeKey(dedupeKey)) continue
      void postServiceWorkerNotification({
        title: reminder.title,
        body: reminder.body,
        route: reminder.route,
        tag: `finance-reminder-${reminder.kind}-${reminder.id}`,
        data: {
          route: reminder.route,
          reminderId: reminder.id,
          reminderKind: reminder.kind,
          severity: reminder.severity,
        },
      }).then((sent) => {
        if (sent) {
          trackEvent({
            category: 'notifications',
            eventType: 'reminder_notification_sent',
            feature: 'phase7_reminders',
            status: 'sent',
            message: reminder.kind,
            reminderId: reminder.id,
            dedupeKey: reminder.dedupeKey,
          })
        }
      })
    }
  }, [reminderFeed, trackEvent])

  const contextValue = useMemo<PwaReliabilityContextValue>(
    () => ({
      tabId,
      isOnline,
      isFlushing,
      lastFlushAt,
      lastFlushSummary,
      notificationsSupported: notificationsSupported(),
      backgroundSyncSupported: backgroundSyncSupported(),
      notificationPermission: notificationsSupported()
        ? Notification.permission
        : 'unsupported',
      reminderFeed,
      offlineIntents,
      telemetryQueueCount,
      formDraftSummaries,
      draftRevision,
      requestNotificationPermission,
      sendTestNotification,
      flushQueues,
      registerBackgroundSync,
      enqueueIntent: enqueueIntentWithSync,
      clearFailedOfflineIntents,
      clearAllOfflineIntents,
      clearAllFormDrafts: clearAllDraftsAndRefresh,
      trackEvent,
      claimSharedToastKey,
      readDraftValue,
      writeDraftValue,
      clearDraftValue,
    }),
    [
      tabId,
      isOnline,
      isFlushing,
      lastFlushAt,
      lastFlushSummary,
      reminderFeed,
      offlineIntents,
      telemetryQueueCount,
      formDraftSummaries,
      draftRevision,
      requestNotificationPermission,
      sendTestNotification,
      flushQueues,
      registerBackgroundSync,
      enqueueIntentWithSync,
      clearFailedOfflineIntents,
      clearAllOfflineIntents,
      clearAllDraftsAndRefresh,
      trackEvent,
      claimSharedToastKey,
      readDraftValue,
      writeDraftValue,
      clearDraftValue,
    ],
  )

  return (
    <PwaReliabilityContext.Provider value={contextValue}>
      {children}
    </PwaReliabilityContext.Provider>
  )
}

export function usePwaReliability() {
  const context = useContext(PwaReliabilityContext)
  if (!context) {
    throw new Error('usePwaReliability must be used within PwaReliabilityProvider')
  }
  return context
}

export function useOfflineFormDraft<T>(
  key: string,
  createDefaultValue: () => T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { draftRevision, readDraftValue, writeDraftValue, clearDraftValue } = usePwaReliability()

  const [value, setValueState] = useState<T>(() => readDraftValue(key, createDefaultValue()))

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValueState(readDraftValue(key, createDefaultValue()))
  }, [createDefaultValue, draftRevision, key, readDraftValue])

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (nextValue) => {
      setValueState((previous) => {
        const resolved =
          typeof nextValue === 'function'
            ? (nextValue as (prev: T) => T)(previous)
            : nextValue
        writeDraftValue(key, resolved)
        return resolved
      })
    },
    [key, writeDraftValue],
  )

  const resetValue = useCallback(() => {
    clearDraftValue(key)
    setValueState(createDefaultValue())
  }, [clearDraftValue, createDefaultValue, key])

  return [value, setValue, resetValue]
}
