# Picking Line — Search Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar campo de pesquisa context-aware no header da Picking Line que localiza brands alocados por code/name, exibe dropdown de resultados filtrado pela aba activa, e destaca o slot encontrado com borda azul + dimming dos restantes.

**Architecture:** Lógica de pesquisa extraída para função pura em `slotSearch.ts` (testável). Estado efémero em `PickingLine.tsx` (`searchQuery` + `searchHighlightSlotId`). `SlotCell` recebe duas novas props (`isSearchActive`, `isHighlighted`) para dimming/highlight sem re-renderizar o grid inteiro.

**Tech Stack:** React 19, TypeScript, Vitest, inline styles (IBM Plex Mono/Sans), Supabase (sem nova query — usa `allSlots` já em memória).

---

## File Map

| Ficheiro | Acção | Responsabilidade |
|---|---|---|
| `src/lib/slotSearch.ts` | Criar | Função pura `searchSlots` — prefix-priority, testável |
| `src/test/slotSearch.test.ts` | Criar | Testes TDD da lógica de pesquisa |
| `src/pages/PickingLine.tsx` | Modificar | Estado, UI do search, dimming, scroll, limpeza |

---

## Task 1: `slotSearch.ts` — função pura com TDD

**Files:**
- Create: `src/lib/slotSearch.ts`
- Create: `src/test/slotSearch.test.ts`

- [ ] **Step 1: Escrever os testes (RED)**

Criar `src/test/slotSearch.test.ts`:

```typescript
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
    expect(results.every(r => r.brandCode !== '')).toBe(true)
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
```

- [ ] **Step 2: Correr os testes para confirmar RED**

```bash
cd "NEXT Warehouse Manager"
npm test -- slotSearch
```

Esperado: `FAIL — Cannot find module '@/lib/slotSearch'`

- [ ] **Step 3: Implementar `slotSearch.ts`**

Criar `src/lib/slotSearch.ts`:

```typescript
export interface SearchableSlot {
  id: string
  bin_address: string
  rack_name: string
  slot_state: string
  brand: { brand_code: string; brand_name: string } | null
}

export interface SearchResult {
  slotId: string
  binAddress: string
  rackName: string
  brandCode: string
  brandName: string
}

export function searchSlots(
  slots: SearchableSlot[],
  query: string,
  maxResults = 10
): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const allocated = slots.filter(s => s.slot_state === 'brand_allocated' && s.brand)

  const prefix: SearchResult[] = []
  const contains: SearchResult[] = []

  for (const s of allocated) {
    const code = s.brand!.brand_code.toLowerCase()
    const name = s.brand!.brand_name.toLowerCase()
    const result: SearchResult = {
      slotId: s.id,
      binAddress: s.bin_address,
      rackName: s.rack_name,
      brandCode: s.brand!.brand_code,
      brandName: s.brand!.brand_name,
    }
    if (code.startsWith(q)) {
      prefix.push(result)
    } else if (code.includes(q) || name.includes(q)) {
      contains.push(result)
    }
  }

  const byCode = (a: SearchResult, b: SearchResult) =>
    a.brandCode.localeCompare(b.brandCode, undefined, { numeric: true })

  return [...prefix.sort(byCode), ...contains.sort(byCode)].slice(0, maxResults)
}
```

- [ ] **Step 4: Correr testes para confirmar GREEN**

```bash
npm test -- slotSearch
```

Esperado: `PASS — 10 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/slotSearch.ts src/test/slotSearch.test.ts
git commit -m "feat: add slotSearch pure function with TDD"
```

---

## Task 2: `SlotCell` — props `isSearchActive` + `isHighlighted`

**Files:**
- Modify: `src/pages/PickingLine.tsx:70-86` (interface SlotCellProps)
- Modify: `src/pages/PickingLine.tsx:138-147` (estilos do div raiz do SlotCell)
- Modify: `src/pages/PickingLine.tsx:238-253` (comparador do React.memo)
- Modify: `src/pages/PickingLine.tsx:1193-1210` (JSX onde SlotCell é instanciado)

