# Order Portal — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the complete database schema, RLS policies, TypeScript types, username+PIN authentication, and App.tsx routing split that all subsequent phases depend on.

**Architecture:** New `client` role users log in via username+PIN (Supabase Auth with hidden email `<username>@portal.nextchain.internal`). `App.tsx` detects the role and renders either the existing internal layout or the new `ClientPortalLayout`. All new tables follow the same RLS patterns as existing tables (using `is_admin()` SECURITY DEFINER functions to avoid recursion).

**Tech Stack:** React 19 + TypeScript + Vite + Supabase (PostgreSQL + Auth) + React Router 7

---

> ⚠️ **Branch:** All work goes to `feat/order-portal` — NEVER commit to main.
> ⚠️ **SQL files:** Every `.sql` file created here must be run manually in Supabase SQL Editor (supabase.com → your project → SQL Editor) before testing.

---

### Task 1: SQL Schema — All New Tables + RLS

**Files:**
- Create: `sql/order_portal_setup.sql`

- [ ] **Step 1: Create the SQL file**

Create `sql/order_portal_setup.sql` with the full content below. This is one file meant to be run once in Supabase SQL Editor.

```sql
-- ====================================================
-- ORDER PORTAL — Database Setup
-- Run this entire file in Supabase SQL Editor ONCE
-- ====================================================

-- 1. Add portal_username to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS portal_username text UNIQUE;

-- 2. Helper functions for RLS

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) = 'client'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_client() TO authenticated;

-- Returns all client_account_ids the current user is linked to
CREATE OR REPLACE FUNCTION public.get_client_account_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT client_account_id
  FROM public.client_account_users
  WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_client_account_ids() TO authenticated;

-- 3. client_accounts (the company entity)
CREATE TABLE IF NOT EXISTS public.client_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  region text NOT NULL DEFAULT 'IE' CHECK (region IN ('IE', 'GB-NIR')),
  allow_avulso boolean NOT NULL DEFAULT false,
  weekend_delivery boolean NOT NULL DEFAULT false,
  holiday_delivery boolean NOT NULL DEFAULT false,
  same_day_delivery boolean NOT NULL DEFAULT false,
  custom_cutoff_time time DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_accounts_select" ON public.client_accounts
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND id IN (SELECT get_client_account_ids()))
  );

CREATE POLICY "client_accounts_admin_write" ON public.client_accounts
  FOR ALL USING (is_admin());

-- 4. client_account_users (junction: user <-> company, many-to-many)
CREATE TABLE IF NOT EXISTS public.client_account_users (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_account_id)
);

ALTER TABLE public.client_account_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cau_select" ON public.client_account_users
  FOR SELECT USING (
    is_admin() OR has_write_role() OR user_id = auth.uid()
  );

CREATE POLICY "cau_admin_write" ON public.client_account_users
  FOR ALL USING (is_admin());

-- 5. client_buildings
CREATE TABLE IF NOT EXISTS public.client_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  contact_name text,
  contact_phone text,
  delivery_instructions text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.client_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buildings_select" ON public.client_buildings
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND client_account_id IN (SELECT get_client_account_ids()))
  );

CREATE POLICY "buildings_admin_write" ON public.client_buildings
  FOR ALL USING (is_admin());

-- 6. client_catalogs (which brands each account can order)
CREATE TABLE IF NOT EXISTS public.client_catalogs (
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  PRIMARY KEY (client_account_id, brand_id)
);

ALTER TABLE public.client_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogs_select" ON public.client_catalogs
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND client_account_id IN (SELECT get_client_account_ids()))
  );

CREATE POLICY "catalogs_admin_write" ON public.client_catalogs
  FOR ALL USING (is_admin());

-- 7. brand_prices
CREATE TABLE IF NOT EXISTS public.brand_prices (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  price_per_case numeric NOT NULL CHECK (price_per_case >= 0),
  price_per_unit numeric CHECK (price_per_unit IS NULL OR price_per_unit >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  valid_from date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE public.brand_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_prices_select" ON public.brand_prices
  FOR SELECT USING (is_admin() OR has_write_role() OR is_client());

CREATE POLICY "brand_prices_admin_write" ON public.brand_prices
  FOR ALL USING (is_admin());

-- 8. cutoff_config (single-row global config)
CREATE TABLE IF NOT EXISTS public.cutoff_config (
  id integer PRIMARY KEY DEFAULT 1,
  cutoff_time time NOT NULL DEFAULT '14:00',
  timezone text NOT NULL DEFAULT 'Europe/Dublin',
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE public.cutoff_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cutoff_config_select" ON public.cutoff_config
  FOR SELECT USING (true);

CREATE POLICY "cutoff_config_admin_write" ON public.cutoff_config
  FOR ALL USING (is_admin());

INSERT INTO public.cutoff_config (id, cutoff_time, timezone)
VALUES (1, '14:00', 'Europe/Dublin')
ON CONFLICT (id) DO NOTHING;

-- 9. public_holidays
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  region text NOT NULL CHECK (region IN ('IE', 'GB-NIR')),
  UNIQUE (date, region, name)
);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holidays_select" ON public.public_holidays
  FOR SELECT USING (true);

CREATE POLICY "holidays_admin_write" ON public.public_holidays
  FOR ALL USING (is_admin());

-- 10. Order number sequence + orders table
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL DEFAULT '',
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id),
  building_id uuid NOT NULL REFERENCES public.client_buildings(id),
  ordered_by uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'open_prep'
    CHECK (status IN (
      'open_prep','open','picking','dispatch',
      'outstanding','transit','delivered','cancelled'
    )),
  desired_delivery_date date NOT NULL,
  confirmed_delivery_date date,
  po_number text,
  notes text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  transit_at timestamptz,
  delivered_at timestamptz
);

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.order_number := 'ORD-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('order_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_set_number') THEN
    CREATE TRIGGER orders_set_number
      BEFORE INSERT ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.set_order_number();
  END IF;
END $$;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND client_account_id IN (SELECT get_client_account_ids()))
  );

CREATE POLICY "orders_insert_client" ON public.orders
  FOR INSERT WITH CHECK (
    is_admin() OR
    (is_client()
      AND client_account_id IN (SELECT get_client_account_ids())
      AND ordered_by = auth.uid())
  );

CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    is_admin() OR has_write_role() OR
    (is_client()
      AND ordered_by = auth.uid()
      AND status IN ('open_prep', 'open'))
  );

-- 11. order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  quantity_cases integer NOT NULL DEFAULT 0 CHECK (quantity_cases >= 0),
  quantity_units integer CHECK (quantity_units IS NULL OR quantity_units >= 0),
  price_per_case numeric NOT NULL CHECK (price_per_case >= 0),
  price_per_unit numeric CHECK (price_per_unit IS NULL OR price_per_unit >= 0),
  subtotal numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','picked','outstanding','back_order','cancelled')),
  outstanding_reason text
    CHECK (outstanding_reason IN ('out_of_stock','outdated','damaged','other')),
  outstanding_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE client_account_id IN (SELECT get_client_account_ids())
    ))
  );

CREATE POLICY "order_items_insert_client" ON public.order_items
  FOR INSERT WITH CHECK (
    is_admin() OR has_write_role() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE ordered_by = auth.uid() AND status IN ('open_prep','open')
    ))
  );

CREATE POLICY "order_items_update" ON public.order_items
  FOR UPDATE USING (
    is_admin() OR has_write_role() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE ordered_by = auth.uid() AND status IN ('open_prep','open')
    ))
  );

CREATE POLICY "order_items_delete_client" ON public.order_items
  FOR DELETE USING (
    is_admin() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE ordered_by = auth.uid() AND status IN ('open_prep','open')
    ))
  );
```

