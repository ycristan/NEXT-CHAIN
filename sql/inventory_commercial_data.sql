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

-- ─── Helper: is_admin_or_manager() ─────────────────────────────────────────
-- SECURITY DEFINER avoids RLS recursion when checking profiles in policies.
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) IN ('admin', 'manager')
  );
$$;

ALTER TABLE public.brand_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_barcodes_select" ON public.brand_barcodes;
CREATE POLICY "brand_barcodes_select"
  ON public.brand_barcodes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "brand_barcodes_insert" ON public.brand_barcodes;
CREATE POLICY "brand_barcodes_insert"
  ON public.brand_barcodes FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_manager());

DROP POLICY IF EXISTS "brand_barcodes_delete" ON public.brand_barcodes;
CREATE POLICY "brand_barcodes_delete"
  ON public.brand_barcodes FOR DELETE
  TO authenticated
  USING (is_admin_or_manager());

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
