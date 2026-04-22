import { describe, it, expect } from 'vitest'
import { searchSlots } from '@/lib/slotSearch'
import type { SearchableSlot } from '@/lib/slotSearch'

const make = (id: string, code: string, name: string, rack = '40'): SearchableSlot => ({
  id,
  bin_address: `${rack} A0${id}`,
  rack_name: rack,
  slot_state: 'brand_allocated',
  brand: { brand_code: code, brand_name: name },
})

const slots: SearchableSlot[] = [
  make('1', '6325', 'Coke Zero Can 330ml'),
  make('2', '6326', 'Coke Original Can 330ml'),
  make('3', '126',  'Squeez Apple Juice Cart'),
  make('4', '127',  'Squeez Orange Juice'),
  make('5', '7080', 'Hypo Hydrate Tetra'),
]
const emptySlot: SearchableSlot = {
  id: '6', bin_address: '40 B01', rack_name: '40',
  slot_state: 'empty', brand: null,
}

describe('searchSlots — query vazia', () => {
  it('retorna [] para string vazia', () => {
    expect(searchSlots(slots, '')).toHaveLength(0)
  })
  it('retorna [] para só espaços', () => {
    expect(searchSlots(slots, '   ')).toHaveLength(0)
  })
})

describe('searchSlots — filtragem', () => {
  it('ignora slots não-alocados', () => {
    const results = searchSlots([...slots, emptySlot], 'coke')
    expect(results.every(r => r.slotId !== '6')).toBe(true)
    expect(results).toHaveLength(2)
  })
  it('encontra por brand_code', () => {
    const results = searchSlots(slots, '6325')
    expect(results).toHaveLength(1)
    expect(results[0].brandCode).toBe('6325')
  })
  it('encontra por brand_name (contains)', () => {
    const results = searchSlots(slots, 'juice')
    expect(results).toHaveLength(2)
  })
  it('é case-insensitive', () => {
    expect(searchSlots(slots, 'COKE')).toHaveLength(2)
    expect(searchSlots(slots, 'coke')).toHaveLength(2)
  })
})

describe('searchSlots — prefix-priority', () => {
  it('prefix-match aparece antes de contains-match', () => {
    // '63' é prefix de 6325 e 6326; 'Squeez' contém '6' mas não começa
    const results = searchSlots(slots, '63')
    expect(results[0].brandCode).toBe('6325')
    expect(results[1].brandCode).toBe('6326')
  })
  it('cada grupo ordenado por brand_code numérico', () => {
    const results = searchSlots(slots, 'squeez')
    // ambos são contains (não há prefix 'squeez' em codes); ordenados: 126, 127
    expect(results[0].brandCode).toBe('126')
    expect(results[1].brandCode).toBe('127')
  })
})

describe('searchSlots — maxResults', () => {
  it('respeita maxResults', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      make(String(i), String(1000 + i), `Brand ${i}`)
    )
    expect(searchSlots(many, 'brand', 5)).toHaveLength(5)
  })
  it('default maxResults é 10', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      make(String(i), String(1000 + i), `Brand ${i}`)
    )
    expect(searchSlots(many, 'brand')).toHaveLength(10)
  })
})