- [ ] **Step 2: Run in Supabase SQL Editor**

> ⚠️ **REQUIRED MANUAL STEP:** Open supabase.com → your project → SQL Editor → paste the entire file → Run.
>
> Verify success: all statements should complete without error. Check Tables section — you should see: `client_accounts`, `client_account_users`, `client_buildings`, `client_catalogs`, `brand_prices`, `cutoff_config`, `public_holidays`, `orders`, `order_items`.

- [ ] **Step 3: Commit the SQL file**

```bash
git add sql/order_portal_setup.sql
git commit -m "feat(db): add order portal schema — tables, RLS, helper functions"
```

---

### Task 2: Seed Public Holidays (IE + GB-NIR)

**Files:**
- Create: `sql/public_holidays_ie_uk.sql`

- [ ] **Step 1: Create seed file**

```sql
-- ====================================================
-- PUBLIC HOLIDAYS SEED — Ireland (IE) + N. Ireland (GB-NIR)
-- Run in Supabase SQL Editor after order_portal_setup.sql
-- ====================================================

-- Republic of Ireland 2025-2026
INSERT INTO public.public_holidays (date, name, region) VALUES
  ('2025-01-01', 'New Year''s Day', 'IE'),
  ('2025-02-03', 'St. Brigid''s Day', 'IE'),
  ('2025-03-17', 'St. Patrick''s Day', 'IE'),
  ('2025-04-21', 'Easter Monday', 'IE'),
  ('2025-05-05', 'May Bank Holiday', 'IE'),
  ('2025-06-02', 'June Bank Holiday', 'IE'),
  ('2025-08-04', 'August Bank Holiday', 'IE'),
  ('2025-10-27', 'October Bank Holiday', 'IE'),
  ('2025-12-25', 'Christmas Day', 'IE'),
  ('2025-12-26', 'St. Stephen''s Day', 'IE'),
  ('2026-01-01', 'New Year''s Day', 'IE'),
  ('2026-02-02', 'St. Brigid''s Day', 'IE'),
  ('2026-03-17', 'St. Patrick''s Day', 'IE'),
  ('2026-04-06', 'Easter Monday', 'IE'),
  ('2026-05-04', 'May Bank Holiday', 'IE'),
  ('2026-06-01', 'June Bank Holiday', 'IE'),
  ('2026-08-03', 'August Bank Holiday', 'IE'),
  ('2026-10-26', 'October Bank Holiday', 'IE'),
  ('2026-12-25', 'Christmas Day', 'IE'),
  ('2026-12-26', 'St. Stephen''s Day', 'IE')
ON CONFLICT (date, region, name) DO NOTHING;

-- Northern Ireland / UK 2025-2026
INSERT INTO public.public_holidays (date, name, region) VALUES
  ('2025-01-01', 'New Year''s Day', 'GB-NIR'),
  ('2025-03-17', 'St. Patrick''s Day', 'GB-NIR'),
  ('2025-04-18', 'Good Friday', 'GB-NIR'),
  ('2025-04-21', 'Easter Monday', 'GB-NIR'),
  ('2025-05-05', 'Early May Bank Holiday', 'GB-NIR'),
  ('2025-05-26', 'Spring Bank Holiday', 'GB-NIR'),
  ('2025-07-14', 'Battle of the Boyne (Orangemen''s Day)', 'GB-NIR'),
  ('2025-08-25', 'Summer Bank Holiday', 'GB-NIR'),
  ('2025-12-25', 'Christmas Day', 'GB-NIR'),
  ('2025-12-26', 'Boxing Day', 'GB-NIR'),
  ('2026-01-01', 'New Year''s Day', 'GB-NIR'),
  ('2026-03-17', 'St. Patrick''s Day', 'GB-NIR'),
  ('2026-04-03', 'Good Friday', 'GB-NIR'),
  ('2026-04-06', 'Easter Monday', 'GB-NIR'),
  ('2026-05-04', 'Early May Bank Holiday', 'GB-NIR'),
  ('2026-05-25', 'Spring Bank Holiday', 'GB-NIR'),
  ('2026-07-13', 'Battle of the Boyne (Orangemen''s Day)', 'GB-NIR'),
  ('2026-08-31', 'Summer Bank Holiday', 'GB-NIR'),
  ('2026-12-25', 'Christmas Day', 'GB-NIR'),
  ('2026-12-26', 'Boxing Day', 'GB-NIR')
ON CONFLICT (date, region, name) DO NOTHING;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

> ⚠️ **REQUIRED MANUAL STEP:** Run in SQL Editor. Verify: `SELECT count(*) FROM public_holidays;` should return 40.

- [ ] **Step 3: Commit**

```bash
git add sql/public_holidays_ie_uk.sql
git commit -m "feat(db): seed IE and GB-NIR public holidays 2025-2026"
```

---

### Task 3: TypeScript Types

**Files:**
- Create: `src/types/orders.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/types/orders.ts

