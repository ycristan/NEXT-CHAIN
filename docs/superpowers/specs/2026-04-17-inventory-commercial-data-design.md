# Inventory — Commercial Data Extension
**Date:** 2026-04-17
**Status:** Approved
**Scope:** Add commercial, logistical and barcode data to the Inventory module as groundwork for the future commercial (customer-facing) module.

---

## 1. Goals

- Enrich each brand/product with pricing, physical dimensions, dietary flags, commercial channel permissions and barcodes.
- Keep all data in a single `brands` table row (Approach A — flat schema, no extra joins).
- Extend `INVBrandForm` with internal tabs and `INVDetailPanel` with read-only sub-tabs.
- Introduce a `system_settings` table for configurable system-wide defaults (currency, units, margin percentages).

---

## 2. Database Schema Changes

### 2.1 New columns in `brands` (all nullable, non-breaking)

#### Commercial tab fields

| Column | Type | Default | Description |
|---|---|---|---|
| `purchase_price` | DECIMAL(10,2) | NULL | Cost price for 1 SKU Type unit |
| `wholesale_price_outer` | DECIMAL(10,2) | NULL | Selling price for 1 SKU Type unit (wholesale) |
| `vending_price` | DECIMAL(10,2) | NULL | Selling price per individual unit (vending) |
| `allowed_wholesale` | BOOLEAN | false | Product is available for wholesale channel |
| `wholesale_units_allowed` | BOOLEAN | false | When wholesale is active: can sell loose units (not only full SKU). Only meaningful when `allowed_wholesale = true` |
| `allowed_vending` | BOOLEAN | false | Product is available for vending machines |
| `is_consumable` | BOOLEAN | false | Internal company use — not sold to external customers |
| `is_non_stockable` | BOOLEAN | false | On-demand item — not kept in regular stock |
| `is_gluten_free` | BOOLEAN | false | Dietary flag |
| `is_vegan_friendly` | BOOLEAN | false | Dietary flag |
| `hse_suitable` | BOOLEAN | false | Health, Safety & Environment suitable |

#### Logistics tab fields

| Column | Type | Default | Description |
|---|---|---|---|
| `case_weight` | DECIMAL(8,3) | NULL | Weight of full case (kg) |
| `case_height` | DECIMAL(8,2) | NULL | Case height (cm) |
| `case_length` | DECIMAL(8,2) | NULL | Case length (cm) |
| `case_depth` | DECIMAL(8,2) | NULL | Case depth (cm) |
| `product_weight` | DECIMAL(8,3) | NULL | Weight of individual product unit (kg) |
| `kcal` | DECIMAL(8,2) | NULL | Kilocalories per product unit |

**Derived/calculated (never stored):**
- `unit_purchase_price` = `purchase_price / bpu`
- `unit_wholesale_price` = `wholesale_price_outer / bpu`
- `case_volume` = `case_height × case_length × case_depth` (cm³)

### 2.2 New table: `brand_barcodes`

```sql
CREATE TABLE brand_barcodes (
  id         uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand_id   uuid        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  barcode    text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  -- Reserved for scanning module (pistol scanners / mobile camera):
  --   barcode_type  text        (EAN-13, UPC-A, QR, internal, ...)
  --   description   text
  --   is_primary    boolean
  --   created_by    uuid REFERENCES profiles(id)
  --   scanned_at    timestamptz
  UNIQUE(barcode)
);
CREATE INDEX brand_barcodes_brand_id_idx ON brand_barcodes(brand_id);
```

One brand can have many barcodes. Barcodes are globally unique across all brands. The table is intentionally minimal now but designed to accommodate future barcode scanning workflows (goods receiving, returns, waste processing).

### 2.3 New table: `system_settings`

```sql
CREATE TABLE system_settings (
  key         text PRIMARY KEY,
  value       text        NOT NULL,
  description text,
  updated_at  timestamptz DEFAULT now()
);
```

**Seed rows:**

| key | value | description |
|---|---|---|
| `currency` | `EUR` | ISO 4217 currency code |
| `unit_system` | `metric` | `metric` or `imperial` |
| `date_format` | `DD/MM/YYYY` | Display date format |
| `wholesale_margin_1` | `35` | First wholesale margin suggestion (%) |
| `wholesale_margin_2` | `40` | Second wholesale margin suggestion (%) |
| `wholesale_margin_3` | `45` | Third wholesale margin suggestion (%) |
| `vending_margin_1` | `50` | First vending margin suggestion (%) |
| `vending_margin_2` | `60` | Second vending margin suggestion (%) |
| `vending_margin_3` | `65` | Third vending margin suggestion (%) |

These are configurable in System Library under a new "Commercial Defaults" section. The currency symbol is derived from the `currency` code via the `Intl` API at render time — not stored separately.

---

## 3. UI — INVBrandForm (modal, tabs)

The existing single-pane form gains 4 internal tabs. Tab navigation is purely presentational — all tabs submit together in one save operation.

### Tab 1: Basic Info (existing fields, unchanged)
`is_active`, `brand_code`, `brand_name`, `category_id`, `category1_id`, `sku_type_id`, `bpu`, `pallet_size`, `notes`, images (1–3).

