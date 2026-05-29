-- ====================================================
-- PUBLIC HOLIDAYS SEED — Ireland (IE) + N. Ireland (GB-NIR)
-- Run in Supabase SQL Editor after order_portal_setup.sql
-- ====================================================

-- Republic of Ireland 2025-2026
INSERT INTO public.public_holidays (date, name, region) VALUES
  ('2025-01-01', 'New Year''s Day', 'IE'),
  ('2025-02-03', 'St. Brigid''s Day', 'IE'),
  ('2025-03-17', 'St. Patrick''s Day', 'IE'),
  ('2025-04-21', 'Easter Monday', 'IE'),
  ('2025-05-05', 'May Bank Holiday', 'IE'),
  ('2025-06-02', 'June Bank Holiday', 'IE'),
  ('2025-08-04', 'August Bank Holiday', 'IE'),
  ('2025-10-27', 'October Bank Holiday', 'IE'),
  ('2025-12-25', 'Christmas Day', 'IE'),
  ('2025-12-26', 'St. Stephen''s Day', 'IE'),
  ('2026-01-01', 'New Year''s Day', 'IE'),
  ('2026-02-02', 'St. Brigid''s Day', 'IE'),
  ('2026-03-17', 'St. Patrick''s Day', 'IE'),
  ('2026-04-06', 'Easter Monday', 'IE'),
  ('2026-05-04', 'May Bank Holiday', 'IE'),
  ('2026-06-01', 'June Bank Holiday', 'IE'),
  ('2026-08-03', 'August Bank Holiday', 'IE'),
  ('2026-10-26', 'October Bank Holiday', 'IE'),
  ('2026-12-25', 'Christmas Day', 'IE'),
  ('2026-12-26', 'St. Stephen''s Day', 'IE')
ON CONFLICT (date, region, name) DO NOTHING;

-- Northern Ireland / UK 2025-2026
INSERT INTO public.public_holidays (date, name, region) VALUES
  ('2025-01-01', 'New Year''s Day', 'GB-NIR'),
  ('2025-03-17', 'St. Patrick''s Day', 'GB-NIR'),
  ('2025-04-18', 'Good Friday', 'GB-NIR'),
  ('2025-04-21', 'Easter Monday', 'GB-NIR'),
  ('2025-05-05', 'Early May Bank Holiday', 'GB-NIR'),
  ('2025-05-26', 'Spring Bank Holiday', 'GB-NIR'),
  ('2025-07-14', 'Battle of the Boyne (Orangemen''s Day)', 'GB-NIR'),
  ('2025-08-25', 'Summer Bank Holiday', 'GB-NIR'),
  ('2025-12-25', 'Christmas Day', 'GB-NIR'),
  ('2025-12-26', 'Boxing Day', 'GB-NIR'),
  ('2026-01-01', 'New Year''s Day', 'GB-NIR'),
  ('2026-03-17', 'St. Patrick''s Day', 'GB-NIR'),
  ('2026-04-03', 'Good Friday', 'GB-NIR'),
  ('2026-04-06', 'Easter Monday', 'GB-NIR'),
  ('2026-05-04', 'Early May Bank Holiday', 'GB-NIR'),
  ('2026-05-25', 'Spring Bank Holiday', 'GB-NIR'),
  ('2026-07-13', 'Battle of the Boyne (Orangemen''s Day)', 'GB-NIR'),
  ('2026-08-31', 'Summer Bank Holiday', 'GB-NIR'),
  ('2026-12-25', 'Christmas Day', 'GB-NIR'),
  ('2026-12-26', 'Boxing Day', 'GB-NIR')
ON CONFLICT (date, region, name) DO NOTHING;
