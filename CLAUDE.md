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
- Supabase (PostgreSQL + Auth + Storage)
- `@tanstack/react-virtual` — instalado, usado no Inventory para virtualização de lista

## Comandos
```bash
npm run dev      # dev server
npm run build    # build produção
npm run lint     # lint
```

## Estrutura de pastas
```
src/
  App.tsx              # roteamento principal
  components/
    layout/            # Layout, Sidebar, Header, TabBar, TabContent
    ui/                # Modal, PageHeader, Table
    ProtectedRoute.tsx
  contexts/            # AuthContext, TabsContext, ToastContext
  lib/                 # supabase.ts, utils.ts
  pages/               # módulos da aplicação
  types/index.ts       # tipos TypeScript
sql/                   # todos os scripts SQL para Supabase
```

## Módulos implementados
- **Auth** — email/senha, RLS, roles: admin, manager, operator, viewer
- **Inventory (INV)** — CRUD de marcas, filtros avançados por sub-aba, badges de contagem, 3 imagens por marca, import CSV bulk, virtualização com @tanstack/react-virtual (2263+ registros), paginação loop Supabase (.range), filtro multi-valor por Brand Code (vírgula separada), deleção admin + notificação admin para não-admins
- **System Library (SL)** — categorias hierárquicas, SKU types, rack types
- **Users / UserProfile**
- **Picking Line** — visualização horizontal por rack type, sub-abas automáticas, sidebar scroll-to, grid de slots (CELL_W=160px fixo, altura 1fr). Anatomia do slot: brand_code/BPU corners, brand_name center 2-line, bin_address bottom-left sempre, light indicator circular (off/on/blink). Slots expansion_reserved: borda dashed roxa, seta de direção central, estado via DB trigger. Modal (PLSlotModal): modo Brand | Expansion Flow, busca de brand, move automático entre slots, trava expansion. Impressão (PLPrintView): 3 modos table/grid/notes, landscape forçado `@page { size: A4 landscape }`, cabeçalho repetido via `table-header-group`. Export XLSX (src/lib/exportLabels.ts): apenas brand_allocated, colunas Code/Name/BPU/BIN, filename dinâmico. Serviço em src/lib/pickingLineService.ts.

## Módulos pendentes (stubs)
- Dashboard, Products, Movements, Reports, Settings, Suppliers
- Warehouse General

## DIRETRIZ DE UI/UX — PERSISTÊNCIA DE ESTADO (OBRIGATÓRIO)
> Todas as operações de salvamento (Racks, Slots, Fridge, qualquer modal de CRUD) devem preservar o estado atual da interface. Isso inclui a manutenção da Sub-aba ativa e a posição do Scroll Horizontal. É proibido resetar a visualização para o estado inicial após ações de banco de dados.

**Como implementar:**
- `loadAll()` (e funções equivalentes em outros módulos) deve aceitar `{ silent?: boolean }`.
- Callers pós-save usam `loadAll({ silent: true })`: sem spinner, sem `setLoading`, sem `setActiveTypeId`, sem `pendingScrollRef`. O DOM permanece intacto e o `scrollLeft` é preservado naturalmente pelo browser.
- Callers de carga inicial e após deleção destrutiva usam `loadAll()` (silent=false): exibe spinner e restaura tab/scroll via `pendingScrollRef`.
- `_store.activeTypeId` (module-level) guarda a sub-aba ativa entre navegações de tab no sistema.

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

## Banco de dados (Supabase/PostgreSQL)
Tabelas principais: `profiles`, `categories`, `sku_types`, `rack_types`, `racks`, `slots`, `rack_allowed_categories`, `brands`, `admin_notifications`

`brands` — core do inventário:
- brand_code (unique), brand_name
- category_id, category1_id (FK → categories)
- sku_type_id, bpu, pallet_size
- image1_url, image2_url, image3_url
- notes, is_active

`racks` — rack físico da linha de picking:
- name (1-2 dígitos, unique), rack_type_id, columns, rows
- solo_picking_pos, combo_picking_pos
- active

`slots` — slot individual do rack (auto-gerado):
- rack_id, column_letter, row_number
- bin_address (auto-computed trigger: "40 A01")
- allocated_brand_id, light_address, light_status, is_refill

`rack_allowed_categories` — junction: rack ↔ categories

`admin_notifications` — pedidos de deleção de não-admins

Storage bucket: `brands` (público) — imagens das marcas

