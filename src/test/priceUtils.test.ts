import { describe, it, expect } from 'vitest'
import { calcSuggestedPrice, calcUnitPrice, formatPrice } from '@/lib/priceUtils'

describe('calcSuggestedPrice — sales margin formula: cost / (1 - margin%)', () => {
  it('calculates 35% margin correctly', () => {
    expect(calcSuggestedPrice(24, 35)).toBeCloseTo(36.92, 1)
  })

  it('calculates 50% margin correctly', () => {
    expect(calcSuggestedPrice(2, 50)).toBeCloseTo(4.0, 2)
  })

  it('calculates 40% margin correctly', () => {
    expect(calcSuggestedPrice(24, 40)).toBeCloseTo(40.0, 1)
  })

  it('rounds to 2 decimal places', () => {
    const result = calcSuggestedPrice(24, 35)
    expect(result).toBe(36.92)
  })

  it('returns null for 100% margin (division by zero)', () => {
    expect(calcSuggestedPrice(24, 100)).toBeNull()
  })

  it('returns null for margin > 100', () => {
    expect(calcSuggestedPrice(24, 120)).toBeNull()
  })

  it('returns null for negative margin', () => {
    expect(calcSuggestedPrice(24, -10)).toBeNull()
  })
})

describe('calcUnitPrice', () => {
  it('divides SKU price by BPU', () => {
    expect(calcUnitPrice(24, 12)).toBe(2)
  })

  it('returns null when BPU is 0', () => {
    expect(calcUnitPrice(24, 0)).toBeNull()
  })

  it('returns null when price is null', () => {
    expect(calcUnitPrice(null, 12)).toBeNull()
  })

  it('returns null for negative BPU', () => {
    expect(calcUnitPrice(24, -1)).toBeNull()
  })
})

describe('formatPrice', () => {
  it('formats a number with currency symbol', () => {
    expect(formatPrice(24, '€')).toBe('€24.00')
  })

  it('returns em dash for null', () => {
    expect(formatPrice(null, '€')).toBe('—')
  })

  it('formats decimal values', () => {
    expect(formatPrice(36.92, '€')).toBe('€36.92')
  })
})
