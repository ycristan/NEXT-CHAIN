-- ============================================================
-- FIX CRIT-4: Restrict UPDATE policies on slots and racks.
--
-- Previous policies used USING (true), allowing any
-- authenticated user (including viewers) to UPDATE any slot
-- or rack directly via the Supabase client.
--
-- New rules:
--   slots UPDATE  → operator, manager, or admin
--   racks UPDATE  → admin only
--
-- PREREQUISITE: run fix_has_write_role.sql first.
-- slots_update uses has_write_role() (SECURITY DEFINER) to
-- avoid RLS recursion — same pattern as is_admin() for CRIT-2.
-- ============================================================

-- ── slots ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "slots_update" ON public.slots;

CREATE POLICY "slots_update"
  ON public.slots FOR UPDATE
  TO authenticated
  USING (public.has_write_role());

-- ── racks ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "racks_update" ON public.racks;

CREATE POLICY "racks_update"
  ON public.racks FOR UPDATE
  TO authenticated
  USING (public.is_admin());
