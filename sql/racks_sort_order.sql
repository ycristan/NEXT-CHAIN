-- ============================================================
-- Racks: add sort_order for custom sidebar ordering
-- ============================================================
-- Prerequisites: picking_line_racks_slots.sql
-- Safe to re-run (IF NOT EXISTS / idempotent UPDATE).
-- ============================================================

-- 1. Add column (nullable first so we can fill it)
ALTER TABLE public.racks
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 2. Seed initial values ordered by numeric rack name
--    (each rack gets a unique integer; racks with non-numeric
--    names fall back to alphabetical via NULLIF cast)
UPDATE public.racks
SET sort_order = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY (NULLIF(regexp_replace(name, '\D','','g'), '')::integer) NULLS LAST,
                    name
         ) AS rn
  FROM public.racks
) sub
WHERE public.racks.id = sub.id;

-- 3. Now make it NOT NULL with default 0
ALTER TABLE public.racks ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.racks ALTER COLUMN sort_order SET DEFAULT 0;

-- 4. Index for fast ORDER BY sort_order
CREATE INDEX IF NOT EXISTS idx_racks_sort_order ON public.racks (sort_order);
