import { describe, it, expect } from 'vitest'
import { searchBrands } from '@/lib/brandSearch'

const allocMap = new Map([
  ['id-1', ['57 A01']],
  ['id-3', ['40 B02', '41 C01']],
])

const brands = [
  { id: 'id-1', brand_code: '1073', brand_name: 'AERO Milk Chocolate Bar 36g' },
  { id: 'id-2', brand_code: '1074', brand_name: 'Aero Peppermint Mint' },
  { id: 'id-3', brand_code: '9711', brand_name: 'Flahavans Oaty Flapjacks' },
  { id: 'id-4', brand_code: '45',   brand_name: 'AERO Peppermint Mint Chocolate Bar' },
]

describe('searchBrands', () => {
  it('returns empty array for empty query', () => {
    expect(searchBrands(brands, '', allocMap)).toEqual([])
    expect(searchBrands(brands, '   ', allocMap)).toEqual([])
  })

  it('matches by brand_code prefix first', () => {
    const results = searchBrands(brands, '107', allocMap)
    expect(results[0].brandCode).toBe('1073')
    expect(results[1].brandCode).toBe('1074')
  })

  it('matches by brand_name contains', () => {
    const results = searchBrands(brands, 'aero', allocMap)
    // code prefix matches (1073, 1074, 45) come before name-only contains
    const codes = results.map(r => r.brandCode)
    expect(codes).toContain('1073')
    expect(codes).toContain('1074')
    expect(codes).toContain('45')
  })

  it('prefix matches come before contains matches', () => {
    const results = searchBrands(brands, '107', allocMap)
    expect(results.every(r => r.brandCode.startsWith('107'))).toBe(true)
  })

  it('sorts prefix group by brand_code numeric', () => {
    const results = searchBrands(brands, '107', allocMap)
    expect(results[0].brandCode).toBe('1073')
    expect(results[1].brandCode).toBe('1074')
  })

  it('includes binAddress from allocMap when allocated', () => {
    const results = searchBrands(brands, '1073', allocMap)
    expect(results[0].binAddress).toBe('57 A01')
  })

  it('returns empty binAddress when not allocated', () => {
    const results = searchBrands(brands, '1074', allocMap)
    expect(results[0].binAddress).toBe('')
  })

  it('joins multiple bin addresses with " / "', () => {
    const results = searchBrands(brands, '9711', allocMap)
    expect(results[0].binAddress).toBe('40 B02 / 41 C01')
  })

  it('respects maxResults limit', () => {
    const results = searchBrands(brands, 'a', allocMap, 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('is case-insensitive', () => {
    expect(searchBrands(brands, 'AERO', allocMap).length).toBeGreaterThan(0)
    expect(searchBrands(brands, 'aero', allocMap).length).toBeGreaterThan(0)
  })
})