## Scripts SQL (pasta sql/)
- `supabase_setup.sql` — setup inicial
- `supabase_v2_migration.sql` — rack_types, categories, update_updated_at()
- `supabase_brands_migration.sql` — tabela brands
- `fix_profiles_rls_recursion.sql` — **CRÍTICO**: cria is_admin() SECURITY DEFINER, corrige recursão RLS em profiles
- `add_admin_notifications.sql` — tabela admin_notifications
- `picking_line_racks_slots.sql` — tabelas racks, slots, rack_allowed_categories + triggers bin_address
- `add_brands_indexes.sql` — índices de performance em brands
- `picking_line_allocation.sql` — trigger unicidade: um brand por rack_type (ERRCODE 23505)
- `picking_line_slot_states.sql` — colunas slot_state (empty|brand_allocated|expansion_reserved) e expansion_direction (above|below|left|right|NULL); trigger sync_slot_state auto-deriva estado; constraints cross-column

## Função RLS crítica
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) = 'admin');
$$;
```
Usada em todas as policies de INSERT/DELETE para evitar recursão infinita.

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
- Scroll horizontal para múltiplos racks: `overflowX: auto` no container + `rackRefs` + `scrollTo`
- Sub-abas por tipo derivadas dos racks carregados (não de rack_types direto)
- Estado ativo persistido em `_store.activeTypeId`
- Slot query usa join para brand: `brand:allocated_brand_id(brand_code, brand_name, bpu)`
- Slot também carrega `light_address` e `light_status` (off | on | blink)
- Anatomia interna do slot (position: relative + absolute nos 4 cantos + center):
  - top-left: brand_code (10px mono bold)
  - top-right: BPU como `×N` (10px)
  - center: brand_name (-webkit-line-clamp: 2, overflow: hidden)
  - bottom-left: bin_address (9px mono, sempre visível mesmo slot vazio)
  - bottom-right: círculo 16px — verde se on/blink, cinza se off; blink usa @keyframes pl-blink

## Variáveis de ambiente
`.env` contém VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

## DIRETRIZ DE NAVEGAÇÃO: Grid Operacional

### Directional Navigation (OBRIGATÓRIO em grids)

1. **Setas direcionais** são a ferramenta principal de produtividade em interfaces de grid (Racks, slots). O movimento X/Y deve ser natural:
   - `ArrowUp/Down` → mesma coluna, linha anterior/próxima
   - `ArrowLeft/Right` → mesma linha, coluna anterior/próxima — cruzando racks automaticamente

2. **Focus Management**: Cada slot deve expor `data-rack-idx`, `data-col-idx`, `data-row-idx` (0-based) para que o handler de navegação possa localizar o vizinho sem depender de estado React.

3. **Implementação padrão** (event delegation no container):
   ```tsx
   // Handler no container — não passa callback para SlotCell memoizado
   function handleGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
     if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return
     const active = document.activeElement as HTMLElement | null
     if (!active?.dataset.slotId) return
     // lê data-rack-idx / data-col-idx / data-row-idx, calcula alvo, foca
   }
   <div ref={lineRef} onKeyDown={handleGridKeyDown}>
   ```

4. **Tab como fallback**: `tabIndex` column-first (`rackOffset + colIdx * rows + row`) permanece para compatibilidade com Tab do browser. Setas são navegação primária.

5. **Scroll automático**: ao cruzar rack boundaries via ArrowLeft/Right, `el.scrollIntoView({ inline: 'nearest' })` garante visibilidade.

6. **Restauração de foco**: ao fechar modal, `lastFocusedSlotId` ref + `querySelector([data-slot-id="..."])?.focus()` restaura posição exata do operador.

## DIRETRIZ DE DESENVOLVIMENTO: Filtros de Tabela

### Context-Aware Filtering (OBRIGATÓRIO)

Todo componente de filtro em header de tabela deve ser "consciente do contexto". As opções de filtro (dropdown/multi-select) devem ser derivadas do dataset já filtrado pela aba/view ativa, **nunca** do dataset global.

**Regra de Ouro:** Se o registro não está presente na lista que o usuário está vendo na aba atual, ele não deve existir como opção de filtro no header.

**Implementação padrão:**
1. Calcule um `tabBase` — o dataset filtrado pela aba/sub-tab atual, **antes** dos filtros de coluna.
2. Derive todas as opções de filtro de coluna a partir de `tabBase`, não da lista global.
3. Use `uniq(tabBase.map(...))` para extrair valores únicos com deduplicação simples.

**Exemplo (Inventory):**
```tsx
// tabBase: itens da aba ativa antes dos filtros de coluna
const tabBase = brands.filter(b => {
  if (activeTab === 'inactive' && b.is_active) return false
  if (activeTab === 'active' && !b.is_active) return false
  // sub-tab logic...
  return true
})

// Opções derivadas do tabBase (escopo correto)
const nameOptions = uniq(tabBase.map(b => b.brand_name)).sort().map(v => ({ value: v, label: v }))
```

**Verificação de regressão:** A aba 'Inactive' não deve sugerir nomes ou categorias de itens que existem apenas na aba 'Active', e vice-versa.