export type OrderRegion = 'IE' | 'GB-NIR'

export type OrderStatus =
  | 'open_prep'
  | 'open'
  | 'picking'
  | 'dispatch'
  | 'outstanding'
  | 'transit'
  | 'delivered'
  | 'cancelled'

export type OrderItemStatus =
  | 'pending'
  | 'picked'
  | 'outstanding'
  | 'back_order'
  | 'cancelled'

export type OutstandingReason =
  | 'out_of_stock'
  | 'outdated'
  | 'damaged'
  | 'other'

export interface ClientAccount {
  id: string
  company_name: string
  region: OrderRegion
  allow_avulso: boolean
  weekend_delivery: boolean
  holiday_delivery: boolean
  same_day_delivery: boolean
  custom_cutoff_time: string | null  // 'HH:MM' or null
  is_active: boolean
  created_at: string
}

export interface ClientAccountUser {
  user_id: string
  client_account_id: string
}

export interface ClientBuilding {
  id: string
  client_account_id: string
  name: string
  address: string
  contact_name: string | null
  contact_phone: string | null
  delivery_instructions: string | null
  is_active: boolean
  created_at: string
}

export interface ClientCatalogEntry {
  client_account_id: string
  brand_id: string
}

export interface BrandPrice {
  brand_id: string
  price_per_case: number
  price_per_unit: number | null
  currency: string
  valid_from: string
}

