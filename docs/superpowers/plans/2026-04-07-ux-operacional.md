# UX Operacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar zoom de grade flutuante, indicador de rack visível durante scroll e toggle de filtro multi-valor com explicação no NEXT Warehouse Manager.

**Architecture:** Três features independentes em dois arquivos. `PickingLine.tsx` recebe: (1) `cellW` state que substitui a constante `CELL_W`, propagado ao `SlotCell` para escala de fontes, e (2) overlay de pill + controle de zoom via wrapper `position: relative` ao redor da grade. `INVCodeFilter.tsx` recebe toggle `bulkEnabled` persistido em localStorage que oculta/exibe a seção de input bulk.

**Tech Stack:** React 19 + TypeScript, inline styles (padrão do projeto), localStorage para persistência de preferências.

**Spec:** `docs/superpowers/specs/2026-04-07-ux-operacional-design.md`

---

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/pages/PickingLine.tsx` | `CELL_W` → `cellW` state; `SlotCell` recebe `cellW`; wrapper div; zoom button; pill + scroll handler |
| `src/pages/INVCodeFilter.tsx` | `bulkEnabled` state + localStorage; toggle UI no cabeçalho da seção bulk |

---

## Task 1: Substituir `CELL_W` por estado reativo em `PickingLine.tsx`

**Files:**
- Modify: `src/pages/PickingLine.tsx`

### Contexto

Linha 18 tem `const CELL_W = 160`. Essa constante é usada em três lugares:
- Linha 18 (declaração)
- Linha 914: `const rackW = ROW_LABEL_W + r.columns * CELL_W + ...`
- Linha 915: `const gridCols = \`${ROW_LABEL_W}px repeat(${r.columns}, ${CELL_W}px)\``

O objetivo é torná-la um `useState` com persistência em localStorage.

- [ ] **Step 1: Remover a constante de módulo `CELL_W`**

Em `src/pages/PickingLine.tsx`, remover a linha 18:
```ts
// REMOVER esta linha:
const CELL_W       = 160  // px per column
```

- [ ] **Step 2: Adicionar `cellW` como estado no componente `PickingLine`**

Logo após a linha `const isAdmin = profile?.role?.toLowerCase() === 'admin'` (por volta da linha 253), adicionar:

```ts
// Zoom: 160 = 100%. Range 96px (60%) – 320px (200%). Step: 16px (10%).
const [cellW, setCellW] = useState<number>(() => {
  const stored = localStorage.getItem('nc-pl-zoom')
  const n = stored ? parseInt(stored, 10) : 160
  return isNaN(n) ? 160 : Math.min(320, Math.max(96, n))
})
```

- [ ] **Step 3: Adicionar handlers de zoom logo após o estado `cellW`**

```ts
const ZOOM_STEP = 16  // 10% de 160px

function handleZoom(delta: number) {
  setCellW(prev => {
    const next = Math.max(96, Math.min(320, prev + delta))
    localStorage.setItem('nc-pl-zoom', String(next))
    return next
  })
}

function resetZoom() {
  setCellW(160)
  localStorage.setItem('nc-pl-zoom', '160')
}
```

- [ ] **Step 4: Atualizar as referências a `CELL_W` no render (linhas ~914-915)**

Localizar dentro do `visibleRacks.map((r, idx) => {`:
```ts
// ANTES:
const rackW    = ROW_LABEL_W + r.columns * CELL_W + (r.columns - 1) * CELL_GAP + GRID_PAD * 2
const gridCols = `${ROW_LABEL_W}px repeat(${r.columns}, ${CELL_W}px)`

// DEPOIS:
const rackW    = ROW_LABEL_W + r.columns * cellW + (r.columns - 1) * CELL_GAP + GRID_PAD * 2
const gridCols = `${ROW_LABEL_W}px repeat(${r.columns}, ${cellW}px)`
```

- [ ] **Step 5: Verificar que o app compila e abre**

```bash
npm run dev
```

