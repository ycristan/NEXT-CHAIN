# Pre-Merge Fixes — Inventory Search Bar + Column Picker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os issues identificados pelo code review nas branches `feat/inventory-search-bar` e `feat/inventory-column-picker` antes do merge para main.

**Architecture:** Cada branch recebe seus fixes e um commit dedicado. Sem criação de novas branches — os fixes vão diretamente nas feature branches existentes que ainda não foram mergeadas. Após os fixes, merge sequencial para main.

**Tech Stack:** React 19 + TypeScript + Supabase · Vitest para testes · `git` para merges

---

## Mapa de arquivos

| Branch | Arquivo | Mudança |
|---|---|---|
| `feat/inventory-search-bar` | `src/pages/Inventory.tsx` | Fix botão × + click-outside handler |
| `feat/inventory-column-picker` | `src/pages/INVColumnPicker.tsx` | handleDelete error + privateViews filter |
| `feat/inventory-column-picker` | `src/pages/Inventory.tsx` | loadBarcodesMap pagination + colSpan guard |

---

## Task 1: Fix feat/inventory-search-bar

**Files:**
- Modify: `src/pages/Inventory.tsx:96–101, 511–569`

- [ ] **Step 1: Checkout a branch correta**

```bash
cd "C:\Users\yuridelima\Desktop\Projetos Programacao\NEXT Warehouse Manager"
git checkout feat/inventory-search-bar
git status
```

Expected: `On branch feat/inventory-search-bar`, nothing to commit.

- [ ] **Step 2: Fix 1 — botão × usa `searchInputValue`**

Em `src/pages/Inventory.tsx`, linha 544, trocar a condição do botão ×:

Antes:
```tsx
          {searchQuery && (
            <button onClick={clearSearch} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
          )}
```

Depois:
```tsx
          {searchInputValue && (
            <button onClick={clearSearch} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
          )}
```

- [ ] **Step 3: Fix 2 — adicionar `searchContainerRef` e click-outside handler**

**3a.** Adicionar a ref logo após `searchInputRef` (por volta da linha 100):

Antes:
```tsx
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [, startSearchTransition] = useTransition()
```

Depois:
```tsx
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const [, startSearchTransition] = useTransition()
```

**3b.** Adicionar o `useEffect` de click-outside logo após o bloco de declarações de estado de search (após a linha do `useTransition`, antes do primeiro `useEffect` de dados). Inserir:

```tsx
  useEffect(() => {
    if (!searchDropdownOpen) return
    function onDown(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        clearSearch()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [searchDropdownOpen])
```

**3c.** Adicionar `ref={searchContainerRef}` no `<div>` container da search bar (linha 512):

Antes:
```tsx
        <div style={{ position: 'relative', flex: 1, maxWidth: 300, marginLeft: 8 }}>
```

Depois:
```tsx
        <div ref={searchContainerRef} style={{ position: 'relative', flex: 1, maxWidth: 300, marginLeft: 8 }}>
```

- [ ] **Step 4: Rodar os testes**

```bash
npm test
```

Expected: todos os testes passam (os 10 de `brandSearch.test.ts` entre eles). Nenhum teste quebrado.

- [ ] **Step 5: Build de verificação**

```bash
npm run build
```

Expected: sem erros de TypeScript, build conclui com sucesso.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Inventory.tsx
git commit -m "fix: search bar — close dropdown on outside click; show × during transition"
```

---

## Task 2: Fix feat/inventory-column-picker

**Files:**
- Modify: `src/pages/INVColumnPicker.tsx:148–152, 159`
- Modify: `src/pages/Inventory.tsx:216–226, 371`

- [ ] **Step 1: Checkout a branch correta**

```bash
git checkout feat/inventory-column-picker
git status
```

Expected: `On branch feat/inventory-column-picker`, nothing to commit.

- [ ] **Step 2: Fix 1 — `handleDelete` com error handling**

Em `src/pages/INVColumnPicker.tsx`, substituir a função `handleDelete` (linhas 148–152):

Antes:
```tsx
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('inventory_column_views').delete().eq('id', id)
    setViews(prev => prev.filter(v => v.id !== id))
  }
```

Depois:
```tsx
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const { error } = await supabase.from('inventory_column_views').delete().eq('id', id)
    if (error) {
      console.error('[INVColumnPicker] handleDelete error:', error.message)
      return
    }
    setViews(prev => prev.filter(v => v.id !== id))
  }
