-- ════════════════════════════════════════════════════════════════
-- replanning_slots.sql
-- Draft workspace for Picking Line replanning (admin-only).
-- Mirror of `slots` — starts empty (no brands, no lights, no expansion).
-- ════════════════════════════════════════════════════════════════

-- ── Table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.replanning_slots (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rack_id             UUID        NOT NULL REFERENCES public.racks(id) ON DELETE CASCADE,
  column_letter       TEXT        NOT NULL,
  row_number          INTEGER     NOT NULL,
  bin_address         TEXT        NOT NULL,
  allocated_brand_id  UUID        REFERENCES public.brands(id) ON DELETE SET NULL,
  light_address       TEXT,
  light_status        TEXT        NOT NULL DEFAULT 'off'
                        CHECK (light_status IN ('off', 'on', 'blink')),
  slot_state          TEXT        NOT NULL DEFAULT 'empty'
                        CHECK (slot_state IN ('empty', 'brand_allocated', 'expansion_reserved')),
  expansion_direction TEXT
                        CHECK (expansion_direction IN ('above', 'below', 'left', 'right')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (rack_id, column_letter, row_number)
);

-- ── Cross-column constraints (mirrors slots table) ───────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rps_expansion_no_brand') THEN
    ALTER TABLE public.replanning_slots ADD CONSTRAINT rps_expansion_no_brand
      CHECK (NOT (slot_state = 'expansion_reserved' AND allocated_brand_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rps_allocated_has_brand') THEN
    ALTER TABLE public.replanning_slots ADD CONSTRAINT rps_allocated_has_brand
      CHECK (NOT (slot_state = 'brand_allocated' AND allocated_brand_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rps_direction_only_expansion') THEN
    ALTER TABLE public.replanning_slots ADD CONSTRAINT rps_direction_only_expansion
      CHECK (NOT (expansion_direction IS NOT NULL AND slot_state <> 'expansion_reserved'));
  END IF;
END $$;

-- ── Trigger: auto-derive slot_state (mirrors sync_slot_state) ───
CREATE OR REPLACE FUNCTION public.sync_replanning_slot_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Reject brand on an expansion slot
  IF NEW.slot_state = 'expansion_reserved' AND NEW.allocated_brand_id IS NOT NULL THEN
    RAISE EXCEPTION 'expansion_reserved slot cannot have a brand'
      USING ERRCODE = '23514';
  END IF;

  -- Derive state from brand presence
  IF NEW.allocated_brand_id IS NOT NULL THEN
    NEW.slot_state := 'brand_allocated';
  ELSIF NEW.slot_state <> 'expansion_reserved' THEN
    NEW.slot_state := 'empty';
    NEW.expansion_direction := NULL;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_replanning_slot_state ON public.replanning_slots;
CREATE TRIGGER trg_sync_replanning_slot_state
  BEFORE INSERT OR UPDATE ON public.replanning_slots
  FOR EACH ROW EXECUTE FUNCTION public.sync_replanning_slot_state();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.replanning_slots ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read drafts (view-only for non-admins)
DROP POLICY IF EXISTS "rps: authenticated read" ON public.replanning_slots;
CREATE POLICY "rps: authenticated read"
  ON public.replanning_slots FOR SELECT
  TO authenticated
  USING (true);

-- Write operations: admins only (uses is_admin() SECURITY DEFINER)
DROP POLICY IF EXISTS "rps: admin insert" ON public.replanning_slots;
CREATE POLICY "rps: admin insert"
  ON public.replanning_slots FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "rps: admin update" ON public.replanning_slots;
CREATE POLICY "rps: admin update"
  ON public.replanning_slots FOR UPDATE
  TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "rps: admin delete" ON public.replanning_slots;
CREATE POLICY "rps: admin delete"
  ON public.replanning_slots FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ── Index for fast rack lookups ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_replanning_slots_rack_id ON public.replanning_slots (rack_id);
