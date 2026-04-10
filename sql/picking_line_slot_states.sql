-- ============================================================
-- Picking Line: Slot States & Expansion Direction
-- ============================================================
-- Adds slot_state and expansion_direction to the slots table.
-- Also adds a trigger that keeps state consistent with
-- allocated_brand_id and enforces the expansion rules.
--
-- Prerequisites: picking_line_racks_slots.sql (slots table)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================

-- ── 1. New columns ──────────────────────────────────────────

ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS slot_state TEXT
    NOT NULL DEFAULT 'empty'
    CHECK (slot_state IN ('empty', 'brand_allocated', 'expansion_reserved'));

ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS expansion_direction TEXT
    CHECK (expansion_direction IN ('above', 'below', 'left', 'right'));

-- ── 2. Cross-column CHECK constraints ───────────────────────

-- expansion_reserved slots must NOT have a brand
ALTER TABLE public.slots DROP CONSTRAINT IF EXISTS slots_expansion_no_brand;
ALTER TABLE public.slots
  ADD CONSTRAINT slots_expansion_no_brand CHECK (
    slot_state != 'expansion_reserved' OR allocated_brand_id IS NULL
  );

-- expansion_direction is only meaningful on expansion_reserved slots
ALTER TABLE public.slots DROP CONSTRAINT IF EXISTS slots_direction_only_when_reserved;
ALTER TABLE public.slots
  ADD CONSTRAINT slots_direction_only_when_reserved CHECK (
    slot_state = 'expansion_reserved' OR expansion_direction IS NULL
  );

-- brand_allocated state requires an actual brand
ALTER TABLE public.slots DROP CONSTRAINT IF EXISTS slots_brand_allocated_has_brand;
ALTER TABLE public.slots
  ADD CONSTRAINT slots_brand_allocated_has_brand CHECK (
    slot_state != 'brand_allocated' OR allocated_brand_id IS NOT NULL
  );

-- ── 3. Back-fill existing rows ───────────────────────────────
-- Rows created before this migration have slot_state = 'empty' (default).
-- Correct any that already have a brand assigned.
UPDATE public.slots
SET slot_state = 'brand_allocated'
WHERE allocated_brand_id IS NOT NULL
  AND slot_state = 'empty';

-- ── 4. Trigger: auto-sync slot_state ────────────────────────
-- Keeps slot_state consistent with allocated_brand_id so that
-- application code only needs to SET one field; the trigger
-- derives the state automatically, unless the slot is in
-- 'expansion_reserved' mode (which is set explicitly).
--
-- Rules enforced:
--   a. Cannot assign a brand to an expansion_reserved slot.
--   b. Cannot set state = 'expansion_reserved' while a brand is assigned.
--   c. When state != 'expansion_reserved':
--        allocated_brand_id IS NOT NULL → state becomes 'brand_allocated'
--        allocated_brand_id IS NULL     → state becomes 'empty'
--   d. When state becomes non-expansion, expansion_direction is cleared.

DROP TRIGGER  IF EXISTS slots_sync_state ON public.slots;
DROP FUNCTION IF EXISTS public.sync_slot_state();

CREATE OR REPLACE FUNCTION public.sync_slot_state()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- ── Rule a: brand cannot go on an expansion-reserved slot ──
  IF NEW.slot_state = 'expansion_reserved' AND NEW.allocated_brand_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Slot % is expansion-reserved and cannot hold a brand.',
      NEW.bin_address
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- ── Rule b: expansion_reserved cannot be set while brand exists ──
  IF NEW.slot_state = 'expansion_reserved' AND NEW.allocated_brand_id IS NOT NULL THEN
    -- Already caught above; kept for clarity.
    NULL;
  END IF;

  -- ── Rules c + d: auto-derive state for non-expansion slots ──
  IF NEW.slot_state != 'expansion_reserved' THEN
    IF NEW.allocated_brand_id IS NOT NULL THEN
      NEW.slot_state := 'brand_allocated';
    ELSE
      NEW.slot_state := 'empty';
    END IF;

    -- Clear direction when not in expansion mode
    NEW.expansion_direction := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER slots_sync_state
  BEFORE INSERT OR UPDATE OF allocated_brand_id, slot_state, expansion_direction
  ON public.slots
  FOR EACH ROW EXECUTE FUNCTION public.sync_slot_state();

-- ── 5. Index for state filtering ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_slots_state ON public.slots (slot_state);

-- ── 6. RLS note ─────────────────────────────────────────────
-- No new policies needed.
-- Existing slots_update (any authenticated user) covers state changes.
-- expansion_reserved is a business-level state set by the application.

-- ============================================================
-- State machine summary
-- ============================================================
--
--   empty  ──────────────────────────────────►  brand_allocated
--   (brand_id NULL, direction NULL)             (brand_id NOT NULL)
--        │                                            │
--        │   SET slot_state = 'expansion_reserved'   │  SET allocated_brand_id = NULL
--        ▼         + expansion_direction              ▼
--   expansion_reserved                          empty
--   (brand_id NULL, direction IN               (brand_id NULL, direction NULL)
--    above|below|left|right)
--
-- Transitions:
--   empty           → brand_allocated   : allocateBrandToSlot()
--   brand_allocated → empty             : deallocateSlot()
--   empty           → expansion_reserved: setSlotExpansion()   [future UI]
--   expansion_reserved → empty          : resetSlot()          [future UI]
--
-- ============================================================
