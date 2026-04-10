# UX Operacional — Design Spec
**Data:** 2026-04-07
**Módulos afetados:** `PickingLine.tsx`, `INVCodeFilter.tsx`
**Features:** Zoom de grade · Indicador de rack · Toggle de filtro multi-valor

---

## 1. Zoom de Grade (Picking Line)

### Objetivo
Permitir que operadores ajustem o tamanho das células da grade de slots para adaptar a visualização ao seu display e contexto de trabalho.

### Posicionamento
Botão flutuante no **canto inferior direito** da área da grade (`lineRef`), com `position: absolute` dentro do container que receberá `position: relative`. Não interfere com a toolbar do módulo.

### Interação
- Controles: `−` · percentual (display read-only) · `+`
- Incremento: **±10% por clique**
- Range: **60% a 200%**
- Base: `100%` = `CELL_W` original de `160px`
  - 60% → 96px · 80% → 128px · 100% → 160px · 150% → 240px · 200% → 320px
- Double-click no percentual: reseta para 100%

### Estado e persistência
- `CELL_W = 160` (constante de módulo) se torna `cellW: number` via `useState`, inicializado a partir de `localStorage` com chave `nc-pl-zoom` (fallback: `160`)
- A cada mudança, o novo valor é escrito em `localStorage`

### Escala de fontes internas ao SlotCell
Fontes dentro do slot escalam proporcionalmente via fator `scale = cellW / 160`:
- `brand_code`: `10px` → `10 * scale` px (mín 7px)
- `brand_name`: `11px` → `11 * scale` px (mín 8px)
- `bin_address`: `9px` → `9 * scale` px (mín 6px)
- BPU (`×N`): `10px` → `10 * scale` px (mín 7px)
- Expansão arrow: `22px` → `22 * scale` px
- Light indicator circle: `16px` → `16 * scale` px (mín 10px)
- Sem CSS `transform: scale()` — escala via prop para manter texto nítido

### Impacto em SlotCell (memoização)
`cellW` é adicionado como prop de `SlotCell` e incluído no custom comparator:
```ts
prev.cellW === next.cellW
```
Isso garante re-render ao zoom mudar sem quebrar a otimização de callbacks.

### Visual do controle flutuante
```
[ − ]  [ 100% ]  [ + ]
```
- Fundo: `#fff`, borda: `1px solid #e4e4e7`, sombra: `0 2px 8px rgba(0,0,0,0.1)`
- Font: monospace, `font-size: 11px`, `font-weight: 700`
- `z-index: 10` (sobre os slots, abaixo de modais)
- `pointer-events: none` nos slots atrás do botão não é necessário — o botão tem tamanho pequeno

---

## 2. Indicador de Rack Visível (Pill Flutuante)

### Objetivo
Exibir o nome do rack atualmente visível durante o scroll horizontal, evitando desorientação quando o cabeçalho do rack sai de campo.

### Posicionamento
`position: absolute`, **canto superior esquerdo** da grade (`top: 12px; left: 12px`), dentro do mesmo container relativo do zoom. Não conflita com o zoom (inferior direito).

### Comportamento
1. Listener `onScroll` no `lineRef`
2. A cada evento: itera `rackRefs.current`, encontra o rack com maior `offsetLeft` que ainda seja `≤ scrollLeft + threshold` (threshold: `ROW_LABEL_W + GRID_PAD = 60px`)
3. Se o rack encontrado difere do atual → atualiza `visibleRackName`
4. `pillVisible` vai para `true` com fade-in (150ms)
5. Debounce de **1.5s**: após parar o scroll, `pillVisible` vai para `false` com fade-out (200ms)
6. Não exibe se `scrollLeft === 0` e o primeiro rack está totalmente visível (nenhuma ação necessária do usuário)

### Detecção: sem IntersectionObserver
Usa apenas leitura de `offsetLeft` dos `rackRefs` já existentes + `scrollLeft` do `lineRef` — sem overhead adicional, sem novo observer.

### Visual
```
[ 40 ]
```
- Fundo: `#09090b`, texto: `#fff`
- `font-family: monospace`, `font-size: 13px`, `font-weight: 800`
- `padding: 4px 10px`, **sem border-radius** (estética industrial do app)
- Sombra: `0 2px 8px rgba(0,0,0,0.2)`
- Transição de opacidade: `transition: opacity 150ms ease`

### Estado
Dois `useState` locais em `PickingLine`:
```ts
const [visibleRackName, setVisibleRackName] = useState<string | null>(null)
const [pillVisible, setPillVisible]         = useState(false)
```
Ref adicional para o debounce timer: `pillHideTimerRef`. Nenhum impacto em SlotCell.

---

## 3. Toggle de Filtro Multi-Valor (INVCodeFilter)

### Objetivo
Tornar explícito e opcional o modo de filtro por lista de códigos separados por vírgula — um comportamento específico da empresa que usuários novos não descobrem naturalmente.

### Posicionamento
Dentro do dropdown existente de `INVCodeFilter`, no cabeçalho da seção bulk (atualmente label `"Separate codes with commas"`).

### Novo layout do cabeçalho da seção
```
[✓] Filtro por lista   ⓘ
```
- Checkbox nativo à esquerda (estilizado inline)
- Label `"Filtro por lista"` — 10px, uppercase, `#a1a1aa`
- Ícone `ⓘ` à direita com `title` nativo (tooltip do browser):

> "Modo especial: filtre múltiplos códigos de uma vez colando uma lista separada por vírgulas. Útil para reconciliações e conferências em lote."

### Comportamento do toggle
| Estado | Campo bulk | Hint Enter | Botão Apply |
|---|---|---|---|
| ON (padrão) | Visível | Visível | Visível |
| OFF | Oculto | Oculto | Oculto |

- Ao desativar: `inputValue` é limpo, mas `selected` não é alterado (filtros já aplicados permanecem até o usuário limpar manualmente via Clear)
- Checkbox list e busca de lista funcionam independentemente do toggle
- O toggle não afeta o comportamento de `onChange` nem a interface com `Inventory.tsx`

### Estado e persistência
```ts
const [bulkEnabled, setBulkEnabled] = useState<boolean>(() => {
  return localStorage.getItem('nc-inv-bulk-filter') !== 'false'
})
```
- Persiste em `localStorage` com chave `nc-inv-bulk-filter`
- Default: `true` (compatível com comportamento atual para usuários existentes)

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/pages/PickingLine.tsx` | `CELL_W` → `useState cellW`; `SlotCell` recebe `cellW` prop; comparator atualizado; zoom button flutuante; pill de rack; scroll handler |
| `src/pages/INVCodeFilter.tsx` | Toggle `bulkEnabled`; cabeçalho da seção bulk refatorado; `localStorage` persistence |

## Fora de escopo
- Dark mode
- Tipografia alternativa
- Sidebar "SOON" cleanup
- Qualquer outro módulo
