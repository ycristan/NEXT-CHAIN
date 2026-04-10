-- =============================================
-- NEXT CHAIN WMS - v2 Migration
-- Execute in Supabase SQL Editor
-- Drops old tables, creates new schema
-- Preserves: auth.users, public.profiles
-- =============================================

-- Drop old tables
drop table if exists stock_movements cascade;
drop table if exists products cascade;
drop table if exists suppliers cascade;
drop table if exists slots cascade;
drop table if exists items cascade;
drop table if exists racks cascade;
drop table if exists rack_types cascade;
drop table if exists sku_types cascade;
drop table if exists categories cascade;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- categories (self-referential for parent/child)
create table categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  parent_id uuid references categories(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- sku_types
create table sku_types (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  code text not null,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- rack_types
create table rack_types (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- racks
create table racks (
  id uuid default uuid_generate_v4() primary key,
  rack_type_id uuid references rack_types(id) on delete set null,
  name text not null,
  columns integer not null default 1,
  rows integer not null default 1,
  picking_solo boolean not null default false,
  picking_combo boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- slots
create table slots (
  id uuid default uuid_generate_v4() primary key,
  rack_id uuid references racks(id) on delete cascade not null,
  column_letter text not null,
  row_number integer not null,
  light_address text,
  light_status text not null default 'off',
  is_refill boolean not null default false,
  refill_direction text,
  allocated_item_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- items
create table items (
  id uuid default uuid_generate_v4() primary key,
  sku_type_id uuid references sku_types(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  brand_code text,
  brand_name text not null,
  bup integer not null default 1,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table categories enable row level security;
alter table sku_types enable row level security;
alter table rack_types enable row level security;
alter table racks enable row level security;
alter table slots enable row level security;
alter table items enable row level security;

-- All authenticated users can read/write (simplify for now)
create policy "auth_all_categories" on categories for all to authenticated using (true) with check (true);
create policy "auth_all_sku_types" on sku_types for all to authenticated using (true) with check (true);
create policy "auth_all_rack_types" on rack_types for all to authenticated using (true) with check (true);
create policy "auth_all_racks" on racks for all to authenticated using (true) with check (true);
create policy "auth_all_slots" on slots for all to authenticated using (true) with check (true);
create policy "auth_all_items" on items for all to authenticated using (true) with check (true);

-- updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger categories_updated_at before update on categories for each row execute procedure update_updated_at();
create trigger sku_types_updated_at before update on sku_types for each row execute procedure update_updated_at();
create trigger rack_types_updated_at before update on rack_types for each row execute procedure update_updated_at();
create trigger racks_updated_at before update on racks for each row execute procedure update_updated_at();
create trigger slots_updated_at before update on slots for each row execute procedure update_updated_at();
create trigger items_updated_at before update on items for each row execute procedure update_updated_at();
