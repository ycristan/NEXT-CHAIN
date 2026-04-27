# NEXT Warehouse Manager — Context for Claude

## O que é
Sistema de gerenciamento de armazém (WMS) chamado **NEXT CHAIN WMS**.
Gerencia inventário de marcas/produtos, racks, slots, picking e movimentações logísticas.

## Stack
- React 19 + TypeScript + Vite
- React Router 7
- Zustand + TanStack Query (Query instalado, pouco usado até agora)
- React Hook Form + Zod (instalados, parcialmente usados)
- Tailwind CSS 4 + Lucide React
- Supabase (PostgreSQL + Auth + Storage + Realtime)
- `@tanstack/react-virtual` — instalado, usado no Inventory para virtualização de lista

## Comandos
```bash
npm run dev      # dev server
npm run build    # build produção
npm run lint     # lint
npm test         # Vitest (run once)
npm run test:watch  # Vitest watch mode
```

## Context7 — Documentação actualizada

**Usar Context7 antes de usar APIs de bibliotecas do projecto.** Evita funções deprecadas e padrões de versões antigas.

| Biblioteca | ID Context7 |
|---|---|
| React | `/facebook/react` |
| Supabase | `/supabase/supabase` |
| TanStack Query | `/tanstack/query` |
| TanStack Virtual | `/tanstack/virtual` |
| Vitest | `/vitest-dev/vitest` |
| Vite | `/vitejs/vite` |
| React Router | `/remix-run/react-router` |
| Zod | `/colinhacks/zod` |

## Estrutura de pastas
```
src/
  App.tsx              # roteamento principal
  components/
    layout/            # Layout, Sidebar, Header, TabBar, TabContent
    ui/                # Modal, PageHeader, Table
    ProtectedRoute.tsx
  contexts/            # AuthContext, TabsContext, ToastContext
  lib/                 # supabase.ts, utils.ts, pickingLineService.ts, exportLabels.ts
  pages/               # módulos da aplicação
  types/index.ts       # tipos TypeScript
sql/                   # todos os scripts SQL para Supabase
```

## Módulos implementados

- **Auth** — email/senha, RLS, roles: admin, manager, operator, viewer

- **Inventory (INV)** — CRUD completo de marcas:
  - 3 imagens por marca, import CSV bulk
  - Virtualização com `@tanstack/react-virtual` (2263+ registros), paginação loop Supabase (`.range`)
  - Sub-abas dentro de "Active": **Allocated Items** e **Unallocated Items** com badges de contagem
  - `allocMap: Map<string, string[]>` — mapeia `brand_id` → lista de `bin_addresses` (slots + fridge em paralelo)
  - Realtime channel `inv-alloc-realtime` sincroniza `slots` e `fridge_items` para manter `allocMap` atualizado
  - Coluna **Bin Address** visível em qualquer tab/sub-tab quando seleccionada no column picker — usa `allocMap` directamente, mostra `'—'` para marcas não alocadas
  - **Sort A→Z / Z→A** em todos os headers via `sortKey` + `sortDir` no `TabFilters`
  - `displayList` ordenado client-side com `localeCompare({ numeric: true })` para `brand_code`
  - Filtros **context-aware**: opções derivadas de `tabBase` (dataset da aba ativa pré-filtros), nunca do dataset global
  - `binAddressOptions` derivado de `tabBase.flatMap(b => allocMap.get(b.id) ?? [])`
  - **`INVCodeFilter` híbrido**: Sort options + Bulk text (vírgula) + Checkbox list escopo da aba + List search + Apply/Clear
  - `tabHasFilters` e `hasFilters` usam `.filter(Array.isArray)` para proteger contra campos não-array em `TabFilters`
  - Deleção admin + notificação admin para não-admins

- **System Library (SL)** — categorias hierárquicas, SKU types, rack types

- **Users / UserProfile**

- **Fridge** — módulo completo (`src/pages/Fridge.tsx` + `sql/fridge_setup.sql`):
  - Cards com image, brand info, BPU; `bin_address` GENERATED ALWAYS AS ('Fridge') STORED
  - Add modal filtrado por Category1; Delete admin-only
  - Hover image preview (mesmo widget do Picking Line)
  - Realtime sync via `fridge_items` + `fridge_items_view`

