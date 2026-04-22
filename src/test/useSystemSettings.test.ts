import { describe, it, expect } from 'vitest'
import { parseSettingsRows } from '@/lib/useSystemSettings'

const defaultRows = [
  { key: 'currency',           value: 'EUR' },
  { key: 'unit_system',        value: 'metric' },
  { key: 'date_format',        value: 'DD/MM/YYYY' },
  { key: 'wholesale_margin_1', value: '35' },
  { key: 'wholesale_margin_2', value: '40' },
  { key: 'wholesale_margin_3', value: '45' },
  { key: 'vending_margin_1',   value: '50' },
  { key: 'vending_margin_2',   value: '60' },
  { key: 'vending_margin_3',   value: '65' },
]

describe('parseSettingsRows', () => {
  it('parses currency and derives EUR symbol', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.currency).toBe('EUR')
    expect(s.currencySymbol).toBe('€')
  })

  it('parses wholesale margins as numbers', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.wholesaleMargins).toEqual([35, 40, 45])
  })

  it('parses vending margins as numbers', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.vendingMargins).toEqual([50, 60, 65])
  })

  it('parses unit system', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.unitSystem).toBe('metric')
  })

  it('falls back to EUR/metric when rows are missing', () => {
    const s = parseSettingsRows([])
    expect(s.currency).toBe('EUR')
    expect(s.unitSystem).toBe('metric')
    expect(s.wholesaleMargins).toEqual([35, 40, 45])
  })

  it('accepts GBP and derives £ symbol', () => {
    const rows = [{ key: 'currency', value: 'GBP' }]
    const s = parseSettingsRows(rows)
    expect(s.currencySymbol).toBe('£')
  })
})