Abrir o Picking Line. A grade deve ter aparência idêntica à antes (sem zoom ainda). Verificar no console que não há erros TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat(picking-line): replace CELL_W constant with reactive cellW state"
```

---

## Task 2: Propagar `cellW` ao `SlotCell` e escalar fontes

**Files:**
- Modify: `src/pages/PickingLine.tsx`

### Contexto

`SlotCell` é memoizado com comparator customizado. As fontes internas são hardcoded (10px, 11px, 9px, etc.). Precisamos:
1. Adicionar `cellW: number` à interface `SlotCellProps`
2. Escalar fontes dentro de `SlotCell` proporcionalmente
3. Adicionar `cellW` ao comparator para que re-renders de zoom funcionem
4. Passar `cellW={cellW}` no ponto de uso

- [ ] **Step 1: Adicionar `cellW` à interface `SlotCellProps`**

Localizar a interface `SlotCellProps` (linha ~70) e adicionar o campo:

```ts
interface SlotCellProps {
  slot: Slot | undefined
  isFlashed: boolean
  isAdmin: boolean
  tabIndex: number
  rackIdx: number
  colIdx: number
  rowIdx: number
  cellW: number          // ← ADICIONAR
  onSlotClick: (slot: Slot) => void
  onContextMenu: (slot: Slot, x: number, y: number) => void
  onSpaceKey: (slot: Slot) => void
  onEnterKey: (slot: Slot, x: number, y: number) => void
  onSlotFocus: (slotId: string) => void
  onHoverEnter: (brandId: string, code: string, name: string) => void
  onHoverLeave: () => void
}
```

- [ ] **Step 2: Adicionar desestruturação de `cellW` na assinatura de `SlotCell`**

Na função interna `SlotCell` (linha ~91), adicionar `cellW` aos parâmetros desestruturados:

```ts
function SlotCell({ slot, isFlashed, isAdmin, tabIndex, rackIdx, colIdx, rowIdx, cellW,
  onSlotClick, onContextMenu, onSpaceKey, onEnterKey, onSlotFocus, onHoverEnter, onHoverLeave }: SlotCellProps) {
```

- [ ] **Step 3: Adicionar helper de escala logo após as variáveis derivadas existentes do slot**

Após as linhas `const brand = ...`, `const isAllocated = ...`, etc. (por volta da linha 92), adicionar:

```ts
const scale = cellW / 160
// Escala fontes proporcionalmente; mínimos absolutos garantem legibilidade
const fs = (base: number, min: number) => Math.max(min, Math.round(base * scale))
```

- [ ] **Step 4: Substituir tamanhos de fonte hardcoded no bloco `isExpansion`**

Localizar o bloco `{isExpansion ? (` e atualizar:

```tsx
{isExpansion ? (
  <>
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontSize: fs(22, 12), lineHeight: 1, color: '#7c3aed' }}>
        {dir ? DIR_ARROW[dir] : '⇿'}
      </span>
      <span style={{ fontSize: fs(9, 6), fontWeight: 800, color: '#6d28d9', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
        {dir ? DIR_LABEL[dir] : 'EXPANSION'}
      </span>
    </div>
    <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: fs(9, 6), fontFamily: 'monospace', fontWeight: 700, color: '#a78bfa', letterSpacing: '0.04em', lineHeight: 1 }}>
      {slot!.bin_address}
    </span>
  </>
```

- [ ] **Step 5: Substituir tamanhos de fonte hardcoded no bloco `else` (brand/empty)**

Localizar o bloco `else` com os elementos de brand e atualizar:

```tsx
) : (
  <>
    {brand && (
      <span style={{ position: 'absolute', top: 5, left: 6, fontSize: fs(10, 7), fontFamily: 'monospace', fontWeight: 800, color: '#09090b', lineHeight: 1, maxWidth: '42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {brand.brand_code}
      </span>
    )}
    {brand?.bpu != null && (
      <span style={{ position: 'absolute', top: 5, right: 6, fontSize: fs(10, 7), color: '#52525b', fontWeight: 600, lineHeight: 1 }}>
        ×{brand.bpu}
      </span>
    )}
    {brand && (
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'calc(100% - 20px)', textAlign: 'center',
        fontSize: fs(11, 8), fontWeight: 600, color: '#27272a', lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
      }}>
        {brand.brand_name}
      </div>
    )}
    <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: fs(9, 6), fontFamily: 'monospace', fontWeight: 700, color: isAllocated ? '#16a34a' : '#a1a1aa', letterSpacing: '0.04em', lineHeight: 1 }}>
      {slot?.bin_address ?? ''}
    </span>
    {slot && (
      <span style={{
        position: 'absolute', bottom: 4, right: 6,
        width: fs(16, 10), height: fs(16, 10), borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs(8, 5), fontWeight: 700,
        background: lightOn ? '#22c55e' : '#e4e4e7',
        color: lightOn ? '#fff' : '#a1a1aa',
        border: lightOn ? '1px solid #16a34a' : '1px solid #d4d4d8',
        animation: isBlink ? 'pl-blink 1s ease-in-out infinite' : 'none',
        lineHeight: 1, userSelect: 'none',
      }}>
        {slot.light_address ?? '·'}
      </span>
    )}
  </>
)}
```

- [ ] **Step 6: Adicionar `cellW` ao custom comparator de `SlotCell`**

Localizar o comparator (linhas ~233-246) e adicionar a linha `prev.cellW === next.cellW &&`:

```ts
(prev, next) =>
  prev.isFlashed    === next.isFlashed    &&
  prev.isAdmin      === next.isAdmin      &&
  prev.tabIndex     === next.tabIndex     &&
  prev.rackIdx      === next.rackIdx      &&
  prev.colIdx       === next.colIdx       &&
  prev.rowIdx       === next.rowIdx       &&
  prev.cellW        === next.cellW        &&
  prev.slot?.id     === next.slot?.id     &&
  prev.slot?.slot_state        === next.slot?.slot_state        &&
  prev.slot?.allocated_brand_id === next.slot?.allocated_brand_id &&
  prev.slot?.light_address     === next.slot?.light_address     &&
  prev.slot?.light_status      === next.slot?.light_status      &&
  prev.slot?.expansion_direction === next.slot?.expansion_direction &&
  prev.slot?.bin_address       === next.slot?.bin_address