export interface CutoffConfig {
  id: 1
  cutoff_time: string  // 'HH:MM'
  timezone: string     // e.g. 'Europe/Dublin'
}

export interface PublicHoliday {
  id: string
  date: string  // 'YYYY-MM-DD'
  name: string
  region: OrderRegion
}

export interface Order {
  id: string
  order_number: string
  client_account_id: string
  building_id: string
  ordered_by: string
  status: OrderStatus
  desired_delivery_date: string   // 'YYYY-MM-DD'
  confirmed_delivery_date: string | null
  po_number: string | null
  notes: string | null
  total_amount: number
  created_at: string
  confirmed_at: string | null
  dispatched_at: string | null
  transit_at: string | null
  delivered_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  brand_id: string
  quantity_cases: number
  quantity_units: number | null
  price_per_case: number
  price_per_unit: number | null
  subtotal: number
  status: OrderItemStatus
  outstanding_reason: OutstandingReason | null
  outstanding_notes: string | null
  created_at: string
}

// Cart state (client-side only, not persisted until checkout)
export interface CartItem {
  brand_id: string
  brand_code: string
  brand_name: string
  image_url: string | null
  price_per_case: number
  price_per_unit: number | null
  quantity_cases: number
  quantity_units: number
}

// Order with joined data for display
export interface OrderWithDetails extends Order {
  client_account: Pick<ClientAccount, 'company_name'>
  building: Pick<ClientBuilding, 'name' | 'address'>
  items: OrderItemWithBrand[]
}

