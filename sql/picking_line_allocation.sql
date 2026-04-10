-- ============================================================
-- Picking Line: Allocation Rules
-- ============================================================
-- Prerequisites: picking_line_racks_slots.sql must have been run.
--
-- NOTE: allocated_brand_id and light_address already exist on
-- the slots table (created in picking_line_racks_slots.sql).
-- This script only adds:
--   1. Uniqueness trigger: one brand per rack_type across all racks
--   2. Index to support the trigger lookup efficiently
-- ============================================================

-- ── Safety: drop previous version if re-running ────────────
DROP TRIGGER  IF EXISTS slots_check_brand_uniqueness ON public.slots;
DROP FUNCTION IF EXISTS public.check_brand_unique_per_rack_type();

-- ============================================================
-- FUNCTION: check_brand_unique_per_rack_type
-- Raises an exception if the same brand is already allocated
-- to ANY slot in ANY rack that shares the same rack_type_id.
--
-- Logic:
--   NEW.allocated_brand_id → find NEW.rack_id → get rack_type_id
--   → count slots in OTHER racks of same type with same brand_id
--   → if count > 0, reject
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_brand_unique_per_rack_type()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_rack_type_id  UUID;
  v_conflict_rack TEXT;
  v_conflict_bin  TEXT;
BEGIN
  -- Only enforce when a brand is being assigned (not on unallocation)
  IF NEW.allocated_brand_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the rack_type of the target rack
  SELECT rack_type_id INTO v_rack_type_id
  FROM public.racks
  WHERE id = NEW.rack_id;

  -- If the rack has no type, skip the check (untyped racks are unrestricted)
  IF v_rack_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look for the same brand in any other slot of a rack with the same type
  -- (exclude the current slot row on UPDATE via s.id != NEW.id)
  SELECT r.name, s.bin_address
  INTO   v_conflict_rack, v_conflict_bin
  FROM   public.slots s
  JOIN   public.racks r ON r.id = s.rack_id
  WHERE  s.allocated_brand_id = NEW.allocated_brand_id
    AND  r.rack_type_id       = v_rack_type_id
    AND  s.id                != NEW.id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Brand already allocated to slot % in rack % (same rack type). Each brand may occupy only one slot per rack type.',
      v_conflict_bin, v_conflict_rack
      USING ERRCODE = '23505';  -- unique_violation — client can catch this code
  END IF;

  RETURN NEW;
END;
$$;

-- Fires before any INSERT or brand-field UPDATE on slots
CREATE TRIGGER slots_check_brand_uniqueness
  BEFORE INSERT OR UPDATE OF allocated_brand_id
  ON public.slots
  FOR EACH ROW EXECUTE FUNCTION public.check_brand_unique_per_rack_type();

-- ── Supporting index ────────────────────────────────────────
-- Speeds up the trigger lookup (already created in base script,
-- listed here for documentation completeness)
-- CREATE INDEX idx_slots_allocated ON public.slots (allocated_brand_id);
-- ← already exists; do NOT re-create.

-- ============================================================
-- GRANT / RLS note
-- The trigger runs with SECURITY INVOKER (default), so it
-- respects existing RLS. Allocation INSERT/UPDATE is already
-- permitted for authenticated users via slots_update policy.
-- ============================================================
