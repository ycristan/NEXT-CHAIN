-- ============================================================
-- Performance indexes for the brands table
-- Covers all columns used in ORDER BY, WHERE, and JOIN
-- operations performed by the Inventory module.
-- ============================================================

-- Primary sort column (used in every loadAll query)
CREATE INDEX IF NOT EXISTS idx_brands_brand_name
  ON public.brands (brand_name);

-- Status filter (is_active tab split + filter combo)
CREATE INDEX IF NOT EXISTS idx_brands_is_active
  ON public.brands (is_active);

-- Header filter columns
CREATE INDEX IF NOT EXISTS idx_brands_brand_code
  ON public.brands (brand_code);

CREATE INDEX IF NOT EXISTS idx_brands_category_id
  ON public.brands (category_id);

CREATE INDEX IF NOT EXISTS idx_brands_category1_id
  ON public.brands (category1_id);

CREATE INDEX IF NOT EXISTS idx_brands_sku_type_id
  ON public.brands (sku_type_id);

CREATE INDEX IF NOT EXISTS idx_brands_bpu
  ON public.brands (bpu);

-- Composite: most common access pattern (active brands sorted by name)
CREATE INDEX IF NOT EXISTS idx_brands_active_name
  ON public.brands (is_active, brand_name);
