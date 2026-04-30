-- ============================================================
-- FIX CRIT-4: Restrict UPDATE policies on slots and racks.
--
-- Previous policies used USING (true), allowing any
-- authenticated user (including viewers) to UPDATE any slot
-- or rack directly via the Supabase client.
--
-- New rules:
--   slots UPDATE  → operator, manager, or admin
--   racks UPDATE  → manager or admin only
-- ============================================================

-- ── slots ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "slots_update" ON public.slots;

CREATE POLICY "slots_update"
  ON public.slots FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND lower(role) IN ('operator', 'manager', 'admin')
    )
  );

-- ── racks ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "racks_update" ON public.racks;

CREATE POLICY "racks_update"
  ON public.racks FOR UPDATE
  TO authenticated
  USING (public.is_admin());
