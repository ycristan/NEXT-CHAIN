-- ============================================================
-- Enable Supabase Realtime for WMS tables
-- ============================================================
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to re-run.
-- ============================================================

-- 1. REPLICA IDENTITY FULL ensures UPDATE and DELETE payloads include
--    the full old row (needed for surgical state updates on the frontend).
ALTER TABLE public.slots           REPLICA IDENTITY FULL;
ALTER TABLE public.racks           REPLICA IDENTITY FULL;
ALTER TABLE public.fridge_items    REPLICA IDENTITY FULL;
ALTER TABLE public.replanning_slots REPLICA IDENTITY FULL;

-- 2. Add tables to the supabase_realtime publication.
--    If the publication doesn't exist yet, create it first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE
      public.slots, public.racks, public.fridge_items, public.replanning_slots;
  ELSE
    -- Publication already exists — add any missing tables
    ALTER PUBLICATION supabase_realtime ADD TABLE public.slots;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.racks;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fridge_items;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.replanning_slots;
  END IF;
END $$;

-- 3. Verify — should list the four tables above
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