export interface OrderItemWithBrand extends OrderItem {
  brand: {
    brand_code: string
    brand_name: string
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/orders.ts
git commit -m "feat(types): add order portal TypeScript types"
```

---

### Task 4: deliveryCalendar.ts — TDD

**Files:**
- Create: `src/lib/deliveryCalendar.ts`
- Create: `src/test/deliveryCalendar.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// src/test/deliveryCalendar.test.ts
import { describe, it, expect } from 'vitest'
import { getAvailableDeliveryDates } from '../lib/deliveryCalendar'
import type { ClientAccount, CutoffConfig, PublicHoliday } from '../types/orders'

const BASE_CONFIG: CutoffConfig = { id: 1, cutoff_time: '14:00', timezone: 'Europe/Dublin' }

const IE_ACCOUNT: ClientAccount = {
  id: 'acc-1', company_name: 'Test Co', region: 'IE',
  allow_avulso: false, weekend_delivery: false,
  holiday_delivery: false, same_day_delivery: false,
  custom_cutoff_time: null, is_active: true, created_at: ''
}

// 2026-06-01 is a Monday (no holidays)
const MONDAY_BEFORE_CUTOFF = new Date('2026-06-01T10:00:00') // 10:00 IE time, before 14:00
const MONDAY_AFTER_CUTOFF  = new Date('2026-06-01T16:00:00') // 16:00 IE time, after 14:00

describe('getAvailableDeliveryDates', () => {
  it('before cutoff on Monday → first available date is Tuesday', () => {
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], MONDAY_BEFORE_CUTOFF)
    expect(dates[0]).toBe('2026-06-02') // Tuesday
  })

  it('after cutoff on Monday → first available date is Wednesday', () => {
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], MONDAY_AFTER_CUTOFF)
    expect(dates[0]).toBe('2026-06-03') // Wednesday
  })

  it('skips weekends by default', () => {
    // Friday before cutoff → next weekday is Monday (skips Saturday + Sunday)
    const fridayBeforeCutoff = new Date('2026-06-05T10:00:00') // Friday
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], fridayBeforeCutoff)
    expect(dates[0]).toBe('2026-06-08') // Monday
  })

  it('includes weekends when weekend_delivery is true', () => {
    const account = { ...IE_ACCOUNT, weekend_delivery: true }
    const fridayBeforeCutoff = new Date('2026-06-05T10:00:00')
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], fridayBeforeCutoff)
    expect(dates[0]).toBe('2026-06-06') // Saturday
  })

  it('skips IE public holidays', () => {
    // 2026-08-03 is August Bank Holiday (IE), Monday
    const holidays: PublicHoliday[] = [
      { id: '1', date: '2026-08-03', name: 'August Bank Holiday', region: 'IE' }
    ]
    const sundayBefore = new Date('2026-08-02T10:00:00') // Sunday before cutoff
    const account = { ...IE_ACCOUNT, weekend_delivery: false }
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, holidays, sundayBefore)
    // Sunday after cutoff → candidate is Tuesday; but Monday is holiday → first is Tuesday
    expect(dates[0]).not.toBe('2026-08-03')
    expect(dates[0]).toBe('2026-08-04')
  })

  it('includes holidays when holiday_delivery is true', () => {
    const holidays: PublicHoliday[] = [
      { id: '1', date: '2026-08-03', name: 'August Bank Holiday', region: 'IE' }
    ]
    const account = { ...IE_ACCOUNT, holiday_delivery: true }
    const fridayBefore = new Date('2026-07-31T10:00:00') // Friday before cutoff
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, holidays, fridayBefore)
    expect(dates[0]).toBe('2026-08-03') // Monday (holiday, but allowed)
  })

  it('uses client custom_cutoff_time when set', () => {
    const account = { ...IE_ACCOUNT, custom_cutoff_time: '10:00' }
    // 11:00 is after custom cutoff of 10:00 → candidate is day after next weekday
    const mondayAt11 = new Date('2026-06-01T11:00:00')
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], mondayAt11)
    expect(dates[0]).toBe('2026-06-03') // Wednesday (skips Tuesday)
  })

  it('includes today when same_day_delivery is true and before cutoff', () => {
    const account = { ...IE_ACCOUNT, same_day_delivery: true }
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], MONDAY_BEFORE_CUTOFF)
    expect(dates[0]).toBe('2026-06-01') // today
  })

  it('does NOT include today when same_day_delivery is true but after cutoff', () => {
    const account = { ...IE_ACCOUNT, same_day_delivery: true }
    const dates = getAvailableDeliveryDates(account, BASE_CONFIG, [], MONDAY_AFTER_CUTOFF)
    expect(dates[0]).not.toBe('2026-06-01')
    expect(dates[0]).toBe('2026-06-03') // Wednesday
  })

  it('returns 14 dates', () => {
    const dates = getAvailableDeliveryDates(IE_ACCOUNT, BASE_CONFIG, [], MONDAY_BEFORE_CUTOFF)
    expect(dates.length).toBe(14)
  })

  it('only skips GB-NIR holidays for GB-NIR accounts, not IE holidays', () => {
    const nirAccount = { ...IE_ACCOUNT, region: 'GB-NIR' as const }
    const ieOnlyHoliday: PublicHoliday[] = [
      { id: '1', date: '2026-06-02', name: 'IE Only Holiday', region: 'IE' }
    ]
    const dates = getAvailableDeliveryDates(nirAccount, BASE_CONFIG, ieOnlyHoliday, MONDAY_BEFORE_CUTOFF)
    expect(dates[0]).toBe('2026-06-02') // Tuesday — NOT skipped for GB-NIR account
  })
})
```

- [ ] **Step 2: Run tests and confirm they FAIL**

```bash
npm test src/test/deliveryCalendar.test.ts
```
Expected: FAIL — `Cannot find module '../lib/deliveryCalendar'`

- [ ] **Step 3: Implement deliveryCalendar.ts**

```typescript
// src/lib/deliveryCalendar.ts
import type { ClientAccount, CutoffConfig, PublicHoliday } from '../types/orders'

/**
 * Returns up to 14 available delivery dates (as 'YYYY-MM-DD' strings)
 * based on the client account's delivery rules, global cutoff config,
 * and public holiday calendar.
 */