### Tab 2: Commercial

**Product Flags section** (2-column checkbox grid):
- Allowed Wholesale
- Loose Units Allowed ← only enabled when `allowed_wholesale = true`; visually indented/highlighted
- Allowed Vending
- Consumable (Internal)
- Non-Stockable
- Gluten Free
- Vegan Friendly
- HSE Suitable

**Pricing section:**

| Field | Input | Derived display |
|---|---|---|
| Purchase Price (SKU) | `€` + number input | `€X.XX / unit` = value ÷ BPU |
| Wholesale Price (outer) | `€` + number input | `€X.XX / unit` = value ÷ BPU |
| Vending Price (unit) | `€` + number input | — |

**Margin suggestion buttons** (inline, next to each price field):
- Wholesale: three buttons `35%` `40%` `45%` (blue tones). Click fills `wholesale_price_outer` with `purchase_price / (1 − margin/100)`.
- Vending: three buttons `50%` `60%` `65%` (purple tones). Click fills `vending_price` with `(purchase_price / bpu) / (1 − margin/100)`.
- Button percentages are read from `system_settings` keys `wholesale_margin_1/2/3` and `vending_margin_1/2/3`.

### Tab 3: Logistics

**Case section:**
- Case Weight (kg), Case Height (cm), Case Length (cm), Case Depth (cm) — 4-column grid
- Case Volume (cm³) — read-only, auto-calculated display: `H × L × D`

**Product (unit) section:**
- Product Weight (kg), kcal (per unit) — 2-column grid

### Tab 4: Barcodes

- Text input + "Add" button to append a barcode
- Scrollable list of existing barcodes (monospace font)
- Each barcode has a remove (✕) button
- Barcodes are saved/deleted via `brand_barcodes` table
- On save: new barcodes inserted, removed ones deleted; existing ones untouched
- Duplicate barcode (unique constraint violation → ERRCODE 23505) shows inline error

---

## 4. UI — INVDetailPanel (read-only sub-tabs)

The existing detail panel (right sidebar) gains 4 sub-tabs. All tabs are read-only; editing is done exclusively via the form modal.

### Tab: Info (existing content)
Status badge, SKU Type, BPU, Pallet Size, Category → Subcategory.

### Tab: Commercial
- **Flags** row — each flag rendered as a pill badge: green (`✓`) if true, grey (`—`) if false. Flags: Wholesale, Loose Units, Vending, Consumable, Non-Stockable, Gluten Free, Vegan, HSE.
- **Pricing** rows — each price on its own row:
  - Purchase: `€24.00` + `€2.00/unit` derived label
  - Wholesale: `€36.92` + `€3.08/unit` + margin badge (e.g., `35%` in blue)
  - Vending: `€4.00` + margin badge (e.g., `50%` in purple)
  - If a price is NULL, show `—`

### Tab: Logistics
- Case group: Weight, Volume (calculated), Dimensions as `H × L × D cm`
- Product group: Weight, kcal

### Tab: Barcodes
- Count label (`N barcodes`)
- Scrollable read-only list, monospace font

---

## 5. BrandFull Type Extension

`BrandFull` (currently in `INVDetailPanel.tsx`) gains all new scalar fields. Barcodes are fetched separately (not part of the main brands query) to avoid row explosion from a 1:many join. A `useBrandBarcodes(brandId)` hook fetches from `brand_barcodes` when the Barcodes tab is active.

The main inventory query (`select *`) automatically includes the new columns. No query changes needed.

---

## 6. system_settings Hook

A `useSystemSettings()` hook (in `src/lib/`) fetches `system_settings` once per session and caches in module-level state. Exposes:
```ts
{
  currency: string        // e.g. 'EUR'
  currencySymbol: string  // derived via Intl: '€'
  unitSystem: 'metric' | 'imperial'
  dateFormat: string
  wholesaleMargins: [number, number, number]  // e.g. [35, 40, 45]
  vendingMargins: [number, number, number]    // e.g. [50, 60, 65]
}
```

---

## 7. SQL Migration File

Single file: `sql/inventory_commercial_data.sql`

Contents:
1. `ALTER TABLE brands ADD COLUMN ...` (all 17 new columns)
2. `CREATE TABLE brand_barcodes ...`
3. `CREATE TABLE system_settings ...`
4. `INSERT INTO system_settings ...` (seed rows)
5. RLS policies for `brand_barcodes` (read: authenticated; write: admin/manager)
6. RLS policies for `system_settings` (read: authenticated; write: admin only)

---

## 8. Inventory Table (main list view)

No new columns added to the visible table at this stage. Commercial data is accessible via the detail panel. This avoids overloading the already-wide table. Future consideration: add price columns as optional toggleable columns.

---

## 9. Out of Scope (this spec)

- System Library UI for "Commercial Defaults" — separate spec
- Customer-facing commercial catalogue — separate spec
- Barcode scanner integration (pistol/mobile camera) — separate spec
- Price history / audit trail
- Multi-currency support
