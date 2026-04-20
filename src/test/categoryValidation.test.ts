import { describe, it, expect } from 'vitest'
import { shouldResetSubcategory } from '@/lib/categoryValidation'

const cold  = { id: 'cold-id',  parent_id: null }
const hot   = { id: 'hot-id',   parent_id: null }
const cola  = { id: 'cola-id',  parent_id: 'cold-id' }
const juice = { id: 'juice-id', parent_id: 'cold-id' }
const tea   = { id: 'tea-id',   parent_id: 'hot-id'  }

const allCategories = [cold, hot, cola, juice, tea]

describe('shouldResetSubcategory — guard de carregamento', () => {
  it('NÃO apaga quando categories ainda não carregaram (lista vazia)', () => {
    // Este é o bug: categories=[] no mount fazia apagar category1_id válido
    expect(shouldResetSubcategory('cola-id', 'cold-id', [])).toBe(false)
  })

  it('NÃO apaga quando category1_id está vazio', () => {
    expect(shouldResetSubcategory('', 'cold-id', allCategories)).toBe(false)
  })
})

describe('shouldResetSubcategory — comportamento correto após carregamento', () => {
  it('NÃO apaga quando subcategoria pertence à categoria selecionada', () => {
    expect(shouldResetSubcategory('cola-id', 'cold-id', allCategories)).toBe(false)
  })

  it('NÃO apaga quando outra subcategoria da mesma categoria está selecionada', () => {
    expect(shouldResetSubcategory('juice-id', 'cold-id', allCategories)).toBe(false)
  })

  it('APAGA quando utilizador muda para categoria diferente e subcategoria não pertence', () => {
    // User tinha cold+cola, mudou category para hot → cola não existe em hot → deve apagar
    expect(shouldResetSubcategory('cola-id', 'hot-id', allCategories)).toBe(true)
  })

  it('APAGA quando subcategoria é de outra categoria pai', () => {
    expect(shouldResetSubcategory('tea-id', 'cold-id', allCategories)).toBe(true)
  })
})