export function getAvailableDeliveryDates(
  account: ClientAccount,
  config: CutoffConfig,
  holidays: PublicHoliday[],
  now: Date = new Date()
): string[] {
  const cutoffTime = account.custom_cutoff_time ?? config.cutoff_time  // 'HH:MM'
  const [cutoffH, cutoffM] = cutoffTime.split(':').map(Number)

  // Determine cutoff datetime for today in the configured timezone
  // We approximate by using local time comparison (good enough for IE/UK same offset)
  const todayDate = toDateString(now)
  const cutoffDate = new Date(now)
  cutoffDate.setHours(cutoffH, cutoffM, 0, 0)

  const isBeforeCutoff = now < cutoffDate

  // Calculate first candidate date
  // Before cutoff → +1 day; After cutoff → +2 days
  const daysToAdd = isBeforeCutoff ? 1 : 2
  const candidate = addDays(now, daysToAdd)

  const holidaySet = new Set(
    holidays
      .filter(h => h.region === account.region)
      .map(h => h.date)
  )

  const results: string[] = []

  // If same-day delivery and before cutoff, include today
  if (account.same_day_delivery && isBeforeCutoff) {
    results.push(todayDate)
  }

  // Walk forward collecting up to 14 available dates
  let current = candidate
  let maxDaysToSearch = 60  // safety limit
  while (results.length < 14 && maxDaysToSearch > 0) {
    maxDaysToSearch--
    const dateStr = toDateString(current)
    const dow = current.getDay() // 0=Sun, 6=Sat

    const isWeekend = dow === 0 || dow === 6
    const isHoliday = holidaySet.has(dateStr)

    const isAvailable =
      (!isWeekend || account.weekend_delivery) &&
      (!isHoliday || account.holiday_delivery)

    if (isAvailable) results.push(dateStr)
    current = addDays(current, 1)
  }

  return results
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}
```

- [ ] **Step 4: Run tests and confirm they PASS**

```bash
npm test src/test/deliveryCalendar.test.ts
```
Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deliveryCalendar.ts src/test/deliveryCalendar.test.ts
git commit -m "feat(lib): add deliveryCalendar — TDD, cut-off + holiday logic"
```

---

### Task 5: portalAuth.ts — Username + PIN login

**Files:**
- Create: `src/lib/portalAuth.ts`
- Create: `src/test/portalAuth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/portalAuth.test.ts
import { describe, it, expect } from 'vitest'
import { buildPortalEmail, validatePin } from '../lib/portalAuth'

describe('buildPortalEmail', () => {
  it('converts username to hidden email format', () => {
    expect(buildPortalEmail('john_driver')).toBe('john_driver@portal.nextchain.internal')
  })

  it('lowercases the username', () => {
    expect(buildPortalEmail('JohnDriver')).toBe('johndriver@portal.nextchain.internal')
  })
})

describe('validatePin', () => {
  it('accepts 6-digit numeric PIN', () => {
    expect(validatePin('123456')).toBe(true)
  })

  it('rejects PIN shorter than 6 digits', () => {
    expect(validatePin('12345')).toBe(false)
  })

  it('rejects PIN longer than 6 digits', () => {
    expect(validatePin('1234567')).toBe(false)
  })

  it('rejects PIN with non-numeric characters', () => {
    expect(validatePin('12345a')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and confirm they FAIL**

```bash
npm test src/test/portalAuth.test.ts
```
Expected: FAIL — `Cannot find module '../lib/portalAuth'`

- [ ] **Step 3: Implement portalAuth.ts**

```typescript
// src/lib/portalAuth.ts
import { supabase } from './supabase'

export function buildPortalEmail(username: string): string {
  return `${username.toLowerCase()}@portal.nextchain.internal`
}

export function validatePin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

/**
 * Signs in a portal client user using username + 6-digit PIN.
 * The email used for Supabase Auth is hidden from the user.
 * Throws an error with a safe message if credentials are invalid.
 */
export async function portalSignIn(username: string, pin: string): Promise<void> {
  if (!username.trim()) throw new Error('Username is required')
  if (!validatePin(pin)) throw new Error('PIN must be exactly 6 digits')

  const email = buildPortalEmail(username)
  const { error } = await supabase.auth.signInWithPassword({ email, password: pin })

  if (error) throw new Error('Invalid username or PIN')
}

/**
 * Creates a new portal user account (admin only).
 * Generates the hidden email and uses the PIN as the password.
 */
