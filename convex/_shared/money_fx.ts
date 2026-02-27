export type FxMap = Map<string, { rate: number; synthetic: boolean; asOfMs: number; source: string }>

export type PostedFxSnapshot = {
  baseCurrency: string
  nativeCurrency: string
  nativeAmount: number
  nativeAmountMinor: string
  nativeCurrencyFractionDigits: number
  baseAmount: number
  baseAmountMinor: string
  baseCurrencyFractionDigits: number
  fxRateNativeToBase: number
  fxAsOfMs: number
  fxSource: string
  fxSynthetic: boolean
}

export function numberOr(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function normalizeCurrencyCode(value: unknown, fallback = 'USD') {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(raw)) return fallback
  return raw
}

export function currencyFractionDigits(currency: string) {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: normalizeCurrencyCode(currency),
    }).resolvedOptions()
    return clampInt(numberOr(parts.maximumFractionDigits, 2), 0, 8)
  } catch {
    return 2
  }
}

export function buildFractionDigitsByCurrency(rows: Array<Record<string, unknown>>) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const code = normalizeCurrencyCode(row.code)
    const digits = clampInt(numberOr(row.fractionDigits, currencyFractionDigits(code)), 0, 8)
    map.set(code, digits)
  }
  return map
}

export function buildFxMapFromRateRows(rows: Array<Record<string, unknown>>): FxMap {
  const fxMap: FxMap = new Map()
  for (const row of rows) {
    if (normalizeCurrencyCode(row.baseCurrency) !== 'USD') continue
    const quoteCurrency = normalizeCurrencyCode(row.quoteCurrency)
    fxMap.set(quoteCurrency, {
      rate: numberOr(row.rate, 1),
      synthetic: Boolean(row.synthetic),
      asOfMs: Math.trunc(numberOr(row.asOfMs, Date.now())),
      source: typeof row.source === 'string' && row.source.trim() ? row.source : 'unknown',
    })
  }
  if (!fxMap.has('USD')) {
    fxMap.set('USD', {
      rate: 1,
      synthetic: false,
      asOfMs: Date.now(),
      source: 'identity',
    })
  }
  return fxMap
}

export function buildPostedFxSnapshot({
  amount,
  currency,
  baseCurrency,
  postedAt,
  fxMap,
  fractionDigitsByCurrency,
}: {
  amount: number
  currency: string
  baseCurrency: string
  postedAt: number
  fxMap: FxMap
  fractionDigitsByCurrency: Map<string, number>
}): PostedFxSnapshot {
  const nativeCurrency = normalizeCurrencyCode(currency)
  const targetBaseCurrency = normalizeCurrencyCode(baseCurrency)
  const nativeDigits = fractionDigitsFor(nativeCurrency, fractionDigitsByCurrency)
  const baseDigits = fractionDigitsFor(targetBaseCurrency, fractionDigitsByCurrency)
  const normalizedAmount = roundForCurrency(amount, nativeCurrency, fractionDigitsByCurrency)
  const rateSpec = resolveConversionRate(nativeCurrency, targetBaseCurrency, fxMap)
  const baseAmount = roundForCurrency(
    normalizedAmount * rateSpec.rate,
    targetBaseCurrency,
    fractionDigitsByCurrency,
  )

  return {
    baseCurrency: targetBaseCurrency,
    nativeCurrency,
    nativeAmount: normalizedAmount,
    nativeAmountMinor: toMinor(normalizedAmount, nativeCurrency, fractionDigitsByCurrency).toString(),
    nativeCurrencyFractionDigits: nativeDigits,
    baseAmount,
    baseAmountMinor: toMinor(baseAmount, targetBaseCurrency, fractionDigitsByCurrency).toString(),
    baseCurrencyFractionDigits: baseDigits,
    fxRateNativeToBase: rateSpec.rate,
    fxAsOfMs: rateSpec.asOfMs ?? postedAt,
    fxSource: rateSpec.source,
    fxSynthetic: rateSpec.synthetic,
  }
}

export function roundForCurrency(
  amount: number,
  currency: string,
  fractionDigitsByCurrency?: Map<string, number>,
) {
  const digits = fractionDigitsFor(currency, fractionDigitsByCurrency)
  const factor = 10 ** digits
  return Math.round(amount * factor) / factor
}

export function toMinor(
  amount: number,
  currency: string,
  fractionDigitsByCurrency?: Map<string, number>,
) {
  const digits = fractionDigitsFor(currency, fractionDigitsByCurrency)
  const factor = 10 ** digits
  return BigInt(Math.round(amount * factor))
}

function fractionDigitsFor(currency: string, map?: Map<string, number>) {
  const code = normalizeCurrencyCode(currency)
  return clampInt(numberOr(map?.get(code), currencyFractionDigits(code)), 0, 8)
}

function resolveConversionRate(from: string, to: string, fxMap: FxMap) {
  const source = normalizeCurrencyCode(from)
  const target = normalizeCurrencyCode(to)
  if (source === target) {
    return { rate: 1, synthetic: false, asOfMs: Date.now(), source: 'identity' }
  }
  if (source === 'USD') {
    const targetSpec = fxMap.get(target)
    if (!targetSpec || !Number.isFinite(targetSpec.rate) || targetSpec.rate <= 0) {
      return { rate: 1, synthetic: true, asOfMs: Date.now(), source: 'fallback' }
    }
    return targetSpec
  }
  if (target === 'USD') {
    const sourceSpec = fxMap.get(source)
    if (!sourceSpec || !Number.isFinite(sourceSpec.rate) || sourceSpec.rate <= 0) {
      return { rate: 1, synthetic: true, asOfMs: Date.now(), source: 'fallback' }
    }
    return {
      rate: 1 / sourceSpec.rate,
      synthetic: sourceSpec.synthetic,
      asOfMs: sourceSpec.asOfMs,
      source: sourceSpec.source,
    }
  }
  const usdToSource = fxMap.get(source)
  const usdToTarget = fxMap.get(target)
  if (!usdToSource || !usdToTarget || usdToSource.rate <= 0 || usdToTarget.rate <= 0) {
    return { rate: 1, synthetic: true, asOfMs: Date.now(), source: 'fallback' }
  }
  return {
    rate: usdToTarget.rate / usdToSource.rate,
    synthetic: Boolean(usdToSource.synthetic || usdToTarget.synthetic),
    asOfMs: Math.min(usdToSource.asOfMs, usdToTarget.asOfMs),
    source:
      usdToSource.source === usdToTarget.source
        ? usdToSource.source
        : `${usdToSource.source}|${usdToTarget.source}`,
  }
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}
