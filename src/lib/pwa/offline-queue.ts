export type OfflineIntentKind =
  | 'governance.requestUserExport'
  | 'governance.updateConsentSettings'
  | 'governance.requestDeletionJob'
  | 'governance.upsertRetentionPolicy'
  | 'dashboard.recordPurchaseWithLedgerPosting'
  | 'dashboard.upsertCoreFinanceEntity'
  | 'dashboard.deleteCoreFinanceEntity'

export type OfflineIntent = {
  id: string
  kind: OfflineIntentKind
  args: Record<string, unknown>
  createdAt: number
  updatedAt: number
  attempts: number
  lastError: string | null
  metadata?: {
    label?: string
    formDraftKey?: string
    clearDraftOnSuccess?: boolean
  }
}

export type ClientTelemetryEvent = {
  category?: string
  eventType?: string
  severity?: string
  status?: string
  feature?: string
  message?: string
  route?: string
  source?: string
  metricValue?: number
  latencyMs?: number
  createdAt?: number
  [key: string]: unknown
}

export type FormDraftSummary = {
  key: string
  updatedAt: number
  byteSize: number
}

const OFFLINE_INTENTS_KEY = 'finance-os-offline-intents-v1'
const FORM_DRAFTS_KEY = 'finance-os-form-drafts-v1'
const TELEMETRY_BUFFER_KEY = 'finance-os-telemetry-buffer-v1'
const REMINDER_DEDUPE_KEY = 'finance-os-reminder-dedupe-v1'
const TOAST_DEDUPE_KEY = 'finance-os-toast-dedupe-v1'
const SYNC_LOCK_KEY = 'finance-os-sync-lock-v1'

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage
}

function safeReadJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeWriteJson(key: string, value: unknown) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota/storage write failures.
  }
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `q-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

function sanitizeIntent(value: unknown): OfflineIntent | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<OfflineIntent>
  if (typeof candidate.id !== 'string') return null
  if (typeof candidate.kind !== 'string') return null
  if (typeof candidate.args !== 'object' || candidate.args === null) return null
  return {
    id: candidate.id,
    kind: candidate.kind as OfflineIntentKind,
    args: candidate.args as Record<string, unknown>,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : Date.now(),
    attempts: typeof candidate.attempts === 'number' ? candidate.attempts : 0,
    lastError: typeof candidate.lastError === 'string' ? candidate.lastError : null,
    metadata:
      typeof candidate.metadata === 'object' && candidate.metadata !== null
        ? {
            label:
              typeof candidate.metadata.label === 'string'
                ? candidate.metadata.label
                : undefined,
            formDraftKey:
              typeof candidate.metadata.formDraftKey === 'string'
                ? candidate.metadata.formDraftKey
                : undefined,
            clearDraftOnSuccess:
              candidate.metadata.clearDraftOnSuccess === true ? true : undefined,
          }
        : undefined,
  }
}

export function listOfflineIntents() {
  const rows = safeReadJson<unknown[]>(OFFLINE_INTENTS_KEY, [])
  return rows
    .map(sanitizeIntent)
    .filter(Boolean)
    .sort((a, b) => a!.createdAt - b!.createdAt) as OfflineIntent[]
}

function writeOfflineIntents(rows: OfflineIntent[]) {
  safeWriteJson(OFFLINE_INTENTS_KEY, rows)
}

export function enqueueOfflineIntent(
  kind: OfflineIntentKind,
  args: Record<string, unknown>,
  metadata?: OfflineIntent['metadata'],
) {
  const now = Date.now()
  const next: OfflineIntent = {
    id: randomId(),
    kind,
    args,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: null,
    metadata,
  }
  const rows = listOfflineIntents()
  rows.push(next)
  writeOfflineIntents(rows.slice(-200))
  return next
}

export function patchOfflineIntent(
  id: string,
  patch: Partial<Omit<OfflineIntent, 'id' | 'kind' | 'createdAt'>>,
) {
  const rows = listOfflineIntents()
  const index = rows.findIndex((row) => row.id === id)
  if (index < 0) return false
  rows[index] = {
    ...rows[index],
    ...patch,
    updatedAt: Date.now(),
  }
  writeOfflineIntents(rows)
  return true
}

export function removeOfflineIntent(id: string) {
  const rows = listOfflineIntents().filter((row) => row.id !== id)
  writeOfflineIntents(rows)
}

export function clearOfflineIntents(filter?: (row: OfflineIntent) => boolean) {
  const rows = filter ? listOfflineIntents().filter((row) => !filter(row)) : []
  writeOfflineIntents(rows)
}

type StoredDraftRecord = {
  updatedAt: number
  value: unknown
}

function readDraftMap() {
  const raw = safeReadJson<Record<string, StoredDraftRecord>>(FORM_DRAFTS_KEY, {})
  return typeof raw === 'object' && raw !== null ? raw : {}
}

function writeDraftMap(value: Record<string, StoredDraftRecord>) {
  safeWriteJson(FORM_DRAFTS_KEY, value)
}

export function readFormDraft<T>(key: string, fallback: T): T {
  const map = readDraftMap()
  if (!(key in map)) return fallback
  return (map[key]?.value as T) ?? fallback
}

export function writeFormDraft<T>(key: string, value: T) {
  const map = readDraftMap()
  map[key] = {
    updatedAt: Date.now(),
    value,
  }
  writeDraftMap(map)
}

export function clearFormDraft(key: string) {
  const map = readDraftMap()
  if (!(key in map)) return
  delete map[key]
  writeDraftMap(map)
}

export function listFormDraftSummaries(): FormDraftSummary[] {
  const map = readDraftMap()
  return Object.entries(map)
    .map(([key, value]) => ({
      key,
      updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : 0,
      byteSize: safeByteSize(value?.value),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function clearAllFormDrafts() {
  writeDraftMap({})
}

function safeByteSize(value: unknown) {
  try {
    return JSON.stringify(value ?? null).length
  } catch {
    return 0
  }
}

export function listTelemetryBuffer() {
  const rows = safeReadJson<unknown[]>(TELEMETRY_BUFFER_KEY, [])
  return rows.filter((row) => typeof row === 'object' && row !== null) as ClientTelemetryEvent[]
}

function writeTelemetryBuffer(rows: ClientTelemetryEvent[]) {
  safeWriteJson(TELEMETRY_BUFFER_KEY, rows)
}

export function appendTelemetryEvents(events: ClientTelemetryEvent[]) {
  if (events.length === 0) return
  const rows = listTelemetryBuffer()
  rows.push(...events)
  writeTelemetryBuffer(rows.slice(-1000))
}

export function shiftTelemetryEvents(count: number) {
  if (count <= 0) return
  const rows = listTelemetryBuffer()
  writeTelemetryBuffer(rows.slice(Math.max(0, Math.trunc(count))))
}

export function replaceTelemetryBuffer(rows: ClientTelemetryEvent[]) {
  writeTelemetryBuffer(rows.slice(-1000))
}

type DedupeMap = Record<string, number>

function readDedupeMap(key: string): DedupeMap {
  const raw = safeReadJson<Record<string, number>>(key, {})
  return typeof raw === 'object' && raw !== null ? raw : {}
}

function writeDedupeMap(key: string, map: DedupeMap) {
  safeWriteJson(key, map)
}

function cleanupDedupeMap(key: string, ttlMs: number) {
  const now = Date.now()
  const map = readDedupeMap(key)
  const next = Object.fromEntries(
    Object.entries(map).filter(([, at]) => typeof at === 'number' && at > now - ttlMs),
  )
  writeDedupeMap(key, next)
  return next
}

export function claimToastDedupeKey(key: string, ttlMs = 30_000) {
  const now = Date.now()
  const map = cleanupDedupeMap(TOAST_DEDUPE_KEY, ttlMs)
  const existing = map[key]
  if (existing && existing > now - ttlMs) return false
  map[key] = now
  writeDedupeMap(TOAST_DEDUPE_KEY, map)
  return true
}

export function claimReminderDedupeKey(key: string, ttlMs = 14 * 24 * 60 * 60 * 1000) {
  const now = Date.now()
  const map = cleanupDedupeMap(REMINDER_DEDUPE_KEY, ttlMs)
  const existing = map[key]
  if (existing && existing > now - ttlMs) return false
  map[key] = now
  writeDedupeMap(REMINDER_DEDUPE_KEY, map)
  return true
}

type SyncLock = {
  owner: string
  expiresAt: number
}

export function tryAcquireSyncLock(owner: string, ttlMs = 15_000) {
  if (!canUseStorage()) return true
  const now = Date.now()
  const raw = safeReadJson<SyncLock | null>(SYNC_LOCK_KEY, null)
  if (raw && typeof raw === 'object' && raw.expiresAt > now && raw.owner !== owner) {
    return false
  }
  safeWriteJson(SYNC_LOCK_KEY, {
    owner,
    expiresAt: now + ttlMs,
  } satisfies SyncLock)
  return true
}

export function releaseSyncLock(owner: string) {
  if (!canUseStorage()) return
  const raw = safeReadJson<SyncLock | null>(SYNC_LOCK_KEY, null)
  if (!raw || raw.owner !== owner) return
  try {
    window.localStorage.removeItem(SYNC_LOCK_KEY)
  } catch {
    // Ignore storage failures.
  }
}
