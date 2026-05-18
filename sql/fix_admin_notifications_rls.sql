-- ============================================================
-- FIX CRIT-2: Replace direct profiles subquery in
-- admin_notifications RLS with is_admin() SECURITY DEFINER.
--
-- The original SELECT and UPDATE policies query public.profiles
-- directly inside a policy on admin_notifications. Since both
-- tables have RLS enabled, this can trigger infinite recursion
-- (same pattern fixed by fix_profiles_rls_recursion.sql).
-- ============================================================

-- Drop the broken policies
DROP POLICY IF EXISTS "Users see own; admins see all" ON public.admin_notifications;
DROP POLICY IF EXISTS "Admins can update notifications"  ON public.admin_notifications;

-- Re-create SELECT: own rows OR admin
CREATE POLICY "Users see own; admins see all"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_admin()
  );

-- Re-create UPDATE: admin only
CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());
