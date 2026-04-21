/**
 * Calculates a suggested selling price from a cost using the sales margin formula.
 * Sales margin: margin% = (price - cost) / price × 100
 * Therefore: price = cost / (1 - margin / 100)
 */
export function calcSuggestedPrice(cost: number, marginPct: number): number {
  return parseFloat((cost / (1 - marginPct / 100)).toFixed(2))
}

/**
 * Calculates the price per individual unit given a SKU-level price and units per SKU.
 * Returns null if price is null or BPU is 0 (cannot divide).
 */
export function calcUnitPrice(skuPrice: number | null, bpu: number): number | null {
  if (skuPrice === null || bpu <= 0) return null
  return parseFloat((skuPrice / bpu).toFixed(4))
}

/**
 * Formats a nullable price value for display.
 * Returns '—' for null, otherwise prepends the currency symbol.
 */
export function formatPrice(value: number | null, currencySymbol: string): string {
  if (value === null) return '—'
  return `${currencySymbol}${value.toFixed(2)}`
}
