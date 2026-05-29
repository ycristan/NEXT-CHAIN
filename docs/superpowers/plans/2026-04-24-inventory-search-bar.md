# Inventory Search Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search-and-navigate bar to the Inventory toolbar that finds brands by code/name in the current tab's displayList and scrolls the virtualizer to the matching row.

**Architecture:** Pure search function in `src/lib/brandSearch.ts` (same prefix-priority algorithm as `slotSearch.ts`). Inventory.tsx gets search state + UI in toolbar + row highlight in tbody. No new SQL, no Supabase changes.

**Tech Stack:** React 19, TypeScript, @tanstack/react-virtual (`virtualizer.scrollToIndex`), Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/brandSearch.ts` | Create | Pure `searchBrands()` function |
| `src/test/brandSearch.test.ts` | Create | Vitest tests for `searchBrands` |
| `src/pages/Inventory.tsx` | Modify | Search state, UI, row highlight, tab-clear |

---

## Task 1: Create `brandSearch.ts` with failing tests first

**Files:**
- Create: `src/lib/brandSearch.ts`
- Create: `src/test/brandSearch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/brandSearch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { searchBrands } from '@/lib/brandSearch'

const allocMap = new Map([
  ['id-1', ['57 A01']],
  ['id-3', ['40 B02', '41 C01']],
])

const brands = [
  { id: 'id-1', brand_code: '1073', brand_name: 'AERO Milk Chocolate Bar 36g' },
  { id: 'id-2', brand_code: '1074', brand_name: 'Aero Peppermint Mint' },
  { id: 'id-3', brand_code: '9711', brand_name: 'Flahavans Oaty Flapjacks' },
  { id: 'id-4', brand_code: '45',   brand_name: 'AERO Peppermint Mint Chocolate Bar' },
]