export async function createPortalUser(
  username: string,
  pin: string,
  displayName: string
): Promise<{ userId: string }> {
  if (!validatePin(pin)) throw new Error('PIN must be exactly 6 digits')

  const email = buildPortalEmail(username)

  // Create auth user via Supabase Admin API
  // Note: this requires the service_role key — call from a trusted context or Edge Function
  // For admin use from the WMS, the admin is already authenticated and uses RLS bypass
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { display_name: displayName }
  })

  if (error) throw new Error(`Failed to create portal user: ${error.message}`)
  if (!data.user) throw new Error('User creation returned no user')

  return { userId: data.user.id }
}
```

- [ ] **Step 4: Run tests and confirm they PASS**

```bash
npm test src/test/portalAuth.test.ts
```
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portalAuth.ts src/test/portalAuth.test.ts
git commit -m "feat(auth): add portalAuth — username+PIN login for client users"
```

---

### Task 6: App.tsx — Client Role Routing

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/ClientPortal/index.tsx`
- Create: `src/pages/ClientPortal/PortalLogin.tsx`

- [ ] **Step 1: Read the current App.tsx**

Read `src/App.tsx` in full before editing. Understand the existing route structure and where `ProtectedRoute` is used.

- [ ] **Step 2: Create ClientPortalLayout skeleton**

```tsx
// src/pages/ClientPortal/index.tsx
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ClientPortalLayout() {
  const { profile } = useAuth()

  if (!profile) return null
  if (profile.role?.toLowerCase() !== 'client') {
    return <Navigate to="/" replace />
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Navbar — implemented in Phase 2 */}
      <div style={{
        background: '#1e293b', color: 'white', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>NEXT CHAIN</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Portal</span>
      </div>
      <Outlet />
    </div>
  )
}
```

- [ ] **Step 3: Create PortalLogin page**

```tsx
// src/pages/ClientPortal/PortalLogin.tsx
import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { portalSignIn } from '../../lib/portalAuth'

export default function PortalLogin() {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await portalSignIn(username, pin)
      navigate('/portal/catalog')
    } catch (err: any) {
      setError(err.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 48px)', padding: 24
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 40,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', width: '100%', maxWidth: 360
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
          Order Portal
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: 14, color: '#64748b' }}>
          Sign in to place your order
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="6-digit PIN"
              required
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                borderRadius: 8, fontSize: 14, letterSpacing: 8, boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 16px', padding: '8px 12px', background: '#fef2f2', borderRadius: 6 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px', background: loading ? '#94a3b8' : '#2563eb',
              color: 'white', border: 'none', borderRadius: 8, fontSize: 15,
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Modify App.tsx to add portal routes**

In `src/App.tsx`, find where routes are defined and add the portal routes. The exact location depends on the current file — read it first.

Add these imports at the top:
```tsx
import ClientPortalLayout from './pages/ClientPortal/index'
import PortalLogin from './pages/ClientPortal/PortalLogin'
```

Add portal routes (place BEFORE or alongside existing protected routes — the layout itself redirects non-clients away):
```tsx
{/* Portal routes — for client role */}
<Route path="/portal/login" element={<PortalLogin />} />
<Route path="/portal" element={<ClientPortalLayout />}>
  <Route index element={<Navigate to="/portal/catalog" replace />} />
  <Route path="catalog" element={<div style={{ padding: 24 }}>Catalog — Phase 2</div>} />
  <Route path="orders" element={<div style={{ padding: 24 }}>My Orders — Phase 2</div>} />
  <Route path="order/:id" element={<div style={{ padding: 24 }}>Order Detail — Phase 2</div>} />
</Route>
```

Also update the root redirect: when `profile.role === 'client'`, redirect to `/portal/catalog` instead of `/` (which shows the internal WMS). Find where the initial redirect happens after login and add:
```tsx
// In AuthContext or ProtectedRoute, after profile loads:
if (profile?.role?.toLowerCase() === 'client') {
  // Navigate to portal
  return <Navigate to="/portal/catalog" replace />
}
```

Read `src/contexts/AuthContext.tsx` and `src/components/ProtectedRoute.tsx` to find the exact location for this redirect.

- [ ] **Step 5: Run the dev server and verify**

```bash
npm run dev
```

Verify manually:
1. Navigate to `http://localhost:5173/portal/login` — see the username+PIN login form
2. Internal routes still work normally (login with an internal account)
3. No TypeScript errors in the console

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/ClientPortal/index.tsx src/pages/ClientPortal/PortalLogin.tsx
git commit -m "feat(portal): add client portal routing + username+PIN login page"
```

---

### Task 7: PortalContext — Active Account + Building State

**Files:**
- Create: `src/contexts/PortalContext.tsx`

- [ ] **Step 1: Create PortalContext**

```tsx
// src/contexts/PortalContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import type { ClientAccount, ClientBuilding } from '../types/orders'

