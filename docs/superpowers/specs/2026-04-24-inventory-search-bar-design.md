# Inventory Search Bar — Design Spec
**Date:** 2026-04-24
**Status:** Approved

## Problem
The Inventory table uses `@tanstack/react-virtual` — only visible rows exist in the DOM. Browser CTRL+F cannot find items outside the viewport. Users need a way to navigate directly to a specific brand by code or name.

## Solution: Search-and-Navigate (Option A)

A search bar in the Inventory toolbar that finds brands in the current tab's `displayList` and scrolls/selects the matching row.

## Architecture

### New file: `src/lib/brandSearch.ts`
Pure function `searchBrands(brands, query, maxResults)` — same prefix-priority algorithm as `searchSlots` in `slotSearch.ts`.

- Input: `BrandFull[]`, query string
- Output: `BrandSearchResult[]` — `{ id, brandCode, brandName, binAddress }`
- Prefix-match on `brand_code` → sorted numerically
- Contains-match on `brand_code` or `brand_name` → sorted numerically
- `binAddress` derived from `allocMap` at call site (passed in)

### Changes to `Inventory.tsx`
1. Add `searchQuery` state + `searchHighlightId` state
2. Search input in toolbar (between "Clear filters" and record count)
3. `searchResults` = `useMemo(() => searchBrands(displayList, searchQuery, 10), [displayList, searchQuery])`
4. Floating dropdown below input — each result shows: `brandCode` (mono) + `brandName` + `binAddress` (green, if allocated)
5. On select:
   - Find index of result in `displayList`
   - `virtualizer.scrollToIndex(index, { align: 'center' })`
   - `setSelectedId(result.id)` — opens detail panel
   - `setSearchHighlightId(result.id)` — highlights row
   - Close dropdown, clear query
6. Clear `searchHighlightId` when query is cleared or tab changes
7. Keyboard: ArrowDown/Up in dropdown, Enter selects, Escape clears

### Row highlight
When `searchHighlightId` is set, the matching row gets a blue border (`#2563eb`) + light blue background — same visual pattern as the Picking Line. No dimming of other rows (virtualizer complexity).

## Context-awareness
Search operates on `displayList` (already filtered by active tab + active filters). Result counts and options are always scoped to what the user is currently viewing.

## Scope
- Search by `brand_code` and `brand_name` only
- No new SQL, no Supabase changes
- New file: `src/lib/brandSearch.ts`
- Modified file: `src/pages/Inventory.tsx`
