# Inventory Commercial Data Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add commercial pricing, logistics dimensions, dietary/channel flags, barcodes, and system settings to the Inventory module as groundwork for the future customer-facing commercial module.

**Architecture:** All new fields added directly to the `brands` table (flat schema, no extra joins). A new `brand_barcodes` table handles the 1:many barcode relationship. A `system_settings` key/value table holds configurable defaults (currency, margin percentages). `INVBrandForm` gains 4 internal tabs; `INVDetailPanel` gains 4 read-only sub-tabs.

**Tech Stack:** React 19 + TypeScript, Supabase (PostgreSQL + RLS), Vitest, inline styles (no Tailwind in new code).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `sql/inventory_commercial_data.sql` | DB migration: ALTER brands, brand_barcodes, system_settings, RLS |
| Create | `src/lib/priceUtils.ts` | Pure functions: margin suggestion, unit price calc, price format |
| Create | `src/test/priceUtils.test.ts` | Tests for priceUtils |
| Create | `src/lib/useSystemSettings.ts` | Hook: fetch + cache system_settings; exports `parseSettingsRows` |
| Create | `src/test/useSystemSettings.test.ts` | Tests for parseSettingsRows pure function |
| Create | `src/lib/useBrandBarcodes.ts` | Hook: fetch barcodes for a brand by ID |
| Modify | `src/pages/INVDetailPanel.tsx` | Extend BrandFull type + add 4 sub-tabs |
| Modify | `src/pages/INVBrandForm.tsx` | Add 4 internal tabs + commercial/logistics/barcode fields |

---

## Task 1: SQL Migration

**Files:**
- Create: `sql/inventory_commercial_data.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- sql/inventory_commercial_data.sql
-- Inventory Commercial Data Extension
-- Run once in Supabase SQL Editor

-- ─── 1. New columns in brands ──────────────────────────────────────────────

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS purchase_price        DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wholesale_price_outer DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vending_price         DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS allowed_wholesale     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wholesale_units_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_vending       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_consumable         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_non_stockable      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_gluten_free        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vegan_friendly     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hse_suitable          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS case_weight           DECIMAL(8,3)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS case_height           DECIMAL(8,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS case_length           DECIMAL(8,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS case_depth            DECIMAL(8,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS product_weight        DECIMAL(8,3)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS kcal                  DECIMAL(8,2)  DEFAULT NULL;

-- ─── 2. brand_barcodes ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.brand_barcodes (
  id         uuid        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand_id   uuid        NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  barcode    text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Reserved for future scanning module (pistol scanners / mobile camera):
  --   barcode_type  text        (EAN-13, UPC-A, QR, internal, ...)
  --   description   text
  --   is_primary    boolean
  --   created_by    uuid REFERENCES public.profiles(id)
  --   scanned_at    timestamptz
  CONSTRAINT brand_barcodes_barcode_unique UNIQUE (barcode)
);

CREATE INDEX IF NOT EXISTS brand_barcodes_brand_id_idx ON public.brand_barcodes(brand_id);

-- ─── 3. system_settings ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text        NOT NULL PRIMARY KEY,
  value      text        NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value, description) VALUES
  ('currency',           'EUR',  'ISO 4217 currency code'),
  ('unit_system',        'metric', 'Unit system: metric or imperial'),
  ('date_format',        'DD/MM/YYYY', 'Date display format'),
  ('wholesale_margin_1', '35',   'First wholesale margin suggestion (%)'),
  ('wholesale_margin_2', '40',   'Second wholesale margin suggestion (%)'),
  ('wholesale_margin_3', '45',   'Third wholesale margin suggestion (%)'),
  ('vending_margin_1',   '50',   'First vending margin suggestion (%)'),
  ('vending_margin_2',   '60',   'Second vending margin suggestion (%)'),
  ('vending_margin_3',   '65',   'Third vending margin suggestion (%)')
ON CONFLICT (key) DO NOTHING;

-- ─── 4. RLS — brand_barcodes ───────────────────────────────────────────────

ALTER TABLE public.brand_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_barcodes_select" ON public.brand_barcodes;
CREATE POLICY "brand_barcodes_select"
  ON public.brand_barcodes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "brand_barcodes_insert" ON public.brand_barcodes;
CREATE POLICY "brand_barcodes_insert"
  ON public.brand_barcodes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND lower(role) IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "brand_barcodes_delete" ON public.brand_barcodes;
CREATE POLICY "brand_barcodes_delete"
  ON public.brand_barcodes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND lower(role) IN ('admin', 'manager')
    )
  );

-- ─── 5. RLS — system_settings ──────────────────────────────────────────────

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_select" ON public.system_settings;
CREATE POLICY "system_settings_select"
  ON public.system_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "system_settings_update" ON public.system_settings;
CREATE POLICY "system_settings_update"
  ON public.system_settings FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
```

- [ ] **Step 2: Run migration in Supabase**

Open Supabase Dashboard → SQL Editor → paste the file contents → Run.

Expected: no errors. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'brands' AND column_name IN ('purchase_price', 'allowed_wholesale', 'kcal')
ORDER BY column_name;
-- Expected: 3 rows returned

SELECT COUNT(*) FROM system_settings;
-- Expected: 9
```

- [ ] **Step 3: Commit**

```bash
git add sql/inventory_commercial_data.sql
git commit -m "sql: add brands commercial columns, brand_barcodes, system_settings"
```

---

## Task 2: Price Calculation Utilities (TDD)

**Files:**
- Create: `src/lib/priceUtils.ts`
- Create: `src/test/priceUtils.test.ts`

These are pure functions with no dependencies — ideal for TDD.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/priceUtils.test.ts
import { describe, it, expect } from 'vitest'
import { calcSuggestedPrice, calcUnitPrice, formatPrice } from '@/lib/priceUtils'

describe('calcSuggestedPrice — sales margin formula: cost / (1 - margin%)', () => {
  it('calculates 35% margin correctly', () => {
    expect(calcSuggestedPrice(24, 35)).toBeCloseTo(36.92, 1)
  })

  it('calculates 50% margin correctly', () => {
    expect(calcSuggestedPrice(2, 50)).toBeCloseTo(4.0, 2)
  })

  it('calculates 40% margin correctly', () => {
    expect(calcSuggestedPrice(24, 40)).toBeCloseTo(40.0, 1)
  })

  it('rounds to 2 decimal places', () => {
    const result = calcSuggestedPrice(24, 35)
    expect(result).toBe(36.92)
  })
})

describe('calcUnitPrice', () => {
  it('divides SKU price by BPU', () => {
    expect(calcUnitPrice(24, 12)).toBe(2)
  })

  it('returns null when BPU is 0', () => {
    expect(calcUnitPrice(24, 0)).toBeNull()
  })

  it('returns null when price is null', () => {
    expect(calcUnitPrice(null, 12)).toBeNull()
  })
})

describe('formatPrice', () => {
  it('formats a number with currency symbol', () => {
    expect(formatPrice(24, '€')).toBe('€24.00')
  })

  it('returns em dash for null', () => {
    expect(formatPrice(null, '€')).toBe('—')
  })

  it('formats decimal values', () => {
    expect(formatPrice(36.92, '€')).toBe('€36.92')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- priceUtils
```
Expected: FAIL — `Cannot find module '@/lib/priceUtils'`

