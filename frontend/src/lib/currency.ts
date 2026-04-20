const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'Fr',
  CAD: 'CA$', AUD: 'A$', SEK: 'kr', NOK: 'kr', DKK: 'kr',
  HKD: 'HK$', SGD: 'S$', NZD: 'NZ$', MXN: 'MX$', BRL: 'R$',
}

export function currencySymbol(code: string): string {
  return SYMBOLS[code?.toUpperCase()] ?? code ?? '?'
}

export function fmtCurrency(val: string | null | undefined, currency: string, decimals = 2): string {
  if (val == null) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  const sym = currencySymbol(currency)
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (n < 0 ? '-' : '') + sym + abs
}
