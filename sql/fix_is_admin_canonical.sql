-- ============================================================
-- FIX CRIT-1: Consolidate is_admin() to always use lower()
--
-- Replaces both definitions with a single canonical version.
-- The previous version in fix_profiles_rls_recursion.sql used
-- role = 'admin' (case-sensitive), which silently denied access
-- to admins with role stored as 'Admin' or 'ADMIN'.
-- ============================================================

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