- **Picking Line** — módulo mais completo do projeto:
  - Visualização horizontal por rack type, sub-abas automáticas, sidebar scroll-to
  - Grid de slots (`CELL_W=160px` fixo, altura `1fr`). Anatomia: `brand_code` top-left, BPU top-right, `brand_name` center 2-line, `bin_address` bottom-left, light indicator bottom-right (off/on/blink)
  - Slots `expansion_reserved`: borda dashed roxa, seta direção central, estado via DB trigger
  - **PLSlotModal** — modo Brand | Expansion Flow; busca prefix-priority; move automático; toggle Light ON/OFF retangular; inicializado do `slot.light_status` atual
  - **PLSlotContextMenu** — Quick Allocation (right-click OU Enter num slot focado); mini-modal dark 272px, admin-only:
    - Light Address (auto-foco no mount) + Brand search dropdown filtrado por categoria
    - Busca **prefix-priority**: prefix-match antes de contains-match, cada grupo ordenado por `localeCompare({ numeric: true })`
    - Clicar/selecionar brand salva imediatamente sem precisar de Confirm
    - `light_status: 'on'` quando `light_address` preenchido, `'off'` quando vazio
    - Navegação teclado: ArrowDown/Up no dropdown, Enter seleciona/salva, Tab → Cancel/Confirm, Esc fecha dropdown → depois modal
  - **PLRackEditModal** — edita rack_type, posições, allowed_categories (name/dimensions bloqueados); usa `PLCategoryAccordion`
  - **PLRackDuplicateModal** — copia rack + categorias + slots (opcional, com fallback se 23505)
  - **Drag & Drop sidebar** — reordenação por `sort_order`; `sql/racks_sort_order.sql`; recycled sort_order strategy por tipo
  - **Impressão** (PLPrintView): 3 modos table/grid/notes, landscape A4, cabeçalho repetido (`table-header-group`), suporte a `isDraft=true` (banner âmbar "DRAFT / PLANNING LAYOUT")
  - **Export XLSX** (`src/lib/exportLabels.ts`): apenas `brand_allocated`, colunas Code/Name/BPU/BIN, filename dinâmico
  - **Replanning — Fases 1-4 completas:**
    - Tabela `replanning_slots` (`sql/replanning_slots.sql`) — draft sandbox
    - `startReplanning` copia estrutura física E `light_address` dos slots oficiais (hardware preservado)
    - Draft editor: `PLReplanningView.tsx` — grid com amber border, hover reference card, checklist lateral
    - `PLReplanningSlotModal.tsx` — alocação com badges DRAFT/CURRENT/Official
    - Checklist lateral (260px): todos os brands do mesmo tipo de rack, strikethrough quando alocados em qualquer draft ativo, search, progress bar
    - Publicação: função SQL `publish_replanning` (4 passos atômicos) — COALESCE `light_address` (nunca perde hardware)
    - Re-auth admin via `supabase.auth.signInWithPassword` antes de publicar
  - **Hover Image Preview** (`PLSlotImagePreview.tsx`) — widget 96×96px, `forwardRef` + `useImperativeHandle`; handle `show(brand, image, loading)` / `hide()`; estado interno próprio (hover NUNCA causa re-render do PickingLine); debounce 50ms; cache por brand id em ref
  - **Navegação 2D por teclado no grid:**
    - `ArrowUp/Down` → mesma coluna, linha anterior/próxima (sem wrap nas bordas)
    - `ArrowLeft/Right` → mesma linha, coluna anterior/próxima — cruza racks automaticamente
    - Event delegation no container (`lineRef`), lê `data-rack-idx`, `data-col-idx`, `data-row-idx` do `document.activeElement`
    - `scrollIntoView({ behavior: 'smooth', inline: 'nearest' })` ao cruzar rack boundaries
    - `Space` num slot focado → abre PLSlotModal; `Enter` → abre PLSlotContextMenu
    - `data-slot-id` attribute para restauração de foco após fechar modal
  - **Performance / Anti-flicker:**
    - `SlotCell` como `React.memo` com comparador customizado (inclui `rackIdx`, `colIdx`, `rowIdx` além dos dados do slot)
    - `handleSlotMouseEnter` e `handleSlotMouseLeave` como `useCallback(fn, [])` — referências estáveis
  - **Supabase Realtime** — sync multi-tab/multi-usuário sem F5 (ver seção abaixo)

