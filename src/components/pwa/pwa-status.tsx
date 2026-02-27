import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { usePwaReliability } from '@/components/pwa/pwa-reliability-provider'
import { toast } from 'sonner'

type PwaUpdateStatus = {
  ready: boolean
  version: number
  buildId?: string
  releaseName?: string
  summary?: string
  highlights?: string[]
  publishedAt?: string
}

const PWA_UPDATE_STATUS_STORAGE_KEY = 'finance-pwa-update-status'
const PWA_UPDATE_STATUS_EVENT = 'finance:pwa-update-status'

function parseStoredPwaUpdateStatus(raw: string | null): PwaUpdateStatus {
  if (!raw) return { ready: false, version: 0, highlights: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { ready: false, version: 0, highlights: [] }
    }
    const ready = parsed && 'ready' in parsed ? Boolean(parsed.ready) : false
    const version =
      parsed && 'version' in parsed && Number.isFinite(Number(parsed.version))
        ? Number(parsed.version)
        : 0
    const buildId =
      parsed && 'buildId' in parsed && typeof parsed.buildId === 'string'
        ? parsed.buildId.trim()
        : undefined
    const releaseName =
      parsed && 'releaseName' in parsed && typeof parsed.releaseName === 'string'
        ? parsed.releaseName.trim()
        : undefined
    const summary =
      parsed && 'summary' in parsed && typeof parsed.summary === 'string'
        ? parsed.summary.trim()
        : undefined
    const highlights =
      parsed && 'highlights' in parsed && Array.isArray(parsed.highlights)
        ? parsed.highlights
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
    const publishedAt =
      parsed && 'publishedAt' in parsed && typeof parsed.publishedAt === 'string'
        ? parsed.publishedAt.trim()
        : undefined
    return {
      ready,
      version,
      buildId,
      releaseName,
      summary,
      highlights,
      publishedAt,
    }
  } catch {
    return { ready: false, version: 0, highlights: [] }
  }
}

