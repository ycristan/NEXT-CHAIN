-- ============================================================
-- Picking Line: Racks & Slots — Schema v3
-- ============================================================
-- Drops and recreates racks/slots with the new Picking Line
-- requirements. rack_allowed_categories is a new junction table.
--
-- Prerequisites (must have been run first):
--   1. supabase_v2_migration.sql  (rack_types, categories, update_updated_at())
--   2. supabase_brands_migration.sql (brands table)
--   3. fix_profiles_rls_recursion.sql (is_admin() function)
--
-- If is_admin() doesn't exist yet, this script creates it.
-- ============================================================

-- ── Safety: ensure is_admin() exists ──────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(role) = 'admin'
  );
$$;

-- ── Drop old tables (order matters due to FK constraints) ──
DROP TABLE IF EXISTS public.slots                   CASCADE;
DROP TABLE IF EXISTS public.rack_allowed_categories CASCADE;
DROP TABLE IF EXISTS public.racks                   CASCADE;

-- ── Drop old triggers/functions that may conflict ──────────
DROP FUNCTION IF EXISTS public.set_slot_bin_address()        CASCADE;
DROP FUNCTION IF EXISTS public.cascade_rack_name_to_slots()  CASCADE;
DROP FUNCTION IF EXISTS public.compute_bin_address(UUID, TEXT, INTEGER) CASCADE;

-- ============================================================
-- TABLE: racks
-- ============================================================
CREATE TABLE public.racks (
  id                UUID      DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- 1-2 digit numeric name, e.g. "1", "40", "99"
  -- Used as the prefix in bin_address: "40 A01"
  name              TEXT      NOT NULL UNIQUE,

  rack_type_id      UUID      REFERENCES public.rack_types(id) ON DELETE SET NULL,

  -- Physical dimensions
  columns           INTEGER   NOT NULL DEFAULT 1 CHECK (columns  > 0),
  rows              INTEGER   NOT NULL DEFAULT 1 CHECK (rows     > 0),

  -- Picking positions (NULL = not applicable for that mode)
  solo_picking_pos  INTEGER   CHECK (solo_picking_pos  IS NULL OR solo_picking_pos  > 0),
  combo_picking_pos INTEGER   CHECK (combo_picking_pos IS NULL OR combo_picking_pos > 0),

  active            BOOLEAN   NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT racks_name_numeric CHECK (name ~ '^\d{1,2}$')
);

-- ============================================================
-- TABLE: rack_allowed_categories
-- Junction table: which item categories are allowed in a rack
-- ============================================================
CREATE TABLE public.rack_allowed_categories (
  rack_id     UUID NOT NULL REFERENCES public.racks(id)      ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (rack_id, category_id)
);

-- ============================================================
-- TABLE: slots
-- One row per physical slot in a rack
-- bin_address is auto-computed: "<rack_name> <col><row_padded>"
-- Example: rack "40", column "A", row 1  →  "40 A01"
-- ============================================================
CREATE TABLE public.slots (
  id                 UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  rack_id            UUID    NOT NULL REFERENCES public.racks(id) ON DELETE CASCADE,

  column_letter      TEXT    NOT NULL CHECK (column_letter ~ '^[A-Z]$'),
  row_number         INTEGER NOT NULL CHECK (row_number > 0),

  -- Auto-computed by trigger — do NOT set manually
  bin_address        TEXT    NOT NULL DEFAULT '',

  -- Item currently allocated to this slot
  allocated_brand_id UUID    REFERENCES public.brands(id) ON DELETE SET NULL,

  -- Light system integration
  light_address      TEXT,
  light_status       TEXT    NOT NULL DEFAULT 'off'
                             CHECK (light_status IN ('off', 'on', 'blink')),

  is_refill          BOOLEAN NOT NULL DEFAULT false,

  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),

  -- A rack cannot have two slots in the same position
  UNIQUE (rack_id, column_letter, row_number)
);