```

- [ ] **Step 7: Passar `cellW={cellW}` no ponto de uso do `SlotCell`**

Localizar o `<SlotCell` dentro do `visibleRacks.map` (linha ~1122) e adicionar a prop:

```tsx
<SlotCell
  key={`${letter}-${row}`}
  slot={slot}
  isFlashed={slot ? flashedSlots.has(slot.id) : false}
  isAdmin={isAdmin}
  tabIndex={slotTabIndex}
  rackIdx={idx}
  colIdx={colIdx}
  rowIdx={rowIdx}
  cellW={cellW}                          // ← ADICIONAR
  onSlotClick={s => setSlotModal({ slot: s as ModalSlot, rack: r })}
  onContextMenu={openContextMenu}
  onSpaceKey={s => setSlotModal({ slot: s as ModalSlot, rack: r })}
  onEnterKey={openContextMenu}
  onSlotFocus={handleSlotFocus}
  onHoverEnter={handleSlotMouseEnter}
  onHoverLeave={handleSlotMouseLeave}
/>
```

- [ ] **Step 8: Verificar que o app compila sem erros TypeScript**

```bash
npm run build 2>&1 | head -40
```

Esperado: `✓ built in Xs` sem erros de tipo. Se houver erro de tipo, corrigir antes de continuar.

- [ ] **Step 9: Commit**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat(picking-line): propagate cellW to SlotCell for proportional font scaling"
```

---

## Task 3: Wrapper de overlay + botão de zoom flutuante

**Files:**
- Modify: `src/pages/PickingLine.tsx`

### Contexto

O `lineRef` é atualmente um flex child direto. Para suportar overlays com `position: absolute` que **não scrollam** com a grade, precisamos de um wrapper com `position: relative` e `overflow: hidden`. O botão de zoom fica no canto inferior direito desse wrapper.

- [ ] **Step 1: Envolver o `lineRef` div com um wrapper relativo**

Localizar o comentário e div de linha ~887:
```tsx
{/* ── Horizontal picking line ──────────────────────────── */}
<div ref={lineRef} onKeyDown={handleGridKeyDown}
  style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', background: '#fff' }}>
```

Substituir por:
```tsx
{/* ── Horizontal picking line wrapper (relative for overlays) ── */}
<div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
  <div ref={lineRef} onKeyDown={handleGridKeyDown}
    style={{ width: '100%', height: '100%', display: 'flex', overflowX: 'auto', overflowY: 'hidden', background: '#fff' }}>
```