async function fetchLatestReleaseMetadata() {
  if (typeof window === 'undefined') {
    return {
      buildId: undefined,
      releaseName: undefined,
      summary: undefined,
      highlights: [] as string[],
      publishedAt: undefined,
    }
  }

  try {
    const response = await fetch('/version.json', {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload = (await response.json()) as unknown
    if (!payload || typeof payload !== 'object') {
      return {
        buildId: undefined,
        releaseName: undefined,
        summary: undefined,
        highlights: [] as string[],
        publishedAt: undefined,
      }
    }
    const typed = payload as {
      buildId?: unknown
      releaseName?: unknown
      summary?: unknown
      highlights?: unknown
      publishedAt?: unknown
    }
    return {
      buildId:
        typeof typed.buildId === 'string' && typed.buildId.trim()
          ? typed.buildId.trim()
          : undefined,
      releaseName:
        typeof typed.releaseName === 'string' && typed.releaseName.trim()
          ? typed.releaseName.trim()
          : undefined,
      summary:
        typeof typed.summary === 'string' && typed.summary.trim()
          ? typed.summary.trim()
          : undefined,
      highlights: Array.isArray(typed.highlights)
        ? typed.highlights
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
      publishedAt:
        typeof typed.publishedAt === 'string' && typed.publishedAt.trim()
          ? typed.publishedAt.trim()
          : undefined,
    }
  } catch {
    return {
      buildId: undefined,
      releaseName: undefined,
      summary: undefined,
      highlights: [] as string[],
      publishedAt: undefined,
    }
  }
}

function writePwaUpdateStatus(
  ready: boolean,
  details?: Partial<Omit<PwaUpdateStatus, 'ready' | 'version'>>,
): PwaUpdateStatus {
  if (typeof window === 'undefined') {
    return {
      ready,
      version: ready ? Date.now() : 0,
      buildId: details?.buildId,
      releaseName: details?.releaseName,
      summary: details?.summary,
      highlights: details?.highlights ?? [],
      publishedAt: details?.publishedAt,
    }
  }

  const current = parseStoredPwaUpdateStatus(
    window.localStorage.getItem(PWA_UPDATE_STATUS_STORAGE_KEY),
  )
  const next: PwaUpdateStatus = {
    ready,
    version: ready ? (current.ready ? current.version : Date.now()) : current.version,
    buildId: ready ? details?.buildId : undefined,
    releaseName: ready ? details?.releaseName : undefined,
    summary: ready ? details?.summary : undefined,
    highlights: ready ? details?.highlights ?? [] : [],
    publishedAt: ready ? details?.publishedAt : undefined,
  }

  try {
    window.localStorage.setItem(PWA_UPDATE_STATUS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures.
  }

  window.dispatchEvent(
    new CustomEvent<PwaUpdateStatus>(PWA_UPDATE_STATUS_EVENT, {
      detail: next,
    }),
  )

  return next
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }
}

export function usePwaInstallPrompt() {
  const { claimSharedToastKey, trackEvent } = usePwaReliability()
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const installToastId = 'pwa-install-available'
  const promptInstall = useCallback(async () => {
    const promptEvent = deferredPromptRef.current
    if (!promptEvent) {
      trackEvent({
        category: 'pwa',
        eventType: 'install_prompt_unavailable',
        feature: 'install_prompt',
        severity: 'warning',
        status: 'unavailable',
      })
      if (claimSharedToastKey('pwa-install-unavailable', 10_000)) {
        toast('Install unavailable', {
          description:
            'This browser session does not currently expose a PWA install prompt. Try the browser menu (Add to Home Screen / Install app).',
        })
      }
      return false
    }

    setIsInstalling(true)
    toast.dismiss(installToastId)
    try {
      trackEvent({
        category: 'pwa',
        eventType: 'install_prompt_opened',
        feature: 'install_prompt',
        status: 'started',
      })
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      deferredPromptRef.current = null
      setDeferredPrompt(null)

      if (choice.outcome === 'accepted') {
        trackEvent({
          category: 'pwa',
          eventType: 'install_prompt_result',
          feature: 'install_prompt',
          status: 'accepted',
          message: choice.platform,
        })
        toast.success('Installing Finance OS', {
          description: 'The browser install dialog was accepted. Finalizing setup...',
        })
        return true
      }

      trackEvent({
        category: 'pwa',
        eventType: 'install_prompt_result',
        feature: 'install_prompt',
        status: 'dismissed',
        message: choice.platform,
      })
      toast('Install dismissed', {
        description: 'You can install later from the header button or app menu.',
      })
      return false
    } finally {
      setIsInstalling(false)
    }
  }, [claimSharedToastKey, trackEvent])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const installEvent = event as BeforeInstallPromptEvent
      deferredPromptRef.current = installEvent
      setDeferredPrompt(installEvent)
      trackEvent({
        category: 'pwa',
        eventType: 'beforeinstallprompt',
        feature: 'install_prompt',
        status: 'available',
      })

      if (claimSharedToastKey('pwa-install-available', 20_000)) {
        toast('Install Finance OS', {
          id: installToastId,
          duration: 20000,
          description:
            'Install this dashboard as a professional app experience with offline support and faster launch.',
          action: {
            label: 'Install',
            onClick: () => {
              void promptInstall()
            },
          },
          cancel: {
            label: 'Later',
            onClick: () => {},
          },
        })
      }
    }

    const onAppInstalled = () => {
      setInstalled(true)
      deferredPromptRef.current = null
      setDeferredPrompt(null)
      toast.dismiss(installToastId)
      trackEvent({
        category: 'pwa',
        eventType: 'appinstalled',
        feature: 'install_prompt',
        status: 'installed',
      })
      if (claimSharedToastKey('pwa-app-installed', 30_000)) {
        toast.success('App installed', {
          description: 'Modern Finance Dashboard is now available from your home screen.',
        })
      }
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [claimSharedToastKey, promptInstall, trackEvent])

  return {
    canInstall: Boolean(deferredPrompt) && !installed,
    isInstalling,
    promptInstall,
    isInstalled: installed,
  }
}

export function PwaUpdateNotifier() {
  const { claimSharedToastKey, trackEvent } = usePwaReliability()
  const shownOfflineToast = useRef(false)
  const shownUpdateToast = useRef(false)
  const updateToastId = 'pwa-update-available'
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null)

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      setSwRegistration(registration ?? null)
    },
    onRegisterError(error) {
      console.error('PWA registration error', error)
    },
  })

  useEffect(() => {
    if (!offlineReady || shownOfflineToast.current) {
      return
    }

    shownOfflineToast.current = true
    trackEvent({
      category: 'pwa',
      eventType: 'offline_ready',
      feature: 'service_worker',
      status: 'ok',
    })
    if (claimSharedToastKey('pwa-offline-ready', 60_000)) {
      toast.success('Offline mode ready', {
        description: 'Core dashboard assets are cached for a resilient PWA experience.',
      })
    }
  }, [claimSharedToastKey, offlineReady, trackEvent])

  const applyUpdate = useCallback(async () => {
    trackEvent({
      category: 'pwa',
      eventType: 'update_apply_clicked',
      feature: 'service_worker',
      status: 'started',
    })
    toast.dismiss(updateToastId)
    try {
      await updateServiceWorker(true)
    } catch (error) {
      console.error('Failed to apply service worker update', error)
      trackEvent({
        category: 'pwa',
        eventType: 'update_apply_failed',
        feature: 'service_worker',
        status: 'failed',
      })
      if (claimSharedToastKey('pwa-update-apply-failed', 30_000)) {
        toast.error('Update failed', {
          description: 'Could not apply the update right now. Try refreshing manually.',
        })
      }
    }
  }, [claimSharedToastKey, trackEvent, updateServiceWorker])

  useEffect(() => {
    if (!swRegistration) return
    let mounted = true
    const checkForUpdate = async (reason: string) => {
      if (!mounted) return
      try {
        await swRegistration.update()
      } catch (error) {
        trackEvent({
          category: 'pwa',
          eventType: 'update_check_failed',
          feature: 'service_worker',
          severity: 'warning',
          status: 'error',
          message: `${reason}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    void checkForUpdate('registered')
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void checkForUpdate('interval')
    }, 90_000)
    const onOnline = () => {
      void checkForUpdate('online')
    }
    const onFocus = () => {
      void checkForUpdate('focus')
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate('visible')
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mounted = false
      window.clearInterval(intervalId)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [swRegistration, trackEvent])

  useEffect(() => {
    if (!needRefresh || shownUpdateToast.current) {
      return
    }

    shownUpdateToast.current = true
    let cancelled = false

    void (async () => {
      const metadata = await fetchLatestReleaseMetadata()
      if (cancelled) return
      const status = writePwaUpdateStatus(true, metadata)
      trackEvent({
        category: 'pwa',
        eventType: 'update_available',
        feature: 'service_worker',
        status: 'ready',
      })
      if (claimSharedToastKey('pwa-update-available', 60_000)) {
        const details =
          status.summary ||
          status.highlights?.[0] ||
          'A newer version of the dashboard is ready. Refresh now to apply updates.'
        toast(status.releaseName ? `Update available: ${status.releaseName}` : 'Update available', {
          id: updateToastId,
          duration: Infinity,
          description: details,
          action: {
            label: 'Refresh now',
            onClick: () => {
              void applyUpdate()
            },
          },
          cancel: {
            label: 'Later',
            onClick: () => {
              trackEvent({
                category: 'pwa',
                eventType: 'update_apply_deferred',
                feature: 'service_worker',
                status: 'deferred',
              })
            },
          },
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applyUpdate, claimSharedToastKey, needRefresh, trackEvent])

  useEffect(() => {
    if (needRefresh) return
    writePwaUpdateStatus(false)
    shownUpdateToast.current = false
    toast.dismiss(updateToastId)
  }, [needRefresh])

  return null
}