## Módulos pendentes (stubs)
- Dashboard — vazio
- Products, Movements, Reports, Settings, Suppliers, Warehouse General

---

## DIRETRIZ DE UI/UX — PERSISTÊNCIA DE ESTADO (OBRIGATÓRIO)
> Todas as operações de salvamento (Racks, Slots, Fridge, qualquer modal de CRUD) devem preservar o estado atual da interface. Isso inclui a manutenção da Sub-aba ativa e a posição do Scroll Horizontal. É proibido resetar a visualização para o estado inicial após ações de banco de dados.

**Como implementar:**
- `loadAll()` (e funções equivalentes em outros módulos) deve aceitar `{ silent?: boolean }`.
- Callers pós-save usam `loadAll({ silent: true })`: sem spinner, sem `setLoading`, sem `setActiveTypeId`, sem `pendingScrollRef`. O DOM permanece intacto e o `scrollLeft` é preservado naturalmente pelo browser.
- Callers de carga inicial e após deleção destrutiva usam `loadAll()` (silent=false): exibe spinner e restaura tab/scroll via `pendingScrollRef`.
- `_store.activeTypeId` (module-level) guarda a sub-aba ativa entre navegações de tab no sistema.

---

## Padrões de código
- Estado: React Context (Auth, Tabs, Toast) + useState local
- Persistência de filtros entre navegação: `_store` object no nível do módulo (fora do componente)
- Dados: Supabase direto nos componentes via useEffect
- Paginação completa Supabase: loop com `.range(from, to)` (PAGE_SIZE=1000) para bypass do limite de 1000 rows
- Navegação: tab-based (sidebar abre módulos como abas via TabsContext)
- Formulários: useState inline (RHF/Zod instalados mas pouco usados)
- Filtragem: client-side em React state
- Estilo: inline styles (não Tailwind utilitário nos módulos novos), sem CSS modules
- Role check: sempre `profile?.role?.toLowerCase() === 'admin'`

## Padrões defensivos críticos (evitam white-screen)
- **`.filter(Array.isArray)` em `Object.values(TabFilters)`**: `TabFilters` tem campos não-array (`sortKey`, `sortDir`). Sempre usar `.filter(Array.isArray)` antes de `.some(v => v.length > 0)`.
- **Ordem de `const` encadeadas**: se `tabBase` depende de `allocatedBrandIds`, declarar `allocatedBrandIds` ANTES. TDZ causa `ReferenceError` silencioso (white-screen).
- **`light_status` ao salvar slot**: ao salvar qualquer update com `light_address`, sempre incluir `light_status: addr ? 'on' : 'off'` (exceto PLSlotModal completo que tem toggle manual).
- **SlotCell comparador customizado**: qualquer novo prop de dado deve ser adicionado ao comparador do `React.memo`.
- **SQL constraints condicionais**: usar `DO $$ BEGIN IF NOT EXISTS (...) THEN ALTER TABLE ... ADD CONSTRAINT ...; END IF; END $$`

---

## Banco de dados (Supabase/PostgreSQL)

Tabelas: `profiles`, `categories`, `sku_types`, `rack_types`, `racks`, `slots`, `rack_allowed_categories`, `brands`, `admin_notifications`, `replanning_slots`, `fridge_items`, `fridge_allowed_categories`

Views: `fridge_items_view` (JOIN brands + categories)

`brands` — core do inventário:
- `brand_code` (unique), `brand_name`
- `category_id`, `category1_id` (FK → categories)
- `sku_type_id`, `bpu`, `pallet_size`
- `image1_url`, `image2_url`, `image3_url`
- `notes`, `is_active`

`racks` — rack físico da linha de picking:
- `name` (1-2 dígitos, unique), `rack_type_id`, `columns`, `rows`
- `solo_picking_pos`, `combo_picking_pos`, `sort_order`
- `active`