```

- [ ] **Step 3: Fix 2 — filtro "My Views" com guard de `userId`**

Em `src/pages/INVColumnPicker.tsx`, linha 159, substituir o filtro de `privateViews`:

Antes:
```tsx
  const privateViews = views.filter(v => !v.is_public)
```

Depois:
```tsx
  const privateViews = views.filter(v => !v.is_public && v.created_by === userId)
```

- [ ] **Step 4: Fix 3 — `loadBarcodesMap` com paginação**

Em `src/pages/Inventory.tsx`, substituir a função `loadBarcodesMap` (linhas 216–226):

Antes:
```tsx
  async function loadBarcodesMap() {
    const { data } = await supabase.from('brand_barcodes').select('brand_id, barcode')
    const map = new Map<string, string[]>()
    for (const row of data ?? []) {
      if (!row.brand_id) continue
      const arr = map.get(row.brand_id) ?? []
      arr.push(row.barcode)
      map.set(row.brand_id, arr)
    }
    setBarcodesMap(map)
  }
```

Depois:
```tsx
  async function loadBarcodesMap() {
    const PAGE_SIZE = 1000
    let page = 0
    const map = new Map<string, string[]>()
    while (true) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('brand_barcodes')
        .select('brand_id, barcode')
        .range(from, to)
      if (error) { console.error('[Inventory] loadBarcodesMap error:', error.message); break }
      if (!data || data.length === 0) break
      for (const row of data) {
        if (!row.brand_id) continue
        const arr = map.get(row.brand_id) ?? []
        arr.push(row.barcode)
        map.set(row.brand_id, arr)
      }
      if (data.length < PAGE_SIZE) break
      page++
    }
    setBarcodesMap(map)
  }
```

- [ ] **Step 5: Fix 4 — `colSpan` com `Math.max(1, ...)`**

Em `src/pages/Inventory.tsx`, encontrar a linha com:
```tsx
    const colSpan = ALL_COLS.filter(c => visSet.has(c.key)).length
```

Substituir por:
```tsx
    const colSpan = Math.max(1, ALL_COLS.filter(c => visSet.has(c.key)).length)
```

- [ ] **Step 6: Rodar os testes**

```bash
npm test
```

Expected: todos os testes passam. Nenhum teste quebrado.

- [ ] **Step 7: Build de verificação**

```bash
npm run build
```

Expected: sem erros de TypeScript, build conclui com sucesso.

- [ ] **Step 8: Commit**

```bash
git add src/pages/INVColumnPicker.tsx src/pages/Inventory.tsx
git commit -m "fix: column picker — handleDelete error handling; My Views userId guard; loadBarcodesMap pagination; colSpan min 1"
```

---

## Task 3: Merge para main

- [ ] **Step 1: Checkout main**

```bash
git checkout main
git status
```

Expected: `On branch main`, nothing to commit.

- [ ] **Step 2: Merge feat/inventory-column-picker**

```bash
git merge feat/inventory-column-picker --no-ff -m "feat: inventory column picker with 27 columns, saved views, barcodes"
```

Expected: merge bem-sucedido, sem conflitos.

- [ ] **Step 3: Merge feat/inventory-search-bar**

```bash
git merge feat/inventory-search-bar --no-ff -m "feat: inventory search bar with prefix-priority, INP fix, virtualizer scroll"
```

Se houver conflitos em `src/pages/Inventory.tsx` (as duas branches tocaram no mesmo arquivo), resolver manualmente preservando ambas as features (column picker + search bar). Regras de resolução:
- Manter todos os `import` de ambas as branches
- Manter `barcodesMap` state + `loadBarcodesMap` paginado (da column-picker)
- Manter `searchInputValue`, `searchQuery`, `searchContainerRef` (da search-bar)
- Manter `visibleCols` state + `vis()` helper + `colSpan` dinâmico (da column-picker)
- Manter `INVColumnPicker` no JSX do toolbar (da column-picker)
- Manter search bar no JSX do toolbar (da search-bar)

- [ ] **Step 4: Rodar testes finais após merge**

```bash
npm test && npm run build
```

Expected: todos os testes passam, build sem erros.

- [ ] **Step 5: Commit de resolução de conflito (se necessário)**

Se o merge gerou conflitos e foi feito manualmente:
```bash
git add src/pages/Inventory.tsx
git commit -m "merge: resolve Inventory.tsx conflict — preserve column picker + search bar"
```

- [ ] **Step 6: Push para origin**

Confirmar com o usuário antes de fazer push, pois o Vercel fará deploy automático da main.

```bash
git push origin main
```