- [ ] **Step 1: Adicionar props à interface `SlotCellProps` (linha 70)**

Substituir o bloco da interface (linhas 70-86):

```typescript
interface SlotCellProps {
  slot: Slot | undefined
  isFlashed: boolean
  isSearchActive: boolean   // ← novo
  isHighlighted: boolean    // ← novo
  isAdmin: boolean
  tabIndex: number
  rackIdx: number
  colIdx: number
  rowIdx: number
  cellW: number
  onSlotClick: (slot: Slot) => void
  onContextMenu: (slot: Slot, x: number, y: number) => void
  onSpaceKey: (slot: Slot) => void
  onEnterKey: (slot: Slot, x: number, y: number) => void
  onSlotFocus: (slotId: string) => void
  onHoverEnter: (brandId: string, code: string, name: string) => void
  onHoverLeave: () => void
}
```

- [ ] **Step 2: Adicionar as props ao destructuring da função (linha 92)**

```typescript
const SlotCell = memo(
  function SlotCell({ slot, isFlashed, isSearchActive, isHighlighted, isAdmin,
    tabIndex, rackIdx, colIdx, rowIdx, cellW,
    onSlotClick, onContextMenu, onSpaceKey, onEnterKey, onSlotFocus,
    onHoverEnter, onHoverLeave }: SlotCellProps) {
```

- [ ] **Step 3: Aplicar estilos de highlight/dimming no `style` do div raiz (linha 138)**

Substituir o bloco `style={{` do div raiz (antes de `position: 'relative'`):

```typescript
style={{
  position: 'relative',
  border: isHighlighted
    ? '2px solid #2563eb'
    : isExpansion
    ? '2px dashed #a78bfa'
    : `1px solid ${isAllocated ? '#86efac' : '#e4e4e7'}`,
  background: isHighlighted
    ? '#eff6ff'
    : isExpansion ? '#faf5ff' : isAllocated ? '#f0fdf4' : '#fafafa',
  boxShadow: isHighlighted ? '0 0 0 3px rgba(37,99,235,0.2)' : undefined,
  opacity: isSearchActive && !isHighlighted ? 0.3 : 1,
  borderRadius: 3,
  minHeight: 0,
  overflow: 'hidden',
  cursor: slot ? 'pointer' : 'default',
```

- [ ] **Step 4: Actualizar o comparador do `React.memo` (linha 238)**

Adicionar as duas linhas novas no comparador (após `prev.isFlashed`):

```typescript
  (prev, next) =>
    prev.isFlashed       === next.isFlashed       &&
    prev.isSearchActive  === next.isSearchActive  &&
    prev.isHighlighted   === next.isHighlighted   &&
    prev.isAdmin         === next.isAdmin         &&
    prev.tabIndex        === next.tabIndex        &&
    prev.rackIdx         === next.rackIdx         &&
    prev.colIdx          === next.colIdx          &&
    prev.rowIdx          === next.rowIdx          &&
    prev.cellW           === next.cellW           &&
    prev.slot?.id                  === next.slot?.id                  &&
    prev.slot?.slot_state          === next.slot?.slot_state          &&
    prev.slot?.allocated_brand_id  === next.slot?.allocated_brand_id  &&
    prev.slot?.light_address       === next.slot?.light_address       &&
    prev.slot?.light_status        === next.slot?.light_status        &&
    prev.slot?.expansion_direction === next.slot?.expansion_direction &&
    prev.slot?.bin_address         === next.slot?.bin_address
)
```

- [ ] **Step 5: Adicionar as novas props ao JSX de `<SlotCell>` (linha 1193)**

