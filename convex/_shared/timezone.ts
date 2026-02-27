export type TimeZoneDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

export function normalizeTimeZone(value: unknown, fallback = 'UTC') {
  const candidate =
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone
  } catch {
    return fallback
  }
}

export function timeZonePartsAt(timestampMs: number, timeZone: string): TimeZoneDateParts {
  const formatter = getFormatter(normalizeTimeZone(timeZone))
  const parts = formatter.formatToParts(new Date(timestampMs))
  const numeric = (type: Intl.DateTimeFormatPartTypes) => {
    const value = Number(parts.find((part) => part.type === type)?.value ?? 0)
    return Number.isFinite(value) ? value : 0
  }
  return {
    year: numeric('year'),
    month: numeric('month'),
    day: numeric('day'),
    hour: numeric('hour'),
    minute: numeric('minute'),
    second: numeric('second'),
  }
}

export function ymdInTimeZone(timestampMs: number, timeZone: string) {
  const parts = timeZonePartsAt(timestampMs, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function cycleKeyFromTimestampInTimeZone(timestampMs: number, timeZone: string) {
  const parts = timeZonePartsAt(timestampMs, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`
}

export function scheduledDueAtForCurrentMonthInTimeZone(
  nowMs: number,
  dueDay: number,
  timeZone: string,
  hour = 9,
  minute = 0,
) {
  const tz = normalizeTimeZone(timeZone)
  const nowParts = timeZonePartsAt(nowMs, tz)
  return zonedDateTimeToUtcMs(
    {
      year: nowParts.year,
      month: nowParts.month,
      day: clampDayForMonth(nowParts.year, nowParts.month, dueDay),
      hour,
      minute,
      second: 0,
    },
    tz,
  )
}

export function nextDueAtFromDayInTimeZone(
  nowMs: number,
  dueDay: number,
  timeZone: string,
  hour = 9,
  minute = 0,
) {
  const tz = normalizeTimeZone(timeZone)
  const current = scheduledDueAtForCurrentMonthInTimeZone(nowMs, dueDay, tz, hour, minute)
  if (current >= nowMs) return current
  const nowParts = timeZonePartsAt(nowMs, tz)
  const { year, month } = addMonth(nowParts.year, nowParts.month, 1)
  return zonedDateTimeToUtcMs(
    {
      year,
      month,
      day: clampDayForMonth(year, month, dueDay),
      hour,
      minute,
      second: 0,
    },
    tz,
  )
}

export function nextMonthlyRunAtInTimeZone(
  nowMs: number,
  config: { day: number; hour: number; minute: number },
  timeZone: string,
) {
  const tz = normalizeTimeZone(timeZone)
  const nowParts = timeZonePartsAt(nowMs, tz)
  const current = zonedDateTimeToUtcMs(
    {
      year: nowParts.year,
      month: nowParts.month,
      day: clampDayForMonth(nowParts.year, nowParts.month, config.day),
      hour: config.hour,
      minute: config.minute,
      second: 0,
    },
    tz,
  )
  if (current >= nowMs) return current
  const next = addMonth(nowParts.year, nowParts.month, 1)
  return zonedDateTimeToUtcMs(
    {
      year: next.year,
      month: next.month,
      day: clampDayForMonth(next.year, next.month, config.day),
      hour: config.hour,
      minute: config.minute,
      second: 0,
    },
    tz,
  )
}

export function zonedDateTimeToUtcMs(
  value: {
    year: number
    month: number // 1-based
    day: number
    hour?: number
    minute?: number
    second?: number
    millisecond?: number
  },
  timeZone: string,
) {
  const tz = normalizeTimeZone(timeZone)
  const hour = Math.max(0, Math.min(23, Math.trunc(value.hour ?? 0)))
  const minute = Math.max(0, Math.min(59, Math.trunc(value.minute ?? 0)))
  const second = Math.max(0, Math.min(59, Math.trunc(value.second ?? 0)))
  const millisecond = Math.max(0, Math.min(999, Math.trunc(value.millisecond ?? 0)))
  const day = clampDayForMonth(value.year, value.month, value.day)

  const localAsUtc = Date.UTC(value.year, value.month - 1, day, hour, minute, second, millisecond)
  let actual = localAsUtc - timeZoneOffsetMsAt(localAsUtc, tz)
  const adjusted = localAsUtc - timeZoneOffsetMsAt(actual, tz)
  if (adjusted !== actual) actual = adjusted
  return actual
}

function getFormatter(timeZone: string) {
  const key = normalizeTimeZone(timeZone)
  const cached = formatterCache.get(key)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: key,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  formatterCache.set(key, formatter)
  return formatter
}

function timeZoneOffsetMsAt(timestampMs: number, timeZone: string) {
  const date = new Date(timestampMs)
  const utcSecondPrecision = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    0,
  )
  const localParts = timeZonePartsAt(timestampMs, timeZone)
  const localAsUtc = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
    0,
  )
  return localAsUtc - utcSecondPrecision
}

function clampDayForMonth(year: number, month1: number, day: number) {
  const normalizedDay = Math.max(1, Math.trunc(day))
  const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate()
  return Math.min(lastDay, normalizedDay)
}

function addMonth(year: number, month1: number, delta: number) {
  const zeroBased = (month1 - 1) + delta
  const nextYear = year + Math.floor(zeroBased / 12)
  const nextMonthZero = ((zeroBased % 12) + 12) % 12
  return { year: nextYear, month: nextMonthZero + 1 }
}