- [ ] **Step 3: Implement priceUtils**

```typescript
// src/lib/priceUtils.ts

/**
 * Calculates a suggested selling price from a cost using the sales margin formula.
 * Sales margin: margin% = (price - cost) / price × 100
 * Therefore: price = cost / (1 - margin / 100)
 */
export function calcSuggestedPrice(cost: number, marginPct: number): number {
  return parseFloat((cost / (1 - marginPct / 100)).toFixed(2))
}

/**
 * Calculates the price per individual unit given a SKU-level price and units per SKU.
 * Returns null if price is null or BPU is 0 (cannot divide).
 */
export function calcUnitPrice(skuPrice: number | null, bpu: number): number | null {
  if (skuPrice === null || bpu <= 0) return null
  return parseFloat((skuPrice / bpu).toFixed(4))
}

/**
 * Formats a nullable price value for display.
 * Returns '—' for null, otherwise prepends the currency symbol.
 */
export function formatPrice(value: number | null, currencySymbol: string): string {
  if (value === null) return '—'
  return `${currencySymbol}${value.toFixed(2)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- priceUtils
```
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceUtils.ts src/test/priceUtils.test.ts
git commit -m "feat: add price calculation utilities with tests"
```

---

## Task 3: System Settings Hook (TDD)

**Files:**
- Create: `src/lib/useSystemSettings.ts`
- Create: `src/test/useSystemSettings.test.ts`

The pure function `parseSettingsRows` is extracted for testing. The hook itself wraps it with Supabase.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/useSystemSettings.test.ts
import { describe, it, expect } from 'vitest'
import { parseSettingsRows } from '@/lib/useSystemSettings'

const defaultRows = [
  { key: 'currency',           value: 'EUR' },
  { key: 'unit_system',        value: 'metric' },
  { key: 'date_format',        value: 'DD/MM/YYYY' },
  { key: 'wholesale_margin_1', value: '35' },
  { key: 'wholesale_margin_2', value: '40' },
  { key: 'wholesale_margin_3', value: '45' },
  { key: 'vending_margin_1',   value: '50' },
  { key: 'vending_margin_2',   value: '60' },
  { key: 'vending_margin_3',   value: '65' },
]

describe('parseSettingsRows', () => {
  it('parses currency and derives EUR symbol', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.currency).toBe('EUR')
    expect(s.currencySymbol).toBe('€')
  })

  it('parses wholesale margins as numbers', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.wholesaleMargins).toEqual([35, 40, 45])
  })

  it('parses vending margins as numbers', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.vendingMargins).toEqual([50, 60, 65])
  })

  it('parses unit system', () => {
    const s = parseSettingsRows(defaultRows)
    expect(s.unitSystem).toBe('metric')
  })

  it('falls back to EUR/metric when rows are missing', () => {
    const s = parseSettingsRows([])
    expect(s.currency).toBe('EUR')
    expect(s.unitSystem).toBe('metric')
    expect(s.wholesaleMargins).toEqual([35, 40, 45])
  })

  it('accepts GBP and derives £ symbol', () => {
    const rows = [{ key: 'currency', value: 'GBP' }]
    const s = parseSettingsRows(rows)
    expect(s.currencySymbol).toBe('£')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- useSystemSettings
```
Expected: FAIL — `Cannot find module '@/lib/useSystemSettings'`

- [ ] **Step 3: Implement useSystemSettings**

```typescript
// src/lib/useSystemSettings.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface SystemSettings {
  currency: string
  currencySymbol: string
  unitSystem: 'metric' | 'imperial'
  dateFormat: string
  wholesaleMargins: [number, number, number]
  vendingMargins: [number, number, number]
}

// Module-level cache — fetched once per session
let _cache: SystemSettings | null = null

export function parseSettingsRows(rows: { key: string; value: string }[]): SystemSettings {
  const get = (key: string, fallback: string) =>
    rows.find(r => r.key === key)?.value ?? fallback

  const currency = get('currency', 'EUR')

  // Derive currency symbol via Intl — no hardcoded symbols
  let currencySymbol = '€'
  try {
    const formatted = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(0)
    currencySymbol = formatted.replace(/[\d,.\s]/g, '').trim()
  } catch {
    currencySymbol = currency
  }

  return {
    currency,
    currencySymbol,
    unitSystem: (get('unit_system', 'metric') as 'metric' | 'imperial'),
    dateFormat: get('date_format', 'DD/MM/YYYY'),
    wholesaleMargins: [
      Number(get('wholesale_margin_1', '35')),
      Number(get('wholesale_margin_2', '40')),
      Number(get('wholesale_margin_3', '45')),
    ],
    vendingMargins: [
      Number(get('vending_margin_1', '50')),
      Number(get('vending_margin_2', '60')),
      Number(get('vending_margin_3', '65')),
    ],
  }
}

export function useSystemSettings(): SystemSettings | null {
  const [settings, setSettings] = useState<SystemSettings | null>(_cache)

  useEffect(() => {
    if (_cache) { setSettings(_cache); return }
    async function load() {
      const { data } = await supabase.from('system_settings').select('key, value')
      if (data) {
        _cache = parseSettingsRows(data)
        setSettings(_cache)
      }
    }
    void load()
  }, [])

  return settings
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- useSystemSettings
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/useSystemSettings.ts src/test/useSystemSettings.test.ts
git commit -m "feat: add useSystemSettings hook with parseSettingsRows utility"
```

---

## Task 4: useBrandBarcodes Hook

**Files:**
- Create: `src/lib/useBrandBarcodes.ts`

No pure-function logic to test here (only Supabase I/O). Hook is simple enough to skip unit tests.

- [ ] **Step 1: Implement useBrandBarcodes**

```typescript
// src/lib/useBrandBarcodes.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface UseBrandBarcodesResult {
  barcodes: string[]
  loading: boolean
  reload: () => void
}

export function useBrandBarcodes(brandId: string | null): UseBrandBarcodesResult {
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!brandId) { setBarcodes([]); return }
    setLoading(true)
    supabase
      .from('brand_barcodes')
      .select('barcode')
      .eq('brand_id', brandId)
      .order('created_at')
      .then(({ data }) => {
        setBarcodes(data?.map(r => r.barcode) ?? [])
        setLoading(false)
      })
  }, [brandId, tick])

  return { barcodes, loading, reload: () => setTick(t => t + 1) }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```
Expected: no type errors for the new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useBrandBarcodes.ts
git commit -m "feat: add useBrandBarcodes hook"
```