```typescript
<SlotCell
  key={`${letter}-${row}`}
  slot={slot}
  isFlashed={slot ? flashedSlots.has(slot.id) : false}
  isSearchActive={searchHighlightSlotId !== null}
  isHighlighted={slot ? slot.id === searchHighlightSlotId : false}
  isAdmin={isAdmin}
  tabIndex={slotTabIndex}
  rackIdx={idx}
  colIdx={colIdx}
  rowIdx={rowIdx}
  cellW={cellW}
  onSlotClick={s => setSlotModal({ slot: s as ModalSlot, rack: r })}
  onContextMenu={openContextMenu}
  onSpaceKey={s => setSlotModal({ slot: s as ModalSlot, rack: r })}
  onEnterKey={openContextMenu}
  onSlotFocus={handleSlotFocus}
  onHoverEnter={handleSlotMouseEnter}
  onHoverLeave={handleSlotMouseLeave}
/>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat: add isSearchActive/isHighlighted props to SlotCell"
```

---

## Task 3: Estado e UI do search no header

**Files:**
- Modify: `src/pages/PickingLine.tsx` — imports, estado, derivados, UI do header

- [ ] **Step 1: Adicionar import de `searchSlots` e `SearchResult`**

No topo de `PickingLine.tsx`, após os imports existentes:

```typescript
import { searchSlots } from '@/lib/slotSearch'
import type { SearchResult } from '@/lib/slotSearch'
```

- [ ] **Step 2: Adicionar estado + ref do input (após linha 333, junto aos outros useState)**

```typescript
const [searchQuery,           setSearchQuery]           = useState('')
const [searchHighlightSlotId, setSearchHighlightSlotId] = useState<string | null>(null)
const [searchDropdownIdx,     setSearchDropdownIdx]     = useState(-1)
const searchInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 3: Adicionar derivados `searchableSlots` e `searchResults` (após linha 795, junto a `visibleRacks`)**

```typescript
const searchableSlots = visibleRacks.flatMap(r =>
  (allSlots[r.id] ?? []).map(s => ({ ...s, rack_name: r.name }))
)
const searchResults      = searchSlots(searchableSlots, searchQuery)
const searchDropdownOpen = searchQuery.trim().length > 0
```

- [ ] **Step 4: Adicionar função `clearSearch` (junto a `selectType`, linha 764)**

```typescript
function clearSearch() {
  setSearchQuery('')
  setSearchHighlightSlotId(null)
  setSearchDropdownIdx(-1)
}
```

- [ ] **Step 5: Chamar `clearSearch()` em `selectType` ao mudar de aba**

```typescript
function selectType(id: string) {
  _store.activeTypeId = id
  setActiveTypeId(id)
  setSelectedRackId(null)
  clearSearch()
}
```

- [ ] **Step 6: Substituir o bloco Toolbar no header (linhas 836-852) para incluir o search**

```typescript
{/* Toolbar */}
<div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
  {isAdmin ? (
    <button onClick={() => setShowForm(true)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}>
      <Plus size={13} /> Add Rack
    </button>
  ) : (
    <button disabled title="Only admins can create racks"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f4f4f5', border: '1px solid #e4e4e7', color: '#a1a1aa', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'not-allowed', flexShrink: 0 }}>
      <Lock size={13} /> Add Rack
    </button>
  )}

  {/* Search input + dropdown */}
  {!loading && (
    <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#a1a1aa', pointerEvents: 'none', zIndex: 1 }}>⌕</span>
      <input
        ref={searchInputRef}
        value={searchQuery}
        onChange={e => { setSearchQuery(e.target.value); setSearchDropdownIdx(-1); setSearchHighlightSlotId(null) }}
        onKeyDown={e => {
          if (!searchDropdownOpen) {
            if (e.key === 'Escape') clearSearch()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSearchDropdownIdx(i => Math.min(i + 1, searchResults.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSearchDropdownIdx(i => Math.max(i - 1, 0))
          } else if (e.key === 'Enter' && searchDropdownIdx >= 0) {
            e.preventDefault()
            handleSearchSelect(searchResults[searchDropdownIdx])
          } else if (e.key === 'Escape') {
            clearSearch()
          }
        }}
        placeholder="Search brand code or name…"
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '6px 28px 6px 28px',
          border: '1px solid #e4e4e7', background: '#fafafa',
          fontSize: 12, color: '#09090b', outline: 'none',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        }}
        onFocus={e => (e.target.style.borderColor = '#2563eb')}
        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
      />
      {searchQuery && (
        <button
          onClick={clearSearch}
          style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14, lineHeight: 1, padding: 2 }}
        >×</button>
      )}

      {/* Dropdown */}
      {searchDropdownOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d4d4d8', borderTop: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 280, overflowY: 'auto' }}>
          {searchResults.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 11, color: '#a1a1aa' }}>No allocated brands found</div>
          ) : searchResults.map((r, i) => (
            <div
              key={r.slotId}
              onMouseDown={e => { e.preventDefault(); handleSearchSelect(r) }}
              onMouseEnter={() => setSearchDropdownIdx(i)}
              style={{
                padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f4f5',
                display: 'flex', alignItems: 'center', gap: 10,
                background: i === searchDropdownIdx ? '#eff6ff' : '#fff',
              }}
            >
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 800, color: '#09090b', minWidth: 42 }}>{r.brandCode}</span>
              <span style={{ fontSize: 11, color: '#52525b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.brandName}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>{r.binAddress}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )}

  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a1a1aa', flexShrink: 0 }}>
    {visibleRacks.length} rack{visibleRacks.length !== 1 ? 's' : ''}
  </span>
</div>
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Esperado: zero erros. Se reportar `handleSearchSelect` não definida — é normal, será adicionada na Task 4.

- [ ] **Step 8: Commit**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat: add search input + dropdown UI to PickingLine header"
```

---

## Task 4: Selecção + scroll + cleanup

**Files:**
- Modify: `src/pages/PickingLine.tsx` — `handleSearchSelect` + tipo `SearchResult`

- [ ] **Step 1: Adicionar `handleSearchSelect` (junto a `clearSearch`, linha ~770)**

```typescript
function handleSearchSelect(result: SearchResult) {
  setSearchQuery(result.brandCode)
  setSearchHighlightSlotId(result.slotId)
  setSearchDropdownIdx(-1)
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-slot-id="${result.slotId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      lastFocusedSlotId.current = result.slotId
    }
  }, 50)
}
```

- [ ] **Step 2: Type-check final**

```bash
npx tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 3: Correr todos os testes**