E no fechamento do `lineRef` div (linha ~1163, após o último `})}` do mapa de racks):
```tsx
      </div>  {/* fecha lineRef */}

      {/* ── Zoom control — flutuante canto inferior direito ── */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        display: 'flex', alignItems: 'center',
        border: '1px solid #e4e4e7', background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        zIndex: 10,
      }}>
        <button
          onClick={() => handleZoom(-ZOOM_STEP)}
          disabled={cellW <= 96}
          title="Zoom out (−10%)"
          style={{
            padding: '5px 10px', border: 'none', borderRight: '1px solid #e4e4e7',
            background: 'none', fontSize: 15, lineHeight: 1, fontWeight: 700,
            color: cellW <= 96 ? '#d4d4d8' : '#52525b',
            cursor: cellW <= 96 ? 'not-allowed' : 'pointer',
          }}
        >−</button>
        <span
          onDoubleClick={resetZoom}
          title="Double-click para resetar para 100%"
          style={{
            padding: '5px 12px', minWidth: 44, textAlign: 'center',
            fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
            color: '#09090b', userSelect: 'none', cursor: 'default',
          }}
        >
          {Math.round(cellW / 160 * 100)}%
        </span>
        <button
          onClick={() => handleZoom(ZOOM_STEP)}
          disabled={cellW >= 320}
          title="Zoom in (+10%)"
          style={{
            padding: '5px 10px', border: 'none', borderLeft: '1px solid #e4e4e7',
            background: 'none', fontSize: 15, lineHeight: 1, fontWeight: 700,
            color: cellW >= 320 ? '#d4d4d8' : '#52525b',
            cursor: cellW >= 320 ? 'not-allowed' : 'pointer',
          }}
        >+</button>
      </div>

    </div>  {/* fecha wrapper relativo */}
```

- [ ] **Step 2: Verificar no browser que o zoom funciona**

```bash
npm run dev
```

1. Abrir Picking Line
2. Clicar `+` várias vezes → grade deve ampliar, fontes devem escalar
3. Clicar `−` → grade deve encolher
4. Double-click no percentual → deve voltar para 100%
5. Fechar a aba e reabrir → o zoom deve ser restaurado (localStorage)
6. Verificar que o botão não scrolla com a grade

- [ ] **Step 3: Commit**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat(picking-line): add floating zoom control (60%–200%, persisted in localStorage)"
```

---

## Task 4: Indicador de rack visível (pill flutuante)

**Files:**
- Modify: `src/pages/PickingLine.tsx`

### Contexto

Ao scrollar horizontalmente, o operador perde o nome do rack quando o cabeçalho some da view. Uma pill escura com o nome do rack aparece no canto superior esquerdo ao scrollar e some 1.5s após parar.

- [ ] **Step 1: Adicionar estado e ref da pill após os states existentes**

Após a declaração de `flashedSlots` (linha ~274), adicionar:

```ts
// Rack scroll indicator — pill
const [visibleRackName, setVisibleRackName] = useState<string | null>(null)
const [pillVisible,     setPillVisible]     = useState(false)
const pillHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 2: Adicionar handler `handlePickingLineScroll`**

Logo após `function resetZoom()` (adicionado na Task 1), adicionar:

```ts
function handlePickingLineScroll(e: React.UIEvent<HTMLDivElement>) {
  const scrollLeft = e.currentTarget.scrollLeft

  // Não mostrar pill quando o scroll está no início
  if (scrollLeft === 0) {
    if (pillHideTimerRef.current) clearTimeout(pillHideTimerRef.current)
    setPillVisible(false)
    return
  }

  // Encontrar o rack mais à esquerda ainda "dentro" da view
  // Um rack é "atual" se seu offsetLeft é <= scrollLeft + threshold
  const threshold = ROW_LABEL_W + GRID_PAD   // 40 + 20 = 60px
  let currentName: string | null = null
  for (const rack of visibleRacks) {
    const el = rackRefs.current[rack.id]
    if (!el) continue
    if (el.offsetLeft <= scrollLeft + threshold) {
      currentName = rack.name
    }
  }

  if (currentName) setVisibleRackName(currentName)
  setPillVisible(true)

  // Debounce: some 1.5s após parar o scroll
  if (pillHideTimerRef.current) clearTimeout(pillHideTimerRef.current)
  pillHideTimerRef.current = setTimeout(() => {
    setPillVisible(false)
  }, 1500)
}
```