---

## Task 5: Extend BrandFull Type

**Files:**
- Modify: `src/pages/INVDetailPanel.tsx` (lines 7–24 — the `BrandFull` interface only)

- [ ] **Step 1: Extend the BrandFull interface**

Replace the existing `BrandFull` interface (lines 7–24 in `INVDetailPanel.tsx`) with:

```typescript
export interface BrandFull {
  id: string
  brand_code: string
  brand_name: string
  is_active: boolean
  category_id: string
  category1_id: string
  sku_type_id: string
  bpu: number
  pallet_size: number | null
  image1_url: string | null
  image2_url: string | null
  image3_url: string | null
  notes: string | null
  // Commercial
  purchase_price: number | null
  wholesale_price_outer: number | null
  vending_price: number | null
  allowed_wholesale: boolean
  wholesale_units_allowed: boolean
  allowed_vending: boolean
  is_consumable: boolean
  is_non_stockable: boolean
  is_gluten_free: boolean
  is_vegan_friendly: boolean
  hse_suitable: boolean
  // Logistics
  case_weight: number | null
  case_height: number | null
  case_length: number | null
  case_depth: number | null
  product_weight: number | null
  kcal: number | null
  // Nested lookups
  category: { id: string; name: string } | null
  category1: { id: string; name: string } | null
  sku_type: { id: string; name: string; code: string } | null
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npm run build 2>&1 | head -30
```
Expected: no errors. (The new fields are all optional/nullable so existing code that doesn't use them won't break.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/INVDetailPanel.tsx
git commit -m "feat: extend BrandFull type with commercial and logistics fields"
```

---

## Task 6: INVBrandForm — Tab Navigation + Commercial Tab

**Files:**
- Modify: `src/pages/INVBrandForm.tsx`

This task adds the tab chrome and the Commercial tab content. Existing Basic Info content is wrapped in a tab pane.

- [ ] **Step 1: Add tab state and commercial form state**

At the top of the `INVBrandForm` function body, after the existing `useState` declarations (after `const [uploading, ...]`), add:

```typescript
// Tab navigation
const [activeTab, setActiveTab] = useState<'basic' | 'commercial' | 'logistics' | 'barcodes'>('basic')

// Commercial form state
const [commercial, setCommercial] = useState({
  purchase_price:          brand?.purchase_price         != null ? String(brand.purchase_price)         : '',
  wholesale_price_outer:   brand?.wholesale_price_outer  != null ? String(brand.wholesale_price_outer)  : '',
  vending_price:           brand?.vending_price          != null ? String(brand.vending_price)           : '',
  allowed_wholesale:       brand?.allowed_wholesale       ?? false,
  wholesale_units_allowed: brand?.wholesale_units_allowed ?? false,
  allowed_vending:         brand?.allowed_vending         ?? false,
  is_consumable:           brand?.is_consumable           ?? false,
  is_non_stockable:        brand?.is_non_stockable        ?? false,
  is_gluten_free:          brand?.is_gluten_free          ?? false,
  is_vegan_friendly:       brand?.is_vegan_friendly       ?? false,
  hse_suitable:            brand?.hse_suitable            ?? false,
})

// Logistics form state
const [logistics, setLogistics] = useState({
  case_weight:    brand?.case_weight    != null ? String(brand.case_weight)    : '',
  case_height:    brand?.case_height    != null ? String(brand.case_height)    : '',
  case_length:    brand?.case_length    != null ? String(brand.case_length)    : '',
  case_depth:     brand?.case_depth     != null ? String(brand.case_depth)     : '',
  product_weight: brand?.product_weight != null ? String(brand.product_weight) : '',
  kcal:           brand?.kcal           != null ? String(brand.kcal)           : '',
})

// Barcode state
const [localBarcodes, setLocalBarcodes]       = useState<string[]>([])
const [originalBarcodes, setOriginalBarcodes] = useState<string[]>([])
const [barcodeInput, setBarcodeInput]         = useState('')
const [barcodeError, setBarcodeError]         = useState('')
```

Also add the `useSystemSettings` import at the top of the file and call it inside the component:

At top of file, add:
```typescript
import { useSystemSettings } from '@/lib/useSystemSettings'
import { calcSuggestedPrice, calcUnitPrice, formatPrice } from '@/lib/priceUtils'
```

Inside the component (after existing hooks):
```typescript
const settings = useSystemSettings()
const sym = settings?.currencySymbol ?? '€'
const wMargins = settings?.wholesaleMargins ?? [35, 40, 45]
const vMargins = settings?.vendingMargins   ?? [50, 60, 65]
```

- [ ] **Step 2: Load barcodes for edit mode**

Add a `useEffect` after the existing lookup fetch effect:

```typescript
useEffect(() => {
  if (!brand?.id) return
  supabase
    .from('brand_barcodes')
    .select('barcode')
    .eq('brand_id', brand.id)
    .order('created_at')
    .then(({ data }) => {
      const codes = data?.map(r => r.barcode) ?? []
      setLocalBarcodes(codes)
      setOriginalBarcodes(codes)
    })
}, [brand?.id])
```

- [ ] **Step 3: Replace the modal structure with tab-aware layout**

Replace the entire `return (...)` block (from line 157 to end) with the following. The Basic Info tab content is the existing form fields, wrapped in a conditional div. The Commercial tab is new.

```tsx
// Computed derived values for display
const purchaseNum  = parseFloat(commercial.purchase_price)  || null
const wholesaleNum = parseFloat(commercial.wholesale_price_outer) || null
const bpuNum       = parseInt(form.bpu) || 0

const unitPurchase  = calcUnitPrice(purchaseNum, bpuNum)
const unitWholesale = calcUnitPrice(wholesaleNum, bpuNum)

const TAB_STYLE_ACTIVE: React.CSSProperties = {
  padding: '9px 16px', fontSize: 11, fontWeight: 700, background: 'none',
  border: 'none', borderBottom: '3px solid #09090b', marginBottom: -2,
  color: '#09090b', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase',
}
const TAB_STYLE_INACTIVE: React.CSSProperties = {
  ...TAB_STYLE_ACTIVE, borderBottom: '3px solid transparent', color: '#a1a1aa',
}

function tabStyle(tab: typeof activeTab) {
  return activeTab === tab ? TAB_STYLE_ACTIVE : TAB_STYLE_INACTIVE
}

return (
  <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
    <div style={{ width: '100%', maxWidth: 580, background: '#fff', border: '1px solid #e4e4e7', marginTop: 16 }}>

      {/* Modal header */}
      <div style={{ padding: '18px 24px', borderBottom: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#09090b' }}>{brand ? 'Edit Brand' : 'New Brand'}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 20, lineHeight: 1 }}>×</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e4e4e7', paddingLeft: 24 }}>
        {(['basic', 'commercial', 'logistics', 'barcodes'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>
            {t === 'basic' ? 'Basic Info' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding: 24 }}>

        {/* ── BASIC INFO TAB ──────────────────────────────────────────────── */}
        {activeTab === 'basic' && (
          <>
            {/* Active toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fafafa', border: '1px solid #e4e4e7', marginBottom: 20 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#52525b' }}>Active Brand</span>
              <button
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                style={{ width: 40, height: 22, borderRadius: 11, background: form.is_active ? '#2563eb' : '#d4d4d8', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
              >
                <div style={{ position: 'absolute', top: 3, left: form.is_active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </button>
            </div>

            {/* Brand Code + Brand Name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Brand Code *</label>
                <input
                  list="inv-brand-codes"
                  value={form.brand_code}
                  onChange={e => setForm(f => ({ ...f, brand_code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 6080"
                  style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em' }}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
                <datalist id="inv-brand-codes">
                  {existingCodes.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label style={labelStyle}>Brand Name *</label>
                <input
                  value={form.brand_name}
                  onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                  placeholder="e.g. Coca-Cola"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
              </div>
            </div>

            {/* Category + Subcategory */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Category *</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value, category1_id: '' }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select...</option>
                  {topCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Subcategory *</label>
                <select
                  value={form.category1_id}
                  onChange={e => setForm(f => ({ ...f, category1_id: e.target.value }))}
                  disabled={!form.category_id}
                  style={{ ...inputStyle, cursor: form.category_id ? 'pointer' : 'default', opacity: !form.category_id ? 0.5 : 1 }}
                >
                  <option value="">Select...</option>
                  {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* SKU Type */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>SKU Type *</label>
              <select
                value={form.sku_type_id}
                onChange={e => setForm(f => ({ ...f, sku_type_id: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select SKU type...</option>
                {skuTypes.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>

            {/* BPU + Pallet Size */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>BPU (Units / Box) *</label>
                <input
                  type="number" min="1"
                  value={form.bpu}
                  onChange={e => setForm(f => ({ ...f, bpu: e.target.value }))}
                  placeholder="e.g. 12"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
              </div>
              <div>
                <label style={labelStyle}>Pallet Size</label>
                <input
                  type="number" min="1"
                  value={form.pallet_size}
                  onChange={e => setForm(f => ({ ...f, pallet_size: e.target.value }))}
                  placeholder="e.g. 48"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = '#2563eb')}
                  onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Optional notes..."
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => (e.target.style.borderColor = '#2563eb')}
                onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
              />
            </div>

            {/* Images */}
            <div>
              <label style={labelStyle}>Images (up to 3)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {([0, 1, 2] as const).map(slot => (
                  <div
                    key={slot}
                    style={{ border: '1px solid #e4e4e7', background: '#fafafa', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}
                  >
                    {images[slot] ? (
                      <>
                        <img src={images[slot]!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => removeImage(slot)}
                          style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(220,38,38,0.85)', border: 'none', cursor: 'pointer', color: '#fff', padding: '3px', display: 'flex' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    ) : uploading[slot] ? (
                      <span style={{ fontSize: 11, color: '#a1a1aa' }}>Uploading...</span>
                    ) : (
                      <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#a1a1aa' }}>
                        <Upload size={18} />
                        <span style={{ fontSize: 10, fontWeight: 600 }}>Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage(slot, f) }}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── COMMERCIAL TAB ──────────────────────────────────────────────── */}
        {activeTab === 'commercial' && (
          <>
            {/* Flags */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Product Flags</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { key: 'allowed_wholesale',       label: 'Allowed Wholesale' },
                  { key: 'wholesale_units_allowed',  label: 'Loose Units Allowed', indent: true, disabledWhen: !commercial.allowed_wholesale },
                  { key: 'allowed_vending',          label: 'Allowed Vending' },
                  { key: 'is_consumable',            label: 'Consumable (Internal)' },
                  { key: 'is_non_stockable',         label: 'Non-Stockable' },
                  { key: 'is_gluten_free',           label: 'Gluten Free' },
                  { key: 'is_vegan_friendly',        label: 'Vegan Friendly' },
                  { key: 'hse_suitable',             label: 'HSE Suitable' },
                ] as { key: keyof typeof commercial; label: string; indent?: boolean; disabledWhen?: boolean }[]).map(({ key, label, indent, disabledWhen }) => {
                  const checked = commercial[key] as boolean
                  const disabled = disabledWhen === true
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px',
                        background: disabled ? '#f9f9f9' : (checked ? '#eff6ff' : '#f9f9f9'),
                        border: `1px solid ${checked && !disabled ? '#bfdbfe' : '#e4e4e7'}`,
                        borderRadius: 3,
                        opacity: disabled ? 0.45 : 1,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        marginLeft: indent ? 8 : 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={e => setCommercial(c => ({ ...c, [key]: e.target.checked }))}
                        style={{ cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 11, color: checked && !disabled ? '#2563eb' : '#3f3f46', fontWeight: checked && !disabled ? 600 : 400 }}>{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Pricing */}
            <div>
              <label style={labelStyle}>Pricing</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Purchase Price */}
                <div style={{ background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#3f3f46', fontWeight: 600, width: 170, flexShrink: 0 }}>Purchase Price (SKU)</span>
                    <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>{sym}</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={commercial.purchase_price}
                      onChange={e => setCommercial(c => ({ ...c, purchase_price: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={e => (e.target.style.borderColor = '#2563eb')}
                      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>
                  {unitPurchase !== null && (
                    <div style={{ marginTop: 4, fontSize: 10, color: '#a1a1aa', paddingLeft: 178 }}>
                      Unit cost: {formatPrice(unitPurchase, sym)} ÷ BPU
                    </div>
                  )}
                </div>

                {/* Wholesale Price */}
                <div style={{ background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#3f3f46', fontWeight: 600, width: 170, flexShrink: 0 }}>Wholesale Price (outer)</span>
                    <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>{sym}</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={commercial.wholesale_price_outer}
                      onChange={e => setCommercial(c => ({ ...c, wholesale_price_outer: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={e => (e.target.style.borderColor = '#2563eb')}
                      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 178 }}>
                    <span style={{ fontSize: 10, color: '#a1a1aa' }}>Suggest:</span>
                    {wMargins.map(m => (
                      <button
                        key={m}
                        type="button"
                        disabled={!purchaseNum}
                        onClick={() => {
                          if (!purchaseNum) return
                          setCommercial(c => ({ ...c, wholesale_price_outer: String(calcSuggestedPrice(purchaseNum, m)) }))
                        }}
                        style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 3, cursor: purchaseNum ? 'pointer' : 'not-allowed', opacity: purchaseNum ? 1 : 0.4 }}
                      >
                        {m}%
                      </button>
                    ))}
                    {unitWholesale !== null && (
                      <span style={{ fontSize: 10, color: '#a1a1aa', marginLeft: 4 }}>Unit: {formatPrice(unitWholesale, sym)}</span>
                    )}
                  </div>
                </div>

                {/* Vending Price */}
                <div style={{ background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 4, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#3f3f46', fontWeight: 600, width: 170, flexShrink: 0 }}>Vending Price (unit)</span>
                    <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>{sym}</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={commercial.vending_price}
                      onChange={e => setCommercial(c => ({ ...c, vending_price: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={e => (e.target.style.borderColor = '#2563eb')}
                      onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
                    />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 178 }}>
                    <span style={{ fontSize: 10, color: '#a1a1aa' }}>Suggest:</span>
                    {vMargins.map(m => (
                      <button
                        key={m}
                        type="button"
                        disabled={!unitPurchase}
                        onClick={() => {
                          if (!unitPurchase) return
                          setCommercial(c => ({ ...c, vending_price: String(calcSuggestedPrice(unitPurchase, m)) }))
                        }}
                        style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 8px', borderRadius: 3, cursor: unitPurchase ? 'pointer' : 'not-allowed', opacity: unitPurchase ? 1 : 0.4 }}
                      >
                        {m}%
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </>
        )}

        {/* ── LOGISTICS TAB — see Task 7 ───────────────────────────────── */}
        {activeTab === 'logistics' && (
          <div style={{ color: '#a1a1aa', fontSize: 12, padding: 8 }}>Logistics — Task 7</div>
        )}

        {/* ── BARCODES TAB — see Task 8 ────────────────────────────────── */}
        {activeTab === 'barcodes' && (
          <div style={{ color: '#a1a1aa', fontSize: 12, padding: 8 }}>Barcodes — Task 8</div>
        )}

      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onClose}
          style={{ padding: '8px 16px', background: 'none', border: '1px solid #e4e4e7', cursor: 'pointer', fontSize: 13, color: '#52525b', fontWeight: 500 }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '8px 20px', background: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Brand'}
        </button>
      </div>
    </div>
  </div>
)
```

Note: `tabStyle` and the computed derived values must be defined **before** `return`, inside the function body. Move the `const TAB_STYLE_ACTIVE`, `const TAB_STYLE_INACTIVE`, and the `tabStyle` helper function, plus `purchaseNum`, `wholesaleNum`, `bpuNum`, `unitPurchase`, `unitWholesale` declarations to the function body before the `return`.

- [ ] **Step 4: Verify the app runs and Basic Info + Commercial tabs work**

```bash
npm run dev
```
Open Inventory → click a brand → Edit Brand. Verify:
- 4 tabs appear: Basic Info / Commercial / Logistics / Barcodes
- Basic Info tab shows the existing form fields (unchanged)
- Commercial tab shows flags and pricing inputs
- Wholesale margin buttons fill the wholesale price field when purchase price is entered
- Vending margin buttons fill the vending price field
- "Loose Units Allowed" is disabled when "Allowed Wholesale" is unchecked

- [ ] **Step 5: Commit**

```bash
git add src/pages/INVBrandForm.tsx
git commit -m "feat: add tab navigation and commercial tab to INVBrandForm"
```

---

## Task 7: INVBrandForm — Logistics + Barcodes Tabs

**Files:**
- Modify: `src/pages/INVBrandForm.tsx`

- [ ] **Step 1: Replace Logistics tab placeholder with real content**

Replace `{activeTab === 'logistics' && (...placeholder...)}` with:

```tsx
{activeTab === 'logistics' && (
  <>
    {/* Case section */}
    <div style={{ marginBottom: 20 }}>
      <label style={labelStyle}>Case Dimensions</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
        {([
          { key: 'case_weight', label: 'Weight (kg)', step: '0.001' },
          { key: 'case_height', label: 'Height (cm)', step: '0.01' },
          { key: 'case_length', label: 'Length (cm)', step: '0.01' },
          { key: 'case_depth',  label: 'Depth (cm)',  step: '0.01' },
        ] as { key: keyof typeof logistics; label: string; step: string }[]).map(({ key, label, step }) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input
              type="number" min="0" step={step}
              value={logistics[key]}
              onChange={e => setLogistics(l => ({ ...l, [key]: e.target.value }))}
              placeholder="0"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
            />
          </div>
        ))}
      </div>
      {/* Auto-calculated volume */}
      {(() => {
        const h = parseFloat(logistics.case_height)
        const l = parseFloat(logistics.case_length)
        const d = parseFloat(logistics.case_depth)
        const vol = h > 0 && l > 0 && d > 0 ? (h * l * d).toFixed(0) : null
        return vol ? (
          <div style={{ padding: '6px 12px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3, fontSize: 11, color: '#71717a' }}>
            Volume: <strong style={{ color: '#09090b' }}>{Number(vol).toLocaleString()} cm³</strong>
            <span style={{ marginLeft: 8, fontSize: 10, color: '#a1a1aa' }}>auto-calculated H × L × D</span>
          </div>
        ) : null
      })()}
    </div>

    {/* Product (unit) section */}
    <div>
      <label style={labelStyle}>Product (unit)</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Product Weight (kg)</label>
          <input
            type="number" min="0" step="0.001"
            value={logistics.product_weight}
            onChange={e => setLogistics(l => ({ ...l, product_weight: e.target.value }))}
            placeholder="0.000"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = '#2563eb')}
            onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
          />
        </div>
        <div>
          <label style={labelStyle}>kcal (per unit)</label>
          <input
            type="number" min="0" step="0.01"
            value={logistics.kcal}
            onChange={e => setLogistics(l => ({ ...l, kcal: e.target.value }))}
            placeholder="0"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = '#2563eb')}
            onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
          />
        </div>
      </div>
    </div>
  </>
)}
```

- [ ] **Step 2: Replace Barcodes tab placeholder with real content**

Replace `{activeTab === 'barcodes' && (...placeholder...)}` with:

```tsx
{activeTab === 'barcodes' && (
  <>
    {/* Add barcode input */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input
        value={barcodeInput}
        onChange={e => { setBarcodeInput(e.target.value); setBarcodeError('') }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBarcode() } }}
        placeholder="Enter barcode..."
        style={{ ...inputStyle, flex: 1, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em' }}
        onFocus={e => (e.target.style.borderColor = '#2563eb')}
        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
      />
      <button
        type="button"
        onClick={addBarcode}
        style={{ padding: '8px 16px', background: '#09090b', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        + Add
      </button>
    </div>
    {barcodeError && (
      <div style={{ marginBottom: 8, fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: 3 }}>
        {barcodeError}
      </div>
    )}

    {/* Barcode list */}
    {localBarcodes.length === 0 ? (
      <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#a1a1aa' }}>No barcodes yet</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {localBarcodes.map(bc => (
          <div key={bc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#3f3f46', letterSpacing: '0.04em' }}>{bc}</span>
            <button
              type="button"
              onClick={() => setLocalBarcodes(bs => bs.filter(b => b !== bc))}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ marginTop: 4, fontSize: 10, color: '#a1a1aa', textAlign: 'center' }}>
          {localBarcodes.length} barcode{localBarcodes.length !== 1 ? 's' : ''}
        </div>
      </div>
    )}
  </>
)}
```

Also add the `addBarcode` helper function inside the component body (before the `return`):

```typescript
function addBarcode() {
  const val = barcodeInput.trim()
  if (!val) return
  if (localBarcodes.includes(val)) {
    setBarcodeError('Barcode already in this list')
    return
  }
  setLocalBarcodes(bs => [...bs, val])
  setBarcodeInput('')
  setBarcodeError('')
}
```

- [ ] **Step 3: Verify Logistics and Barcodes tabs in dev server**

```bash
npm run dev
```
Open INVBrandForm → Logistics tab: verify volume calculates live as dimensions are entered. Barcodes tab: add and remove barcodes from the list.

- [ ] **Step 4: Commit**

```bash
git add src/pages/INVBrandForm.tsx
git commit -m "feat: add logistics and barcodes tabs to INVBrandForm"
```

---

## Task 8: INVBrandForm — Extend handleSave

**Files:**
- Modify: `src/pages/INVBrandForm.tsx` — `handleSave` function only

- [ ] **Step 1: Replace the existing handleSave function**

Replace the existing `handleSave` function with:

```typescript
async function handleSave() {
  const brand_code = form.brand_code.trim().toUpperCase()
  const brand_name = form.brand_name.trim()

  if (!brand_code) { addToast('Brand code is required', 'error'); return }
  if (!brand_name) { addToast('Brand name is required', 'error'); return }
  if (!form.category_id) { addToast('Category is required', 'error'); return }
  if (!form.category1_id) { addToast('Subcategory is required', 'error'); return }
  if (!form.sku_type_id) { addToast('SKU Type is required', 'error'); return }
  if (!form.bpu || isNaN(parseInt(form.bpu))) { addToast('BPU is required', 'error'); return }

  const dupCode = existingCodes.some(c => c.toUpperCase() === brand_code && c !== brand?.brand_code)
  if (dupCode) { addToast('Brand code already exists', 'error'); return }

  setSaving(true)

  const payload = {
    brand_code,
    brand_name,
    is_active:    form.is_active,
    category_id:  form.category_id,
    category1_id: form.category1_id,
    sku_type_id:  form.sku_type_id,
    bpu:          parseInt(form.bpu),
    pallet_size:  form.pallet_size ? parseInt(form.pallet_size) : null,
    notes:        form.notes.trim() || null,
    image1_url:   images[0],
    image2_url:   images[1],
    image3_url:   images[2],
    // Commercial
    purchase_price:          commercial.purchase_price          ? parseFloat(commercial.purchase_price)          : null,
    wholesale_price_outer:   commercial.wholesale_price_outer   ? parseFloat(commercial.wholesale_price_outer)   : null,
    vending_price:           commercial.vending_price           ? parseFloat(commercial.vending_price)           : null,
    allowed_wholesale:       commercial.allowed_wholesale,
    wholesale_units_allowed: commercial.wholesale_units_allowed,
    allowed_vending:         commercial.allowed_vending,
    is_consumable:           commercial.is_consumable,
    is_non_stockable:        commercial.is_non_stockable,
    is_gluten_free:          commercial.is_gluten_free,
    is_vegan_friendly:       commercial.is_vegan_friendly,
    hse_suitable:            commercial.hse_suitable,
    // Logistics
    case_weight:    logistics.case_weight    ? parseFloat(logistics.case_weight)    : null,
    case_height:    logistics.case_height    ? parseFloat(logistics.case_height)    : null,
    case_length:    logistics.case_length    ? parseFloat(logistics.case_length)    : null,
    case_depth:     logistics.case_depth     ? parseFloat(logistics.case_depth)     : null,
    product_weight: logistics.product_weight ? parseFloat(logistics.product_weight) : null,
    kcal:           logistics.kcal           ? parseFloat(logistics.kcal)           : null,
  }

  let brandId: string | null = brand?.id ?? null
  let error: { message: string } | null = null

  if (brand) {
    ;({ error } = await supabase.from('brands').update(payload).eq('id', brand.id))
  } else {
    const { data, error: insertError } = await supabase
      .from('brands')
      .insert(payload)
      .select('id')
      .single()
    error = insertError
    brandId = data?.id ?? null
  }

  if (error) {
    setSaving(false)
    addToast('Error saving brand', 'error')
    return
  }

  // Persist barcodes
  if (brandId) {
    const toDelete = originalBarcodes.filter(b => !localBarcodes.includes(b))
    const toInsert = localBarcodes.filter(b => !originalBarcodes.includes(b))

    if (toDelete.length > 0) {
      await supabase.from('brand_barcodes').delete().eq('brand_id', brandId).in('barcode', toDelete)
    }

    if (toInsert.length > 0) {
      const { error: bcErr } = await supabase
        .from('brand_barcodes')
        .insert(toInsert.map(barcode => ({ brand_id: brandId!, barcode })))
      if (bcErr) {
        setSaving(false)
        // ERRCODE 23505 = unique_violation (barcode already belongs to another brand)
        if (bcErr.code === '23505') {
          addToast('One or more barcodes already exist on another brand', 'error')
        } else {
          addToast('Brand saved but some barcodes failed to save', 'error')
        }
        return
      }
    }
  }

  setSaving(false)
  addToast(brand ? 'Brand updated' : 'Brand created', 'success')
  onSaved()
}
```

- [ ] **Step 2: Test create + edit flows end-to-end**

```bash
npm run dev
```

Create a new brand:
1. Fill Basic Info fields
2. Switch to Commercial: set purchase price to `24`, click `35%` → wholesale should auto-fill to `36.92`
3. Switch to Barcodes: add `5449000000439`
4. Save → brand should appear in the table

Edit the same brand:
1. Open it → navigate to Barcodes tab → barcode `5449000000439` should be present
2. Add `5449000000446`, remove `5449000000439`
3. Save → verify in Supabase that barcodes updated correctly

- [ ] **Step 3: Commit**

```bash
git add src/pages/INVBrandForm.tsx
git commit -m "feat: extend handleSave with commercial fields and barcode persistence"
```

---

## Task 9: INVDetailPanel — Sub-tabs

**Files:**
- Modify: `src/pages/INVDetailPanel.tsx`

This task refactors the panel to use sub-tabs. The existing content (image carousel, header, fields, notes, actions) moves into the Info tab. Three new tabs are added.

- [ ] **Step 1: Add imports and sub-tab state**

At the top of `INVDetailPanel.tsx`, add imports:

```typescript
import { useBrandBarcodes } from '@/lib/useBrandBarcodes'
import { useSystemSettings } from '@/lib/useSystemSettings'
import { calcUnitPrice, formatPrice } from '@/lib/priceUtils'
```

Inside the `INVDetailPanel` function, after the existing `useState` declarations, add:

```typescript
const [detailTab, setDetailTab] = useState<'info' | 'commercial' | 'logistics' | 'barcodes'>('info')
const settings = useSystemSettings()
const sym = settings?.currencySymbol ?? '€'
const { barcodes: brandBarcodes, loading: barcodesLoading } = useBrandBarcodes(
  detailTab === 'barcodes' ? (brand?.id ?? null) : null
)

// Reset to info tab when brand changes
useEffect(() => {
  setDetailTab('info')
}, [brand?.id])
```

Note: the existing `useEffect` for `setImgIdx(0)` and `setNotes` already triggers on `brand?.id`. The new reset above can be merged into it:

```typescript
useEffect(() => {
  setImgIdx(0)
  setNotes(brand?.notes ?? '')
  setDetailTab('info')
}, [brand?.id])
```

- [ ] **Step 2: Add sub-tab bar and Info tab wrapper**

Replace the `{/* Fields */}` and `{/* Notes */}` sections (currently lines 154–196) with the full sub-tab structure below. The image carousel, header, and action buttons remain outside the tabs.

Add the tab bar immediately after the `{/* Header */}` closing `</div>` (after line 152), and wrap the existing fields content in the Info tab pane:

```tsx
{/* Sub-tab bar */}
<div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid #e4e4e7', background: '#fafafa' }}>
  {(['info', 'commercial', 'logistics', 'barcodes'] as const).map(t => (
    <button
      key={t}
      onClick={() => setDetailTab(t)}
      style={{
        padding: '7px 11px', fontSize: 10, fontWeight: 700,
        background: 'none', border: 'none',
        borderBottom: detailTab === t ? '2px solid #09090b' : '2px solid transparent',
        marginBottom: -1,
        color: detailTab === t ? '#09090b' : '#a1a1aa',
        cursor: 'pointer',
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}
    >
      {t === 'info' ? 'Info' : t.charAt(0).toUpperCase() + t.slice(1)}
    </button>
  ))}
</div>

{/* ── INFO TAB ──────────────────────────────────────────────────────── */}
{detailTab === 'info' && (
  <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 0' }}>
    {[
      { label: 'Category',    value: brand.category?.name ?? '—' },
      { label: 'Subcategory', value: brand.category1?.name ?? '—' },
      { label: 'SKU Type',    value: brand.sku_type ? `${brand.sku_type.name} (${brand.sku_type.code})` : '—' },
      { label: 'BPU',         value: String(brand.bpu) },
      { label: 'Pallet Size', value: brand.pallet_size != null ? String(brand.pallet_size) : '—' },
    ].map(({ label, value }) => (
      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f4f4f5', gap: 16 }}>
        <span style={keyStyle}>{label}</span>
        <span style={valStyle}>{value}</span>
      </div>
    ))}

    {/* Notes */}
    <div style={{ padding: '10px 0' }}>
      <div style={{ ...keyStyle, marginBottom: 6, display: 'block' }}>Notes</div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        placeholder="Add notes..."
        style={{
          width: '100%', padding: '7px 9px',
          border: '1px solid #e4e4e7', background: '#fafafa',
          fontSize: 12, color: '#09090b', resize: 'none', outline: 'none',
          fontFamily: 'inherit',
        }}
        onFocus={e => (e.target.style.borderColor = '#2563eb')}
        onBlur={e => (e.target.style.borderColor = '#e4e4e7')}
      />
      {notesChanged && (
        <button
          onClick={saveNotes}
          disabled={savingNotes}
          style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#2563eb', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          <Save size={11} /> {savingNotes ? 'Saving...' : 'Save Notes'}
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 3: Add Commercial sub-tab**

Add after the Info tab pane:

```tsx
{/* ── COMMERCIAL TAB ───────────────────────────────────────────────── */}
{detailTab === 'commercial' && (
  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

    {/* Flags */}
    <div>
      <div style={{ ...keyStyle, display: 'block', marginBottom: 8 }}>Flags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {([
          { key: 'allowed_wholesale',       label: 'Wholesale' },
          { key: 'wholesale_units_allowed', label: 'Loose Units' },
          { key: 'allowed_vending',         label: 'Vending' },
          { key: 'is_consumable',           label: 'Consumable' },
          { key: 'is_non_stockable',        label: 'Non-Stockable' },
          { key: 'is_gluten_free',          label: 'Gluten Free' },
          { key: 'is_vegan_friendly',       label: 'Vegan' },
          { key: 'hse_suitable',            label: 'HSE' },
        ] as { key: keyof BrandFull; label: string }[]).map(({ key, label }) => {
          const val = brand[key] as boolean
          return (
            <span
              key={key}
              style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: val ? '#dcfce7' : '#f4f4f5',
                color: val ? '#16a34a' : '#a1a1aa',
              }}
            >
              {label} {val ? '✓' : '—'}
            </span>
          )
        })}
      </div>
    </div>

    {/* Pricing */}
    <div>
      <div style={{ ...keyStyle, display: 'block', marginBottom: 8 }}>Pricing</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          {
            label: 'Purchase (SKU)',
            price: brand.purchase_price,
            unitPrice: calcUnitPrice(brand.purchase_price, brand.bpu),
            badge: null,
            badgeColor: null,
          },
          {
            label: 'Wholesale (outer)',
            price: brand.wholesale_price_outer,
            unitPrice: calcUnitPrice(brand.wholesale_price_outer, brand.bpu),
            badge: null,
            badgeColor: '#2563eb',
          },
          {
            label: 'Vending (unit)',
            price: brand.vending_price,
            unitPrice: null,
            badge: null,
            badgeColor: '#7c3aed',
          },
        ].map(({ label, price, unitPrice }) => (
          <div
            key={label}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}
          >
            <span style={{ fontSize: 11, color: '#71717a' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>{formatPrice(price, sym)}</span>
              {unitPrice !== null && (
                <span style={{ fontSize: 10, color: '#a1a1aa' }}>{formatPrice(unitPrice, sym)}/unit</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add Logistics + Barcodes sub-tabs**

Add after the Commercial tab pane:

```tsx
{/* ── LOGISTICS TAB ────────────────────────────────────────────────── */}
{detailTab === 'logistics' && (
  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

    {/* Case */}
    <div>
      <div style={{ ...keyStyle, display: 'block', marginBottom: 6 }}>Case</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
          <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Weight</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
            {brand.case_weight != null ? `${brand.case_weight} kg` : '—'}
          </div>
        </div>
        <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
          <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Volume</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
            {brand.case_height != null && brand.case_length != null && brand.case_depth != null
              ? `${Math.round(brand.case_height * brand.case_length * brand.case_depth).toLocaleString()} cm³`
              : '—'}
          </div>
        </div>
        <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3, gridColumn: 'span 2' }}>
          <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Dimensions (H × L × D)</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
            {brand.case_height != null && brand.case_length != null && brand.case_depth != null
              ? `${brand.case_height} × ${brand.case_length} × ${brand.case_depth} cm`
              : '—'}
          </div>
        </div>
      </div>
    </div>

    {/* Product */}
    <div>
      <div style={{ ...keyStyle, display: 'block', marginBottom: 6 }}>Product (unit)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
          <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>Weight</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
            {brand.product_weight != null ? `${brand.product_weight} kg` : '—'}
          </div>
        </div>
        <div style={{ padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
          <div style={{ fontSize: 9, color: '#a1a1aa', marginBottom: 2 }}>kcal / unit</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#09090b' }}>
            {brand.kcal != null ? `${brand.kcal} kcal` : '—'}
          </div>
        </div>
      </div>
    </div>
  </div>
)}

{/* ── BARCODES TAB ─────────────────────────────────────────────────── */}
{detailTab === 'barcodes' && (
  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
    {barcodesLoading ? (
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#a1a1aa', fontSize: 12 }}>Loading...</div>
    ) : brandBarcodes.length === 0 ? (
      <div style={{ textAlign: 'center', padding: '24px 0', color: '#a1a1aa', fontSize: 12 }}>No barcodes</div>
    ) : (
      <>
        <div style={{ ...keyStyle, display: 'block', marginBottom: 8 }}>{brandBarcodes.length} barcode{brandBarcodes.length !== 1 ? 's' : ''}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {brandBarcodes.map(bc => (
            <div key={bc} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#3f3f46', letterSpacing: '0.04em', padding: '6px 10px', background: '#f9f9f9', border: '1px solid #e4e4e7', borderRadius: 3 }}>
              {bc}
            </div>
          ))}
        </div>
      </>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify the detail panel in dev server**

```bash
npm run dev
```
Click a brand in the Inventory table. Verify:
- 4 sub-tabs appear: Info / Commercial / Logistics / Barcodes
- Info tab shows the existing fields and notes editor (unchanged behaviour)
- Commercial tab shows flags as badges, prices with unit derivation
- Logistics tab shows case dimensions and volume calculation
- Barcodes tab loads barcodes from DB (lazy — only fetches when tab is active)
- Switching between brands resets to the Info tab

- [ ] **Step 6: Commit**

```bash
git add src/pages/INVDetailPanel.tsx
git commit -m "feat: add commercial, logistics and barcodes sub-tabs to INVDetailPanel"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: all tests pass (priceUtils + useSystemSettings + existing tests)

- [ ] **Step 2: Run build**

```bash
npm run build
```
Expected: no TypeScript errors, build succeeds.

- [ ] **Step 3: Smoke test full flow**

1. Create a brand with all fields filled across all 4 tabs, including 2 barcodes → Save
2. Find the brand in the table → open detail panel → check all 4 sub-tabs show correct data
3. Edit the brand → change a price, remove one barcode, add another → Save
4. Reopen detail panel → verify changes persisted
5. Open Supabase Table Editor → verify `brands` row has the correct new column values and `brand_barcodes` has the correct entries

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: inventory commercial data extension complete

- SQL migration: 17 new brands columns, brand_barcodes table, system_settings table
- INVBrandForm: 4 tabs (Basic Info / Commercial / Logistics / Barcodes)
- INVDetailPanel: 4 sub-tabs with read-only commercial data display
- priceUtils: sales margin formula, unit price calc, price format
- useSystemSettings: session-cached settings hook with parseSettingsRows
- useBrandBarcodes: lazy barcode fetch hook"
```