interface PortalContextValue {
  accounts: ClientAccount[]
  activeAccount: ClientAccount | null
  activeBuilding: ClientBuilding | null
  buildings: ClientBuilding[]
  setActiveAccount: (account: ClientAccount) => void
  setActiveBuilding: (building: ClientBuilding) => void
  loading: boolean
}

const PortalContext = createContext<PortalContextValue | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<ClientAccount[]>([])
  const [buildings, setBuildings] = useState<ClientBuilding[]>([])
  const [activeAccount, setActiveAccount] = useState<ClientAccount | null>(null)
  const [activeBuilding, setActiveBuilding] = useState<ClientBuilding | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile || profile.role?.toLowerCase() !== 'client') {
      setLoading(false)
      return
    }
    loadAccounts()
  }, [profile])

  useEffect(() => {
    if (!activeAccount) return
    loadBuildings(activeAccount.id)
  }, [activeAccount])

  async function loadAccounts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_account_users')
      .select('client_account_id, client_accounts(*)')
      .eq('user_id', profile!.id)

    if (!error && data) {
      const accs = data
        .map((row: any) => row.client_accounts)
        .filter(Boolean)
        .filter((a: ClientAccount) => a.is_active) as ClientAccount[]
      setAccounts(accs)
      if (accs.length === 1) setActiveAccount(accs[0])
    }
    setLoading(false)
  }

  async function loadBuildings(accountId: string) {
    const { data, error } = await supabase
      .from('client_buildings')
      .select('*')
      .eq('client_account_id', accountId)
      .eq('is_active', true)
      .order('name')

    if (!error && data) {
      setBuildings(data as ClientBuilding[])
      if (data.length === 1) setActiveBuilding(data[0] as ClientBuilding)
      else setActiveBuilding(null)
    }
  }

  return (
    <PortalContext.Provider value={{
      accounts, activeAccount, activeBuilding, buildings,
      setActiveAccount, setActiveBuilding, loading
    }}>
      {children}
    </PortalContext.Provider>
  )
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used within PortalProvider')
  return ctx
}
```

- [ ] **Step 2: Wrap ClientPortalLayout with PortalProvider**

In `src/pages/ClientPortal/index.tsx`, wrap the layout with `PortalProvider`:

```tsx
// Update src/pages/ClientPortal/index.tsx
import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PortalProvider } from '../../contexts/PortalContext'

export default function ClientPortalLayout() {
  const { profile } = useAuth()

  if (!profile) return null
  if (profile.role?.toLowerCase() !== 'client') {
    return <Navigate to="/" replace />
  }

  return (
    <PortalProvider>
      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          background: '#1e293b', color: 'white', padding: '12px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>NEXT CHAIN</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Portal</span>
        </div>
        <Outlet />
      </div>
    </PortalProvider>
  )
}
```

- [ ] **Step 3: Verify dev server — no errors**

```bash
npm run dev
```

Navigate to `/portal/login` and sign in with a test client account (create one manually in Supabase Auth + profiles if needed to test). Verify no console errors.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

All existing tests must still pass.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/PortalContext.tsx src/pages/ClientPortal/index.tsx
git commit -m "feat(portal): add PortalContext — active account + building state"
```

---

### Task 8: Final — Build Check + Phase 1 Complete

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: build completes with zero TypeScript errors and zero warnings about unused variables.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass (including new deliveryCalendar and portalAuth tests).

- [ ] **Step 3: Push branch**

```bash
git push origin feat/order-portal
```

- [ ] **Step 4: Verify on GitHub**

Open https://github.com/ycristan/NEXT-CHAIN/tree/feat/order-portal and confirm all committed files are present.

---

## Phase 1 Complete ✓

After this plan is done, the following are true:
- All new database tables exist in Supabase with RLS policies
- IE + GB-NIR public holidays are seeded for 2025-2026
- TypeScript types cover all new entities
- `deliveryCalendar.ts` is tested and correct (10 tests pass)
- `portalAuth.ts` is tested and correct (6 tests pass)
- Client users can log in via `/portal/login` with username + PIN
- `PortalContext` manages active account + building state
- Portal layout is isolated from internal WMS layout

**Next:** Phase 2 — Client Portal UI (Catalog, Cart, MyOrders)
→ Plan: `docs/superpowers/plans/2026-05-29-order-portal-phase2-client-portal.md`
