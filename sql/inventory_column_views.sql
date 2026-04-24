-- Inventory Column Views
-- Stores named column visibility configurations per user (private) or for all (public).
-- Any authenticated user can create views. Only admins can delete them.

CREATE TABLE IF NOT EXISTS public.inventory_column_views (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  cols       jsonb       NOT NULL,
  is_public  boolean     NOT NULL DEFAULT false,
  created_by uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Unique name per user (private names) — public views can share names across users but not per creator
CREATE UNIQUE INDEX IF NOT EXISTS inv_col_views_name_user
  ON public.inventory_column_views (name, created_by);

ALTER TABLE public.inventory_column_views ENABLE ROW LEVEL SECURITY;

-- SELECT: own views OR any public view
CREATE POLICY "inv_col_views_select" ON public.inventory_column_views
  FOR SELECT USING (created_by = auth.uid() OR is_public = true);

-- INSERT: any authenticated user (must own the row)
CREATE POLICY "inv_col_views_insert" ON public.inventory_column_views
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- DELETE: admin only
CREATE POLICY "inv_col_views_delete" ON public.inventory_column_views
  FOR DELETE USING (is_admin());