`slots` — slot individual do rack (auto-gerado):
- `rack_id`, `column_letter`, `row_number`
- `bin_address` (auto-computed trigger: "40 A01")
- `allocated_brand_id`, `light_address`, `light_status`, `is_refill`
- `slot_state` (empty|brand_allocated|expansion_reserved), `expansion_direction`

`rack_allowed_categories` — junction: rack ↔ categories

`admin_notifications` — pedidos de deleção de não-admins

`replanning_slots` — cópia sandbox para replanning draft (espelha `slots`)

`fridge_items` — itens alocados no Fridge; `bin_address` GENERATED ALWAYS AS ('Fridge') STORED

`fridge_allowed_categories` — junction: fridge ↔ categories

Storage bucket: `brands` (público) — imagens das marcas

Bin address format: `"<rack_name> <col_letter><row_padded_2>"` ex: "40 A01" — gerado por trigger PostgreSQL.

## DIRETRIZ OBRIGATÓRIA: Novos scripts SQL

**Sempre que um novo arquivo SQL for criado em `sql/`, avisar imediatamente o utilizador:**
> "Este script precisa ser executado manualmente no Supabase SQL Editor (supabase.com → seu projeto → SQL Editor) antes de a feature funcionar."

O Supabase não executa scripts automaticamente. Sem este aviso, a feature falha silenciosamente.

## Scripts SQL (pasta sql/)
- `supabase_setup.sql` — setup inicial
- `supabase_v2_migration.sql` — rack_types, categories, update_updated_at()
- `supabase_brands_migration.sql` — tabela brands
- `fix_profiles_rls_recursion.sql` — **CRÍTICO**: cria `is_admin()` SECURITY DEFINER, corrige recursão RLS em profiles
- `add_admin_notifications.sql` — tabela admin_notifications
- `picking_line_racks_slots.sql` — tabelas racks, slots, rack_allowed_categories + triggers bin_address
- `add_brands_indexes.sql` — índices de performance em brands
- `picking_line_allocation.sql` — trigger unicidade: um brand por rack_type (ERRCODE 23505)
- `picking_line_slot_states.sql` — colunas `slot_state` / `expansion_direction` + trigger `sync_slot_state`
- `realtime_enable.sql` — REPLICA IDENTITY FULL + ALTER PUBLICATION para slots, racks, fridge_items, replanning_slots
- `replanning_slots.sql` — tabela `replanning_slots` + trigger + RLS
- `replanning_publish.sql` — função `publish_replanning` (4 passos atômicos, COALESCE light_address)
- `fridge_setup.sql` — tabelas `fridge_items`, `fridge_allowed_categories` + view `fridge_items_view`
- `racks_sort_order.sql` — coluna `sort_order` em racks + index

