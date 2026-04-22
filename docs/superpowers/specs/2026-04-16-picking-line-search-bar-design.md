# Picking Line — Search Bar Design

**Goal:** Adicionar campo de pesquisa context-aware no header da Picking Line que localiza brands alocados, destaca o slot encontrado e respeita a aba de rack type activa.

**Approved:** 2026-04-16

---

## Placement

No header de `PickingLine.tsx`, entre o botão `+ ADD RACK` e o contador `N racks` — posição identificada na screenshot pelo rectângulo vermelho.

```
[ + ADD RACK ]  [ ⌕ Search brand code or name… ]  ×        4 racks
```

---

## Arquitectura

### Ficheiros modificados
- `src/pages/PickingLine.tsx` — estado, UI do input e dropdown, dimming, scroll, teclado
- `src/pages/PickingLine.tsx` (SlotCell) — 2 novas props + comparador actualizado

### Ficheiros criados
- `src/lib/slotSearch.ts` — função pura de pesquisa (testável isoladamente)
- `src/test/slotSearch.test.ts` — testes da lógica de pesquisa

---

## Estado (PickingLine.tsx)

Dois estados efémeros — não persistem no `_store` (limpar ao sair da tab faz sentido):

```typescript
const [searchQuery,          setSearchQuery]          = useState('')
const [searchHighlightSlotId, setSearchHighlightSlotId] = useState<string | null>(null)
```

---

## Fonte de dados

Sem nova query ao Supabase. Deriva de `allSlots` + `visibleRacks` já em memória:

```typescript
// Todos os slots brand_allocated dos racks visíveis na aba activa
const searchableSlots = visibleRacks.flatMap(r =>
  (allSlots[r.id] ?? []).filter(s => s.slot_state === 'brand_allocated' && s.brand)
)
```

Resultado actualizável em tempo real via Realtime sem custo extra.

---

## Lógica de pesquisa — `slotSearch.ts`

Interface:
```typescript
export interface SearchResult {
  slotId: string
  rackName: string
  binAddress: string
  brandCode: string
  brandName: string
}

export function searchSlots(
  slots: SearchableSlot[],
  query: string,
  maxResults?: number   // default 10
): SearchResult[]
```

Algoritmo **prefix-priority** (padrão estabelecido no projecto):
1. Slots cujo `brand_code` começa com `query` (case-insensitive)
2. Slots cujo `brand_code` ou `brand_name` **contém** `query` (não começa)
3. Cada grupo ordenado por `brand_code.localeCompare(_, undefined, { numeric: true })`
4. Concatena os dois grupos, limita a `maxResults` (10)

Retorna `[]` se `query.trim() === ''`.

---

## UI — Input + Dropdown

```
[ ⌕  |  input text                    × ]
      ┌──────────────────────────────────┐
      │  6325  Coke Zero Can 330ml  43 A02│  ← selected (fundo #eff6ff)
      │  6326  Coke Original Can    40 B01│
      │  6327  Coke Zero Bottle     41 C03│
      └──────────────────────────────────┘
```

- Largura máxima: `320px`, `flex: 1` no espaço disponível
- Dropdown: `position: absolute`, `zIndex: 200`, max 10 itens, scroll se necessário
- Cada item: `brand_code` (IBM Plex Mono bold) + `brand_name` + `bin_address` (verde, à direita)
- Item activo (hover ou ArrowDown): `background: #eff6ff`
- Botão `×` visível quando `searchQuery !== ''`

---

## Comportamento de selecção

Ao seleccionar um resultado (click ou Enter):
1. `setSearchHighlightSlotId(slotId)`
2. `setSearchQuery(brandCode)` — mantém o texto no campo
3. Fecha dropdown
4. `document.querySelector('[data-slot-id="${slotId}"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })`
5. `lastFocusedSlotId.current = slotId` — permite navegar por teclado a partir dali

---

## Dimming dos slots não-destacados

Quando `searchHighlightSlotId !== null`:
- Slot destacado: borda `2px solid #2563eb`, `background: #eff6ff`, `box-shadow: 0 0 0 3px rgba(37,99,235,0.2)`
- Restantes slots: `opacity: 0.3`

Implementado via props `isSearchActive` + `isHighlighted` no `SlotCell`.

---

## Teclado

| Tecla | Contexto | Acção |
|---|---|---|
| `ArrowDown` / `ArrowUp` | Input focado, dropdown aberto | Navega entre resultados |
| `Enter` | Item activo no dropdown | Selecciona |
| `Escape` | Dropdown aberto | Fecha dropdown |
| `Escape` | Dropdown fechado | Limpa query e highlight |

A navegação 2D existente (ArrowKeys no grid) **não é afectada** — só funciona quando o foco está num slot (`data-slot-id`), não no input.

---

## Limpeza automática

- Mudar de aba (rack type) → `setSearchQuery('')` + `setSearchHighlightSlotId(null)`
- Implementado no handler de mudança de aba existente

---

## SlotCell — props adicionadas

```typescript
isSearchActive: boolean   // true quando searchHighlightSlotId !== null
isHighlighted:  boolean   // true quando slot.id === searchHighlightSlotId
```

Comparador do `React.memo` actualizado para incluir ambas:
```typescript
prev.isSearchActive === next.isSearchActive &&
prev.isHighlighted  === next.isHighlighted
```

Sem isto os slots não re-renderizam quando o highlight muda.

---

## Testes (`slotSearch.test.ts`)

- Retorna `[]` para query vazia
- Prefix-match aparece antes de contains-match
- Cada grupo ordenado por brand_code numérico
- Respeita `maxResults`
- Case-insensitive
- Ignora slots não-alocados

---

## Fora de âmbito

- Pesquisa por `bin_address` — não solicitado
- Highlight de múltiplos resultados simultâneos — Opção A é single-select
- Persistência da query entre navegações de tab
