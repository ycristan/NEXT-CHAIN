-- ============================================================
-- FIX CRIT-3: Restrict Storage bucket 'brands' write/delete
-- to admin users only.
--
-- Previous policies allowed any authenticated user to INSERT,
-- UPDATE, or DELETE objects in the 'brands' bucket, enabling
-- any viewer/operator to overwrite or delete brand images.
-- ============================================================

-- ── Drop existing permissive write/delete policies ─────────
-- (Names may vary depending on how they were created via Dashboard.
--  The DROP IF EXISTS is safe to run even if names differ.)

DROP POLICY IF EXISTS "Allow authenticated uploads"         ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes"         ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates"         ON storage.objects;
DROP POLICY IF EXISTS "items_images_storage_insert"         ON storage.objects;
DROP POLICY IF EXISTS "items_images_storage_delete"         ON storage.objects;
DROP POLICY IF EXISTS "items_images_storage_update"         ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_insert"               ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_delete"               ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_update"               ON storage.objects;

-- ── SELECT: any authenticated user can read images ─────────
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "brands_storage_select"     ON storage.objects;

CREATE POLICY "brands_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'brands');

-- ── INSERT: admin only ──────────────────────────────────────
CREATE POLICY "brands_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brands' AND public.is_admin());

-- ── UPDATE: admin only ──────────────────────────────────────
-- WITH CHECK is required for UPDATE: USING filters which rows are
-- eligible; WITH CHECK ensures the row state after the update also
-- satisfies the rule (prevents moving an object to another bucket).
CREATE POLICY "brands_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING     (bucket_id = 'brands' AND public.is_admin())
  WITH CHECK (bucket_id = 'brands' AND public.is_admin());

-- ── DELETE: admin only ──────────────────────────────────────
CREATE POLICY "brands_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'brands' AND public.is_admin());
