-- ============================================================
-- FIX CRIT-A: Create has_write_role() SECURITY DEFINER helper.
--
-- The slots_update policy in fix_slots_racks_update_rls.sql
-- originally used EXISTS (SELECT 1 FROM public.profiles ...)
-- directly inside the policy — the same recursion pattern
-- fixed in CRIT-2 (admin_notifications). Since public.profiles
-- has RLS enabled, a direct subquery inside any policy on
-- another table can trigger infinite recursion.
--
-- This function mirrors is_admin() but checks for operator,
-- manager, or admin roles — allowing slot updates by all
-- write-capable roles without triggering RLS recursion.
--
-- Run fix_slots_racks_update_rls.sql AFTER this file.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_write_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('operator', 'manager', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_write_role() TO authenticated;
