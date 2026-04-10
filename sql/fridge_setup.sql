-- ============================================================
-- Fridge Module — Schema Setup
-- ============================================================
-- Tables:
--   fridge_allowed_categories  — which Category 1 ids are allowed
--   fridge_items               — brand allocations (one per brand)
--
-- Prerequisites (must have been run first):
--   1. supabase_v2_migration.sql      (categories table)
--   2. supabase_brands_migration.sql  (brands table)
--   3. fix_profiles_rls_recursion.sql (is_admin() function)
-- ============================================================

-- ── Safety: idempotent re-runs ─────────────────────────────
-- DROP TABLE CASCADE removes dependent triggers automatically
DROP TABLE    IF EXISTS public.fridge_items                CASCADE;
DROP TABLE    IF EXISTS public.fridge_allowed_categories   CASCADE;
DROP FUNCTION IF EXISTS public.check_fridge_category();

-- ============================================================
-- TABLE: fridge_allowed_categories
-- Controls which Category 1 (category1_id on brands) values
-- are permitted for Fridge allocation.
-- ============================================================
CREATE TABLE public.fridge_allowed_categories (
  id           UUID      DEFAULT uuid_generate_v4() PRIMARY KEY,
  category1_id UUID      NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT fridge_allowed_categories_unique UNIQUE (category1_id)
);

-- RLS
ALTER TABLE public.fridge_allowed_categories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read allowed categories
CREATE POLICY "fridge_allowed_categories_select"
  ON public.fridge_allowed_categories FOR SELECT
  TO authenticated USING (true);

-- Only admins can manage the allow-list
CREATE POLICY "fridge_allowed_categories_insert"
  ON public.fridge_allowed_categories FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "fridge_allowed_categories_delete"
  ON public.fridge_allowed_categories FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- TABLE: fridge_items
-- Each row = one brand allocated to the Fridge.
-- bin_address is always 'Fridge' — expressed as a generated column.
-- ============================================================
CREATE TABLE public.fridge_items (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand_id     UUID        NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bin_address  TEXT        GENERATED ALWAYS AS ('Fridge') STORED,

  -- A brand may appear in the Fridge only once
  CONSTRAINT fridge_items_brand_unique UNIQUE (brand_id)
);

-- Index for fast brand lookups
CREATE INDEX idx_fridge_items_brand ON public.fridge_items (brand_id);

-- RLS
ALTER TABLE public.fridge_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read fridge contents
CREATE POLICY "fridge_items_select"
  ON public.fridge_items FOR SELECT
  TO authenticated USING (true);

-- Any authenticated user can allocate a brand to the Fridge
-- (category validation is enforced by the trigger below)
CREATE POLICY "fridge_items_insert"
  ON public.fridge_items FOR INSERT
  TO authenticated WITH CHECK (true);

-- Only admins can remove items from the Fridge
CREATE POLICY "fridge_items_delete"
  ON public.fridge_items FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- FUNCTION + TRIGGER: check_fridge_category
-- Rejects allocation when the brand's category1_id is not
-- in the fridge_allowed_categories allow-list.
-- Runs only when the allow-list is non-empty; if no rows exist
-- in fridge_allowed_categories the fridge is unrestricted.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_fridge_category()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_category1_id UUID;
  v_category_name TEXT;
  v_allow_count   INT;
BEGIN
  -- How many categories are configured for the Fridge?
  SELECT COUNT(*) INTO v_allow_count FROM public.fridge_allowed_categories;

  -- If the allow-list is empty, skip validation (unrestricted mode)
  IF v_allow_count = 0 THEN
    RETURN NEW;
  END IF;

  -- Fetch the brand's Category 1
  SELECT category1_id INTO v_category1_id
  FROM   public.brands
  WHERE  id = NEW.brand_id;

  -- Confirm that Category 1 is in the allow-list
  IF NOT EXISTS (
    SELECT 1 FROM public.fridge_allowed_categories
    WHERE  category1_id = v_category1_id
  ) THEN
    SELECT name INTO v_category_name
    FROM   public.categories
    WHERE  id = v_category1_id;

    RAISE EXCEPTION
      'Brand category "%" (%) is not authorised for Fridge allocation.',
      COALESCE(v_category_name, 'unknown'), v_category1_id
      USING ERRCODE = '23514';  -- check_violation — client can catch this code
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fridge_items_enforce_category
  BEFORE INSERT ON public.fridge_items
  FOR EACH ROW EXECUTE FUNCTION public.check_fridge_category();

-- ============================================================
-- Convenience view: fridge_items with brand & category details
-- ============================================================
CREATE OR REPLACE VIEW public.fridge_items_view AS
SELECT
  fi.id,
  fi.bin_address,
  fi.assigned_at,
  b.id           AS brand_id,
  b.brand_code,
  b.brand_name,
  b.bpu,
  b.image1_url,
  b.notes,
  c.id           AS category_id,
  c.name         AS category_name,
  c1.id          AS category1_id,
  c1.name        AS category1_name
FROM  public.fridge_items  fi
JOIN  public.brands         b  ON b.id  = fi.brand_id
LEFT JOIN public.categories c  ON c.id  = b.category_id
LEFT JOIN public.categories c1 ON c1.id = b.category1_id;

-- Authenticated users can query the view
GRANT SELECT ON public.fridge_items_view TO authenticated;
