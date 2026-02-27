export function normalizeCurrencyCode(code?: string | null) {
  const next = code?.trim().toUpperCase()
  return next && next.length >= 3 ? next : 'USD'
}

export function safeLocale(locale?: string | null) {
  try {
    return new Intl.NumberFormat(locale || 'en-US').resolvedOptions().locale
  } catch {
    return 'en-US'
  }
}

function makeFormatter(
  locale: string,
  currency: string,
  options: Intl.NumberFormatOptions,
) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...options,
    })
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      ...options,
    })
  }
}

export function createCurrencyFormatters(locale?: string | null, currency?: string | null) {
  const normalizedLocale = safeLocale(locale)
  const normalizedCurrency = normalizeCurrencyCode(currency)

  const compactCurrency = makeFormatter(normalizedLocale, normalizedCurrency, {
    maximumFractionDigits: 0,
    notation: 'compact',
  })

  const wholeCurrency = makeFormatter(normalizedLocale, normalizedCurrency, {
    maximumFractionDigits: 0,
  })

  const money = makeFormatter(normalizedLocale, normalizedCurrency, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const formatSignedAmount = (value: number) =>
    `${value >= 0 ? '+' : '-'}${money.format(Math.abs(value))}`

  return {
    locale: normalizedLocale,
    currency: normalizedCurrency,
    compactCurrency,
    wholeCurrency,
    money,
    formatSignedAmount,
  }
}