## Função RLS crítica
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) = 'admin');
$$;
```
Usada em todas as policies de INSERT/DELETE para evitar recursão infinita.

---

## Picking Line — schema de slots

| Campo | Tipo | Regra |
|---|---|---|
| `allocated_brand_id` | UUID FK brands | NULL quando vazio ou expansion_reserved |
| `slot_state` | TEXT enum | auto-derivado pelo trigger sync_slot_state |
| `expansion_direction` | TEXT enum | só preenchido quando expansion_reserved |
| `light_address` | TEXT | endereço físico da luz |
| `light_status` | TEXT enum | off / on / blink |

**Estado máquina:** empty ↔ brand_allocated ↔ (reset) empty → expansion_reserved

## Picking Line — padrões específicos
- Células de slot: largura fixa `CELL_W = 160px`, altura responsiva (1fr)
- Grid: CSS grid com `gridTemplateColumns: '40px repeat(N, 160px)'`
- Bin address format: `"<rack_name> <col_letter><row_padded_2>"` ex: "40 A01"
- Scroll horizontal: `overflowX: auto` no container + `rackRefs` + `scrollTo`
- Sub-abas por tipo derivadas dos racks carregados (não de rack_types direto)
- Estado ativo persistido em `_store.activeTypeId`
- Slot query: join para brand `brand:allocated_brand_id(brand_code, brand_name, bpu)` + `light_address` + `light_status`
- Anatomia interna do slot (position: relative + absolute):
  - top-left: brand_code (10px mono bold)
  - top-right: BPU como `×N` (10px)
  - center: brand_name (-webkit-line-clamp: 2)
  - bottom-left: bin_address (9px mono, sempre visível)
  - bottom-right: círculo 16px — verde se on/blink, cinza se off; blink usa `@keyframes pl-blink`
- **Busca de brand**: prefix-match antes de contains-match, cada grupo ordenado por `localeCompare({ numeric: true })`

---

## Supabase Realtime — padrão implementado

**SQL obrigatório** (`sql/realtime_enable.sql`):
```sql
ALTER TABLE public.slots            REPLICA IDENTITY FULL;
ALTER TABLE public.racks            REPLICA IDENTITY FULL;
ALTER TABLE public.fridge_items     REPLICA IDENTITY FULL;
ALTER TABLE public.replanning_slots REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.slots;
-- (+ racks, fridge_items, replanning_slots)
```

**Estratégia de update cirúrgico:**
- `UPDATE` → fetch só aquele slot com join de brand → `setAllSlots(prev => { list[i] = slot; return { ...prev, [rack_id]: list } })`
- `INSERT` → fetch só o novo slot → push no state
- `DELETE` → filter out by id (usa `payload.old.rack_id` se REPLICA IDENTITY FULL)
- Mudanças em `racks` → `loadAll({ silent: true })`
- Channel `inv-alloc-realtime` (Inventory) → recalcula `allocMap` ao detectar mudanças em `slots` ou `fridge_items`

**Flash animation:** slot/card flasha com overlay `rgba(59,130,246,0.28)` + `@keyframes pl-flash` por 1.4s. `flashedSlots: Set<string>` state.

**`loadAllRef` pattern** — evita stale closure em effects com deps vazia:
```typescript
const loadAllRef = useRef(null as any)
useEffect(() => { loadAllRef.current = loadAll }) // sem deps — atualiza todo render
```

---

## Variáveis de ambiente
`.env` contém `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

---

## DIRETRIZ DE NAVEGAÇÃO: Grid Operacional

### Directional Navigation (OBRIGATÓRIO em grids)

1. **Setas direcionais** são a ferramenta principal de produtividade:
   - `ArrowUp/Down` → mesma coluna, linha anterior/próxima
   - `ArrowLeft/Right` → mesma linha, coluna anterior/próxima — cruzando racks automaticamente

2. **Focus Management**: Cada slot deve expor `data-rack-idx`, `data-col-idx`, `data-row-idx` (0-based).

3. **Implementação padrão** (event delegation no container):
   ```tsx
   function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
     if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return
     const active = document.activeElement as HTMLElement | null
     if (!active?.dataset.slotId) return
     // lê data-rack-idx / data-col-idx / data-row-idx, calcula alvo, foca
   }
   <div ref={lineRef} onKeyDown={handleGridKeyDown}>
   ```

4. **Tab como fallback**: `tabIndex` column-first (`rackOffset + colIdx * rows + row`).

5. **Scroll automático**: `el.scrollIntoView({ inline: 'nearest' })` ao cruzar rack boundaries.

6. **Restauração de foco**: `lastFocusedSlotId` ref + `querySelector([data-slot-id="..."])?.focus()` ao fechar modal.

---

## DIRETRIZ DE DESENVOLVIMENTO: Filtros de Tabela

### Context-Aware Filtering (OBRIGATÓRIO)

As opções de filtro devem ser derivadas do dataset já filtrado pela aba/view ativa, **nunca** do dataset global.

**Regra de Ouro:** Se o registro não está na lista da aba atual, não deve existir como opção de filtro.

**Implementação padrão:**
1. Calcule `tabBase` — dataset filtrado pela aba ativa, **antes** dos filtros de coluna.
2. Derive todas as opções de `tabBase`, não da lista global.
3. Use `uniq(tabBase.map(...))` para deduplicação.

```tsx
const tabBase = brands.filter(b => {
  if (activeTab === 'inactive' && b.is_active) return false
  if (activeTab === 'active' && !b.is_active) return false
  return true
})
const nameOptions = uniq(tabBase.map(b => b.brand_name)).sort().map(v => ({ value: v, label: v }))
```
