-- =============================================
-- NEXT CHAIN WMS - Brands Table Migration
-- Run this in Supabase SQL Editor
-- Does NOT affect existing tables
-- =============================================

-- Brands table
create table if not exists brands (
  id            uuid    default uuid_generate_v4() primary key,
  brand_code    text    not null unique,
  brand_name    text    not null,
  is_active     boolean not null default true,
  category_id   uuid    not null references categories(id),
  category1_id  uuid    not null references categories(id),
  sku_type_id   uuid    not null references sku_types(id),
  bpu           integer not null,
  pallet_size   integer,
  image1_url    text,
  image2_url    text,
  image3_url    text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- RLS
alter table brands enable row level security;
create policy "auth_all_brands" on brands
  for all to authenticated using (true) with check (true);

-- updated_at trigger
create trigger brands_updated_at
  before update on brands
  for each row execute procedure update_updated_at();

-- =============================================
-- IMPORTANT: Supabase Storage Setup
-- 1. Go to Storage in your Supabase dashboard
-- 2. Create a new bucket named: brands
-- 3. Set it as PUBLIC
-- 4. That's it — image uploads will work.
-- =============================================