- [ ] **Step 3: Adicionar `onScroll` ao `lineRef` div**

Na Task 3 já foi criado o wrapper. Localizar o `lineRef` div e adicionar o handler:

```tsx
<div ref={lineRef} onKeyDown={handleGridKeyDown} onScroll={handlePickingLineScroll}
  style={{ width: '100%', height: '100%', display: 'flex', overflowX: 'auto', overflowY: 'hidden', background: '#fff' }}>
```

- [ ] **Step 4: Adicionar a pill no wrapper — entre o fechamento do `lineRef` e o zoom control**

Dentro do wrapper relativo, após `</div> {/* fecha lineRef */}` e antes do zoom control, adicionar:

```tsx
{/* Rack pill — aparece ao scrollar */}
{visibleRackName && (
  <div style={{
    position: 'absolute', top: 12, left: 12,
    padding: '4px 10px',
    background: '#09090b', color: '#fff',
    fontFamily: 'monospace', fontSize: 13, fontWeight: 800,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    opacity: pillVisible ? 1 : 0,
    transition: 'opacity 150ms ease',
    pointerEvents: 'none',
    zIndex: 10,
  }}>
    {visibleRackName}
  </div>
)}
```

- [ ] **Step 5: Verificar no browser**

```bash
npm run dev
```

1. Abrir Picking Line com múltiplos racks (precisa de mais de um rack visível)
2. Scrollar horizontalmente → a pill deve aparecer mostrando o nome do rack atual
3. Parar o scroll → pill deve desaparecer após ~1.5s com fade
4. Scrollar de volta para o início → pill some imediatamente (sem delay)

- [ ] **Step 6: Commit**

```bash
git add src/pages/PickingLine.tsx
git commit -m "feat(picking-line): add floating rack indicator pill on horizontal scroll"
```

---

## Task 5: Toggle de filtro multi-valor em `INVCodeFilter.tsx`

**Files:**
- Modify: `src/pages/INVCodeFilter.tsx`

### Contexto

O componente tem uma seção "2 — Bulk text input" que aceita múltiplos códigos separados por vírgula. Esse é um comportamento específico da empresa. Adicionamos um toggle com explicação para que o usuário possa ativá-lo/desativá-lo e entender o que faz.

- [ ] **Step 1: Adicionar estado `bulkEnabled` com persistência em localStorage**

Em `INVCodeFilter.tsx`, após os states `inputValue` e `listSearch` (linha ~24), adicionar:

```ts
const [bulkEnabled, setBulkEnabled] = useState<boolean>(() => {
  // Default true — preserva comportamento atual para usuários existentes
  return localStorage.getItem('nc-inv-bulk-filter') !== 'false'
})
```

- [ ] **Step 2: Adicionar handler `handleBulkToggle`**

Logo após a função `clear()`, adicionar:

```ts
function handleBulkToggle(enabled: boolean) {
  setBulkEnabled(enabled)
  localStorage.setItem('nc-inv-bulk-filter', String(enabled))
  if (!enabled) {
    setInputValue('')   // limpa o campo ao desativar (sem afetar `selected`)
  }
}
```

- [ ] **Step 3: Atualizar o `useEffect` de abertura do dropdown**

O `useEffect` atual (linha ~33) foca o `inputRef` sempre que o dropdown abre. Quando `bulkEnabled` é false, o input não existe — não deve tentar focar. Atualizar:

```ts
useEffect(() => {
  if (open) {
    setListSearch('')
    if (bulkEnabled) {
      setInputValue(selected.join(', '))
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }
}, [open])
```

- [ ] **Step 4: Substituir o cabeçalho da seção bulk pelo novo toggle**

Localizar a seção `{/* 2 — Bulk text input */}` e substituir todo o seu conteúdo:

```tsx
{/* 2 — Bulk text input */}
<div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #e4e4e7', flexShrink: 0 }}>

  {/* Toggle header */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: bulkEnabled ? 7 : 0 }}>
    <input
      type="checkbox"
      id="inv-bulk-toggle"
      checked={bulkEnabled}
      onChange={e => handleBulkToggle(e.target.checked)}
      style={{ cursor: 'pointer', flexShrink: 0, margin: 0 }}
    />
    <label
      htmlFor="inv-bulk-toggle"
      style={{
        fontSize: 10, fontWeight: 700, color: '#a1a1aa',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        cursor: 'pointer', flex: 1,
      }}
    >
      Filtro por lista
    </label>
    <span
      title="Modo especial: filtre múltiplos códigos de uma vez colando uma lista separada por vírgulas. Útil para reconciliações e conferências em lote."
      style={{ cursor: 'help', color: '#a1a1aa', fontSize: 13, lineHeight: 1, userSelect: 'none' }}
    >
      ⓘ
    </span>
  </div>

  {/* Input bulk — só quando ativado */}
  {bulkEnabled && (
    <>
      <input
        ref={inputRef}
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') applyFilter() }}
        placeholder="e.g. 6325, 6323, 6324"
        style={{
          width: '100%', padding: '6px 8px', boxSizing: 'border-box',
          border: '1px solid #e4e4e7', background: '#fafafa',
          fontSize: 12, outline: 'none', color: '#09090b',
          fontFamily: 'monospace', letterSpacing: '0.03em',
        }}
        onFocus={e => (e.target.style.borderColor = '#2563eb')}
        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
      />
      <div style={{ marginTop: 5, fontSize: 11, color: '#a1a1aa' }}>
        Press{' '}
        <kbd style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: 3, padding: '0 4px', fontSize: 10, fontFamily: 'inherit' }}>
          Enter
        </kbd>
        {' '}or click Apply. Unknown codes are ignored.
      </div>
    </>
  )}

</div>
```

- [ ] **Step 5: Tornar o botão Apply condicional**

Localizar a seção `{/* 5 — Apply button */}` e envolver com condição:

```tsx
{/* 5 — Apply button */}
{bulkEnabled && (
  <div style={{ padding: '8px 10px', borderTop: '1px solid #f4f4f5', flexShrink: 0 }}>
    <button
      onClick={applyFilter}
      style={{
        width: '100%', padding: '7px',
        background: '#09090b', border: 'none',
        color: '#fff', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', letterSpacing: '0.04em',
      }}
    >
      Apply Filter
    </button>
  </div>
)}
```

- [ ] **Step 6: Verificar no browser**

```bash
npm run dev
```

1. Abrir Inventory → clicar no filtro de Code
2. Verificar que o toggle "Filtro por lista" aparece com checkbox marcado
3. Hover no ⓘ → tooltip deve aparecer com a explicação
4. Desmarcar o checkbox → campo de texto e botão Apply devem sumir; checkbox list permanece
5. Fechar e reabrir o dropdown → estado do toggle deve ser preservado
6. Recarregar a página → preferência deve ser restaurada via localStorage

- [ ] **Step 7: Commit**

```bash
git add src/pages/INVCodeFilter.tsx
git commit -m "feat(inventory): add toggleable bulk filter with explanation tooltip"
```

---

## Self-review

**Spec coverage:**
- ✅ Zoom: range 60-200%, step 10%, localStorage `nc-pl-zoom`, botão flutuante inferior direito
- ✅ Zoom: double-click reseta para 100%
- ✅ Zoom: fontes de SlotCell escalam proporcionalmente com mínimos absolutos
- ✅ Indicador: pill superior esquerdo, debounce 1.5s, fade 150ms
- ✅ Indicador: não exibe quando scrollLeft=0
- ✅ Filter toggle: default true (retrocompatível), localStorage `nc-inv-bulk-filter`
- ✅ Filter toggle: ao desativar, inputValue limpo mas `selected` preservado
- ✅ Filter toggle: Apply button também ocultado quando desativado

**Placeholders:** nenhum.

**Consistência de tipos:** `ZOOM_STEP` declarado na Task 1 e referenciado na Task 3 ✅. `handlePickingLineScroll` declarado na Task 4 Step 2 e usado na Task 4 Step 3 ✅. `bulkEnabled` declarado na Task 5 Step 1 e usado nos Steps 3-5 ✅.