```bash
npm test
```

Esperado: todos os testes existentes + novos de `slotSearch` passam.

- [ ] **Step 4: Verificar manualmente no browser**

```bash
npm run dev
```

Passos:
1. Abrir Picking Line → aba "Drink"
2. Digitar `coke` no campo de search → dropdown aparece com brands da aba Drink
3. Usar ArrowDown para navegar → item activo fica a azul
4. Premir Enter → slot destacado com borda azul, restantes dimmed, scroll automático
5. Premir Escape → campo limpo, dimming removido
6. Mudar para aba "Wholesale" → campo limpa automaticamente
7. Verificar que brands de outras abas não aparecem nos resultados

- [ ] **Step 5: Commit final**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat: wire search selection, scroll-to-slot and tab cleanup"
```

---

## Self-Review

**Spec coverage:**
- ✅ Campo no header entre ADD RACK e contador
- ✅ Pesquisa por brand_code e brand_name
- ✅ Context-aware (só aba activa via `visibleRacks`)
- ✅ Dropdown com resultados
- ✅ Slot destacado (borda azul + box-shadow)
- ✅ Outros slots dimmed (opacity 0.3)
- ✅ Scroll automático ao slot seleccionado
- ✅ Limpeza ao mudar de aba
- ✅ Teclado (ArrowDown/Up, Enter, Escape)
- ✅ Botão × para limpar
- ✅ SlotCell comparador actualizado

**Placeholder scan:** nenhum TBD ou TODO encontrado.

**Type consistency:** `SearchResult` definido em Task 1, importado em Task 3, usado em Task 4 — consistente.
