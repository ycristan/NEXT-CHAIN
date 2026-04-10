-- ============================================================
-- FIX: Recursive RLS policy on profiles table
--
-- The original "Admins can view all profiles" policy queries
-- the profiles table from WITHIN a profiles policy, causing
-- infinite recursion. PostgreSQL aborts the query entirely,
-- returning null — so profile never loads in the app.
--
-- Solution: use a SECURITY DEFINER function that bypasses RLS
-- when checking admin role, breaking the recursion.
-- ============================================================

-- Step 1: Drop the broken recursive policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Step 2: Create a security definer function to safely check admin role
-- (SECURITY DEFINER bypasses RLS on its internal query, preventing recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Step 3: Re-create admin policies using the safe function
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());
