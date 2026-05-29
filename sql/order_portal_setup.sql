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

DROP POLICY IF EXISTS "client_accounts_select" ON public.client_accounts;
CREATE POLICY "client_accounts_select" ON public.client_accounts
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND id IN (SELECT get_client_account_ids()))
  );

DROP POLICY IF EXISTS "client_accounts_admin_write" ON public.client_accounts;
CREATE POLICY "client_accounts_admin_write" ON public.client_accounts
  FOR ALL USING (is_admin());

-- 4. client_account_users (junction: user <-> company, many-to-many)
CREATE TABLE IF NOT EXISTS public.client_account_users (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_account_id)
);

ALTER TABLE public.client_account_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cau_select" ON public.client_account_users;
CREATE POLICY "cau_select" ON public.client_account_users
  FOR SELECT USING (
    is_admin() OR has_write_role() OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "cau_admin_write" ON public.client_account_users;
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

DROP POLICY IF EXISTS "buildings_select" ON public.client_buildings;
CREATE POLICY "buildings_select" ON public.client_buildings
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND client_account_id IN (SELECT get_client_account_ids()))
  );

DROP POLICY IF EXISTS "buildings_admin_write" ON public.client_buildings;
CREATE POLICY "buildings_admin_write" ON public.client_buildings
  FOR ALL USING (is_admin());

-- 6. client_catalogs (which brands each account can order)
CREATE TABLE IF NOT EXISTS public.client_catalogs (
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  PRIMARY KEY (client_account_id, brand_id)
);

ALTER TABLE public.client_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalogs_select" ON public.client_catalogs;
CREATE POLICY "catalogs_select" ON public.client_catalogs
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND client_account_id IN (SELECT get_client_account_ids()))
  );

DROP POLICY IF EXISTS "catalogs_admin_write" ON public.client_catalogs;
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

DROP POLICY IF EXISTS "brand_prices_select" ON public.brand_prices;
CREATE POLICY "brand_prices_select" ON public.brand_prices
  FOR SELECT USING (is_admin() OR has_write_role() OR is_client());

DROP POLICY IF EXISTS "brand_prices_admin_write" ON public.brand_prices;
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

DROP POLICY IF EXISTS "cutoff_config_select" ON public.cutoff_config;
CREATE POLICY "cutoff_config_select" ON public.cutoff_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "cutoff_config_admin_write" ON public.cutoff_config;
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

DROP POLICY IF EXISTS "holidays_select" ON public.public_holidays;
CREATE POLICY "holidays_select" ON public.public_holidays
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "holidays_admin_write" ON public.public_holidays;
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

DROP POLICY IF EXISTS "orders_select" ON public.orders;
CREATE POLICY "orders_select" ON public.orders
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND client_account_id IN (SELECT get_client_account_ids()))
  );

DROP POLICY IF EXISTS "orders_insert_client" ON public.orders;
CREATE POLICY "orders_insert_client" ON public.orders
  FOR INSERT WITH CHECK (
    is_admin() OR
    (is_client()
      AND client_account_id IN (SELECT get_client_account_ids())
      AND ordered_by = auth.uid())
  );

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
  FOR UPDATE USING (
    is_admin() OR has_write_role() OR
    (is_client()
      AND ordered_by = auth.uid()
      AND status IN ('open_prep', 'open'))
  )
  WITH CHECK (
    is_admin() OR has_write_role() OR
    (is_client()
      AND ordered_by = auth.uid()
      AND client_account_id IN (SELECT get_client_account_ids())
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

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT USING (
    is_admin() OR has_write_role() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE client_account_id IN (SELECT get_client_account_ids())
    ))
  );

DROP POLICY IF EXISTS "order_items_insert_client" ON public.order_items;
CREATE POLICY "order_items_insert_client" ON public.order_items
  FOR INSERT WITH CHECK (
    is_admin() OR has_write_role() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE ordered_by = auth.uid() AND status IN ('open_prep','open')
    ))
  );

DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
CREATE POLICY "order_items_update" ON public.order_items
  FOR UPDATE USING (
    is_admin() OR has_write_role() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE ordered_by = auth.uid() AND status IN ('open_prep','open')
    ))
  );

DROP POLICY IF EXISTS "order_items_delete_client" ON public.order_items;
CREATE POLICY "order_items_delete_client" ON public.order_items
  FOR DELETE USING (
    is_admin() OR
    (is_client() AND order_id IN (
      SELECT id FROM public.orders
      WHERE ordered_by = auth.uid() AND status IN ('open_prep','open')
    ))
  );