-- ============================================================
-- bin_address computation
-- Format: "<rack.name> <column_letter><LPAD(row_number, 2, '0')>"
-- Example: "40 A01", "40 B12"
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_slot_bin_address()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_rack_name TEXT;
BEGIN
  SELECT name INTO v_rack_name FROM public.racks WHERE id = NEW.rack_id;
  NEW.bin_address := v_rack_name || ' ' || NEW.column_letter || LPAD(NEW.row_number::TEXT, 2, '0');
  RETURN NEW;
END;
$$;

-- Fires on every INSERT and on UPDATE of the three address-related columns
CREATE TRIGGER slots_set_bin_address
  BEFORE INSERT OR UPDATE OF rack_id, column_letter, row_number
  ON public.slots
  FOR EACH ROW EXECUTE FUNCTION public.set_slot_bin_address();

-- When a rack is renamed, cascade the update to all its slots
CREATE OR REPLACE FUNCTION public.cascade_rack_rename_to_slots()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.slots
    SET bin_address = NEW.name || ' ' || column_letter || LPAD(row_number::TEXT, 2, '0')
    WHERE rack_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER racks_cascade_rename
  AFTER UPDATE OF name ON public.racks
  FOR EACH ROW EXECUTE FUNCTION public.cascade_rack_rename_to_slots();

-- ============================================================
-- updated_at triggers
-- (update_updated_at() function already exists from v2 migration)
-- ============================================================

CREATE TRIGGER racks_updated_at
  BEFORE UPDATE ON public.racks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER slots_updated_at
  BEFORE UPDATE ON public.slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- SELECT + UPDATE → any authenticated user
-- INSERT + DELETE → admin only  (uses is_admin() to avoid recursion)
-- ============================================================

-- ── racks ──────────────────────────────────────────────────
ALTER TABLE public.racks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "racks_select"
  ON public.racks FOR SELECT TO authenticated USING (true);

CREATE POLICY "racks_insert_admin"
  ON public.racks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "racks_update"
  ON public.racks FOR UPDATE TO authenticated USING (true);

CREATE POLICY "racks_delete_admin"
  ON public.racks FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── rack_allowed_categories ────────────────────────────────
ALTER TABLE public.rack_allowed_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rack_cats_select"
  ON public.rack_allowed_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "rack_cats_insert_admin"
  ON public.rack_allowed_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "rack_cats_delete_admin"
  ON public.rack_allowed_categories FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── slots ───────────────────────────────────────────────────
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slots_select"
  ON public.slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "slots_insert_admin"
  ON public.slots FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "slots_update"
  ON public.slots FOR UPDATE TO authenticated USING (true);

CREATE POLICY "slots_delete_admin"
  ON public.slots FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- Performance indexes
-- ============================================================

CREATE INDEX idx_racks_rack_type_id  ON public.racks (rack_type_id);
CREATE INDEX idx_racks_active        ON public.racks (active);
CREATE INDEX idx_racks_name          ON public.racks (name);

CREATE INDEX idx_rack_cats_rack_id   ON public.rack_allowed_categories (rack_id);
CREATE INDEX idx_rack_cats_cat_id    ON public.rack_allowed_categories (category_id);

CREATE INDEX idx_slots_rack_id       ON public.slots (rack_id);
CREATE INDEX idx_slots_bin_address   ON public.slots (bin_address);
CREATE INDEX idx_slots_allocated     ON public.slots (allocated_brand_id);

-- ============================================================
-- Smoke test (optional — safe to run, rolls back on failure)
-- Verifies trigger computes bin_address correctly.
-- ============================================================
-- DO $$
-- DECLARE
--   v_rack_id UUID;
--   v_bin     TEXT;
-- BEGIN
--   INSERT INTO public.racks (name, columns, rows) VALUES ('40', 3, 5)
--   RETURNING id INTO v_rack_id;
--
--   INSERT INTO public.slots (rack_id, column_letter, row_number)
--   VALUES (v_rack_id, 'A', 1);
--
--   SELECT bin_address INTO v_bin FROM public.slots
--   WHERE rack_id = v_rack_id AND column_letter = 'A' AND row_number = 1;
--
--   ASSERT v_bin = '40 A01', 'bin_address mismatch: ' || v_bin;
--
--   ROLLBACK;
-- END $$;
