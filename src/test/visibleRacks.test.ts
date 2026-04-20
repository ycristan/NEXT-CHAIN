import { describe, it, expect } from 'vitest'

// Lógica extraída de PickingLine.tsx linha 793-795
// Testada aqui como função pura para evitar regressões
function visibleRacks(
  racks: { id: string; rack_type: { id: string } | null }[],
  activeTypeId: string | null
) {
  return activeTypeId
    ? racks.filter(r => r.rack_type?.id === activeTypeId)
    : racks
}

const wholesale = { id: 'wholesale-id', name: 'Wholesale' }
const ambient   = { id: 'ambient-id',   name: 'Ambient'   }

const rack52   = { id: 'rack-52', rack_type: wholesale }
const rack40   = { id: 'rack-40', rack_type: ambient   }
const rackNull = { id: 'rack-X',  rack_type: null       }  // o bug: rack sem tipo

describe('visibleRacks — filtro por aba ativa', () => {
  it('mostra só racks do tipo ativo', () => {
    const result = visibleRacks([rack52, rack40], 'wholesale-id')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rack-52')
  })

  it('rack sem rack_type NUNCA aparece quando há aba ativa', () => {
    // Este é o bug que causou rack 52 invisível
    const result = visibleRacks([rack52, rackNull], 'wholesale-id')
    expect(result).not.toContain(rackNull)
  })

  it('rack sem rack_type aparece quando activeTypeId é null', () => {
    const result = visibleRacks([rack52, rackNull], null)
    expect(result).toContain(rackNull)
  })

  it('mostra todos os racks quando activeTypeId é null', () => {
    const result = visibleRacks([rack52, rack40, rackNull], null)
    expect(result).toHaveLength(3)
  })

  it('retorna array vazio se nenhum rack corresponde ao tipo', () => {
    const result = visibleRacks([rack40], 'wholesale-id')
    expect(result).toHaveLength(0)
  })
})
