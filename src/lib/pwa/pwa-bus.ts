type PwaBusEnvelope = {
  id: string
  at: number
  tabId: string
  type: string
  payload?: Record<string, unknown>
}

const CHANNEL_NAME = 'finance-os-pwa-bus-v1'
const STORAGE_EVENT_KEY = 'finance-os-pwa-bus-event'
const TAB_ID_STORAGE_KEY = 'finance-os-pwa-tab-id'

let sharedChannel: BroadcastChannel | null = null

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

export function getPwaBusTabId() {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_STORAGE_KEY)
    if (existing) return existing
    const next = `tab-${randomId()}`
    window.sessionStorage.setItem(TAB_ID_STORAGE_KEY, next)
    return next
  } catch {
    return `tab-${randomId()}`
  }
}

function getBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  if (sharedChannel) return sharedChannel
  sharedChannel = new BroadcastChannel(CHANNEL_NAME)
  return sharedChannel
}

function parseEnvelope(value: unknown): PwaBusEnvelope | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<PwaBusEnvelope>
  if (typeof candidate.type !== 'string') return null
  if (typeof candidate.tabId !== 'string') return null
  if (typeof candidate.id !== 'string') return null
  if (typeof candidate.at !== 'number') return null
  return {
    id: candidate.id,
    at: candidate.at,
    tabId: candidate.tabId,
    type: candidate.type,
    payload:
      typeof candidate.payload === 'object' && candidate.payload !== null
        ? (candidate.payload as Record<string, unknown>)
        : undefined,
  }
}

export function publishPwaBusMessage(
  type: string,
  payload?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return
  const envelope: PwaBusEnvelope = {
    id: randomId(),
    at: Date.now(),
    tabId: getPwaBusTabId(),
    type,
    payload,
  }

  const channel = getBroadcastChannel()
  if (channel) {
    channel.postMessage(envelope)
  } else {
    try {
      window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(envelope))
      window.localStorage.removeItem(STORAGE_EVENT_KEY)
    } catch {
      // Ignore storage write failures.
    }
  }
}

export function subscribePwaBus(
  callback: (message: PwaBusEnvelope) => void,
) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return
    try {
      const parsed = parseEnvelope(JSON.parse(event.newValue))
      if (parsed) callback(parsed)
    } catch {
      // Ignore malformed storage messages.
    }
  }

  const channel = getBroadcastChannel()
  const onChannelMessage = (event: MessageEvent<unknown>) => {
    const parsed = parseEnvelope(event.data)
    if (parsed) callback(parsed)
  }

  window.addEventListener('storage', onStorage)
  channel?.addEventListener('message', onChannelMessage)

  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onChannelMessage)
  }
}

export type { PwaBusEnvelope }
