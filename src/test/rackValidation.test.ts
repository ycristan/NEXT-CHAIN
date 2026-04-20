import { describe, it, expect } from 'vitest'
import { validateRackForm } from '@/lib/rackValidation'

// Base de valores válidos — cada teste sobrescreve só o campo que quer testar
const valid = {
  name: '52',
  rackTypeId: 'some-uuid',
  columns: '7',
  rows: '3',
  soloPos: '',
  comboPos: '',
  existingNames: [],
}

describe('validateRackForm — rack name', () => {
  it('rejects empty name', () => {
    const errors = validateRackForm({ ...valid, name: '' })
    expect(errors.name).toBe('Required.')
  })

  it('rejects name with letters', () => {
    const errors = validateRackForm({ ...valid, name: 'A1' })
    expect(errors.name).toMatch(/1-2 digits/)
  })

  it('rejects name with more than 2 digits', () => {
    const errors = validateRackForm({ ...valid, name: '123' })
    expect(errors.name).toMatch(/1-2 digits/)
  })

  it('rejects duplicate name', () => {
    const errors = validateRackForm({ ...valid, name: '40', existingNames: ['40', '41'] })
    expect(errors.name).toMatch(/already exists/)
  })

  it('accepts 1-digit name', () => {
    const errors = validateRackForm({ ...valid, name: '5' })
    expect(errors.name).toBeUndefined()
  })

  it('accepts 2-digit name', () => {
    const errors = validateRackForm({ ...valid, name: '52' })
    expect(errors.name).toBeUndefined()
  })
})

describe('validateRackForm — rack type (obrigatório)', () => {
  it('rejects missing rack type', () => {
    const errors = validateRackForm({ ...valid, rackTypeId: '' })
    expect(errors.rackTypeId).toBe('Required.')
  })

  it('accepts valid rack type id', () => {
    const errors = validateRackForm({ ...valid, rackTypeId: 'wholesale-uuid' })
    expect(errors.rackTypeId).toBeUndefined()
  })
})

describe('validateRackForm — columns', () => {
  it('rejects zero columns', () => {
    const errors = validateRackForm({ ...valid, columns: '0' })
    expect(errors.columns).toMatch(/≥ 1/)
  })

  it('rejects more than 26 columns', () => {
    const errors = validateRackForm({ ...valid, columns: '27' })
    expect(errors.columns).toMatch(/Max 26/)
  })

  it('rejects empty columns', () => {
    const errors = validateRackForm({ ...valid, columns: '' })
    expect(errors.columns).toBeDefined()
  })

  it('accepts 7 columns', () => {
    const errors = validateRackForm({ ...valid, columns: '7' })
    expect(errors.columns).toBeUndefined()
  })
})

describe('validateRackForm — rows', () => {
  it('rejects zero rows', () => {
    const errors = validateRackForm({ ...valid, rows: '0' })
    expect(errors.rows).toMatch(/≥ 1/)
  })

  it('rejects more than 99 rows', () => {
    const errors = validateRackForm({ ...valid, rows: '100' })
    expect(errors.rows).toMatch(/Max 99/)
  })

  it('accepts 3 rows', () => {
    const errors = validateRackForm({ ...valid, rows: '3' })
    expect(errors.rows).toBeUndefined()
  })
})

describe('validateRackForm — picking positions (opcionais)', () => {
  it('accepts empty soloPos', () => {
    const errors = validateRackForm({ ...valid, soloPos: '' })
    expect(errors.soloPos).toBeUndefined()
  })

  it('rejects soloPos of zero', () => {
    const errors = validateRackForm({ ...valid, soloPos: '0' })
    expect(errors.soloPos).toBeDefined()
  })

  it('accepts valid comboPos', () => {
    const errors = validateRackForm({ ...valid, comboPos: '2' })
    expect(errors.comboPos).toBeUndefined()
  })
})

describe('validateRackForm — formulário completamente válido', () => {
  it('retorna zero erros para dados válidos', () => {
    const errors = validateRackForm(valid)
    expect(Object.keys(errors)).toHaveLength(0)
  })
})