describe('searchBrands', () => {
  it('returns empty array for empty query', () => {
    expect(searchBrands(brands, '', allocMap)).toEqual([])
    expect(searchBrands(brands, '   ', allocMap)).toEqual([])
  })

  it('matches by brand_code prefix first', () => {
    const results = searchBrands(brands, '107', allocMap)
    expect(results[0].brandCode).toBe('1073')
    expect(results[1].brandCode).toBe('1074')
  })

  it('matches by brand_name contains', () => {
    const results = searchBrands(brands, 'aero', allocMap)
    // code prefix matches (1073, 1074, 45) come before name-only contains
    const codes = results.map(r => r.brandCode)
    expect(codes).toContain('1073')
    expect(codes).toContain('1074')
    expect(codes).toContain('45')
  })

  it('prefix matches come before contains matches', () => {
    const results = searchBrands(brands, '107', allocMap)
    expect(results.every(r => r.brandCode.startsWith('107'))).toBe(true)
  })

  it('sorts prefix group by brand_code numeric', () => {
    const results = searchBrands(brands, '107', allocMap)
    expect(results[0].brandCode).toBe('1073')
    expect(results[1].brandCode).toBe('1074')
  })

  it('includes binAddress from allocMap when allocated', () => {
    const results = searchBrands(brands, '1073', allocMap)
    expect(results[0].binAddress).toBe('57 A01')
  })

  it('returns empty binAddress when not allocated', () => {
    const results = searchBrands(brands, '1074', allocMap)
    expect(results[0].binAddress).toBe('')
  })

  it('joins multiple bin addresses with " / "', () => {
    const results = searchBrands(brands, '9711', allocMap)
    expect(results[0].binAddress).toBe('40 B02 / 41 C01')
  })

  it('respects maxResults limit', () => {
    const results = searchBrands(brands, 'a', allocMap, 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('is case-insensitive', () => {
    expect(searchBrands(brands, 'AERO', allocMap).length).toBeGreaterThan(0)
    expect(searchBrands(brands, 'aero', allocMap).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- brandSearch
```
Expected: FAIL — "Cannot find module '@/lib/brandSearch'"

- [ ] **Step 3: Create `src/lib/brandSearch.ts`**

```typescript
export interface BrandSearchResult {
  id: string
  brandCode: string
  brandName: string
  binAddress: string
}

export function searchBrands(
  brands: { id: string; brand_code: string; brand_name: string }[],
  query: string,
  allocMap: Map<string, string[]>,
  maxResults = 10
): BrandSearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const prefix: BrandSearchResult[] = []
  const contains: BrandSearchResult[] = []

  for (const b of brands) {
    const code = b.brand_code.toLowerCase()
    const name = b.brand_name.toLowerCase()
    const result: BrandSearchResult = {
      id: b.id,
      brandCode: b.brand_code,
      brandName: b.brand_name,
      binAddress: (allocMap.get(b.id) ?? []).join(' / '),
    }
    if (code.startsWith(q)) {
      prefix.push(result)
    } else if (code.includes(q) || name.includes(q)) {
      contains.push(result)
    }
  }

  const byCode = (a: BrandSearchResult, b: BrandSearchResult) =>
    a.brandCode.localeCompare(b.brandCode, undefined, { numeric: true })

  return [...prefix.sort(byCode), ...contains.sort(byCode)].slice(0, maxResults)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- brandSearch
```
Expected: 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/brandSearch.ts src/test/brandSearch.test.ts
git commit -m "feat: add searchBrands pure function with tests"
```

---

## Task 2: Add search state and logic to `Inventory.tsx`

**Files:**
- Modify: `src/pages/Inventory.tsx`

- [ ] **Step 1: Add import at the top of Inventory.tsx**

After the existing imports, add:
```typescript
import { searchBrands, type BrandSearchResult } from '@/lib/brandSearch'
```

- [ ] **Step 2: Add search state after existing useState declarations**

After `const [showFixSubs, setShowFixSubs] = useState(false)`:
```typescript
const [searchQuery,       setSearchQuery]       = useState('')
const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null)
const [searchDropdownIdx, setSearchDropdownIdx] = useState(-1)
const searchInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 3: Clear search when active tab changes**

In `setActiveTab` function:
```typescript
function setActiveTab(tab: SubTab) {
  _store.activeTab = tab
  setActiveTabState(tab)
  setSearchQuery('')
  setSearchHighlightId(null)
  setSearchDropdownIdx(-1)
}
```

In `setActiveSubTab` function:
```typescript
function setActiveSubTab(tab: ActiveSubTab) {
  _store.activeSubTab = tab
  setActiveSubTabState(tab)
  setSearchQuery('')
  setSearchHighlightId(null)
  setSearchDropdownIdx(-1)
}
```

- [ ] **Step 4: Add searchResults memo and helper functions**

Add after the `colSpan` declaration:
```typescript
const searchResults = useMemo(
  () => searchBrands(displayList, searchQuery, allocMap),
  [displayList, searchQuery, allocMap]
)
const searchDropdownOpen = searchQuery.trim().length > 0

function clearSearch() {
  setSearchQuery('')
  setSearchHighlightId(null)
  setSearchDropdownIdx(-1)
}

function handleSearchSelect(result: BrandSearchResult) {
  const idx = displayList.findIndex(b => b.id === result.id)
  if (idx !== -1) {
    virtualizer.scrollToIndex(idx, { align: 'center' })
    setSelectedId(result.id)
    setSearchHighlightId(result.id)
  }
  setSearchQuery(result.brandCode)
  setSearchDropdownIdx(-1)
}
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Inventory.tsx
git commit -m "feat: add search state and logic to Inventory"
```

---

## Task 3: Add search UI to the toolbar

**Files:**
- Modify: `src/pages/Inventory.tsx` — toolbar section

- [ ] **Step 1: Locate the toolbar div**

Find this line in Inventory.tsx (toolbar section):
```tsx
<span style={{ marginLeft: 'auto', fontSize: 12, color: '#a1a1aa' }}>
  {filtered.length} record(s)
</span>
```

- [ ] **Step 2: Replace with search input + record count**

Replace the entire toolbar closing section — from after the `INVColumnPicker` and `Clear filters` button, replace the `<span>` record count with:

```tsx
        {/* Search bar */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 300, marginLeft: 8 }}>
          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#a1a1aa', pointerEvents: 'none', zIndex: 1 }}>⌕</span>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchDropdownIdx(-1); setSearchHighlightId(null) }}
            onKeyDown={e => {
              if (!searchDropdownOpen) { if (e.key === 'Escape') clearSearch(); return }
              if (e.key === 'ArrowDown') { e.preventDefault(); setSearchDropdownIdx(i => Math.min(i + 1, searchResults.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchDropdownIdx(i => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter' && searchDropdownIdx >= 0) { e.preventDefault(); handleSearchSelect(searchResults[searchDropdownIdx]) }
              else if (e.key === 'Escape') clearSearch()
            }}
            placeholder="Search code or name…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '6px 28px 6px 28px',
              border: '1px solid #e4e4e7', background: '#fafafa',
              fontSize: 12, color: '#09090b', outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = '#2563eb')}
            onBlur={e => {
              e.target.style.borderColor = '#e4e4e7'
              setTimeout(() => { if (document.activeElement !== searchInputRef.current) setSearchDropdownIdx(-1) }, 150)
            }}
          />
          {searchQuery && (
            <button onClick={clearSearch} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
          )}
          {searchDropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d4d4d8', borderTop: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 280, overflowY: 'auto' }}>
              {searchResults.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 11, color: '#a1a1aa' }}>No results in current tab</div>
              ) : searchResults.map((r, i) => (
                <div
                  key={r.id}
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
                  {r.binAddress && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>{r.binAddress}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a1a1aa', flexShrink: 0 }}>
          {filtered.length} record(s)
        </span>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Inventory.tsx
git commit -m "feat: add search bar UI to Inventory toolbar"
```

---

## Task 4: Highlight the selected row

**Files:**
- Modify: `src/pages/Inventory.tsx` — tbody `<tr>` style

- [ ] **Step 1: Find the `<tr>` in the virtualItems map**

Locate this in Inventory.tsx:
```tsx
style={{ background: isSelected ? '#eff6ff' : 'transparent', cursor: 'pointer' }}
```

- [ ] **Step 2: Add search highlight to row style**

Replace with:
```tsx
style={{
  background: isSelected ? '#eff6ff' : 'transparent',
  cursor: 'pointer',
  outline: b.id === searchHighlightId ? '2px solid #2563eb' : 'none',
  outlineOffset: '-2px',
}}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
npm run build
```
Expected: `✓ built in ~10s` with no errors.

- [ ] **Step 4: Run all tests**

```bash
npm test
```
Expected: All tests pass (40 existing + 10 new = 50 total).

- [ ] **Step 5: Commit and push**

```bash
git add src/pages/Inventory.tsx
git commit -m "feat: highlight search result row in Inventory table"
git push
```

---

## Task 5: Create branch and wire it all up

> This task should be done BEFORE tasks 1-4 if starting fresh.

- [ ] **Step 1: Create feature branch**

```bash
cd "C:\Users\yuridelima\Desktop\Projetos Programacao\NEXT Warehouse Manager"
git checkout main
git checkout -b feat/inventory-search-bar
```

- [ ] **Step 2: After all tasks complete, push branch**

```bash
git push -u origin feat/inventory-search-bar
```

Vercel will auto-generate a preview URL for testing.
