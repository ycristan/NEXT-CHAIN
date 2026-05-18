-- ============================================================
-- Enable Supabase Realtime for the brands table
-- ============================================================
-- Run in Supabase SQL Editor BEFORE deploying the frontend fix.
-- Safe to re-run.
-- ============================================================

-- 1. REPLICA IDENTITY FULL ensures UPDATE/DELETE payloads include
--    the full old row (consistent with other realtime tables).
ALTER TABLE public.brands REPLICA IDENTITY FULL;

-- 2. Add brands to the realtime publication.
ALTER PUBLICATION supabase_realtime ADD TABLE public.brands;

-- 3. Verify — brands should now appear alongside slots, racks, etc.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
