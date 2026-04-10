-- =============================================
-- NEXT CHAIN - Warehouse Manager
-- Script de configuracao do banco de dados
-- Execute no SQL Editor do Supabase
-- =============================================

-- Habilitar extensao UUID
create extension if not exists "uuid-ossp";

-- Tabela de perfis de usuarios
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null default 'viewer' check (role in ('admin', 'manager', 'operator', 'viewer')),
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de categorias
create table if not exists categories (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Tabela de fornecedores
create table if not exists suppliers (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de produtos
create table if not exists products (
  id uuid default uuid_generate_v4() primary key,
  sku text not null unique,
  name text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  unit text not null default 'un',
  unit_cost numeric(10,2) not null default 0,
  min_stock integer not null default 0,
  current_stock integer not null default 0,
  location text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de movimentacoes de estoque
create table if not exists stock_movements (
  id uuid default uuid_generate_v4() primary key,
  product_id uuid references products(id) on delete cascade not null,
  type text not null check (type in ('entry', 'exit', 'adjustment', 'transfer')),
  quantity integer not null,
  unit_cost numeric(10,2),
  reason text,
  reference_number text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- =============================================
-- TRIGGERS
-- =============================================

-- Cria perfil automaticamente ao criar usuario
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'viewer'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Atualiza updated_at automaticamente
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at before update on products for each row execute procedure update_updated_at();
create trigger suppliers_updated_at before update on suppliers for each row execute procedure update_updated_at();
create trigger profiles_updated_at before update on profiles for each row execute procedure update_updated_at();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

alter table profiles enable row level security;
alter table categories enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;

-- Profiles: usuario ve e edita apenas o proprio perfil; admin ve todos
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles" on profiles for select using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "Admins can update all profiles" on profiles for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Categories: todos autenticados podem ler; apenas admin/manager podem escrever
create policy "Authenticated can read categories" on categories for select to authenticated using (true);
create policy "Managers can manage categories" on categories for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

-- Suppliers: mesma logica de categories
create policy "Authenticated can read suppliers" on suppliers for select to authenticated using (true);
create policy "Managers can manage suppliers" on suppliers for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

-- Products: todos autenticados podem ler; admin/manager/operator podem escrever
create policy "Authenticated can read products" on products for select to authenticated using (true);
create policy "Managers can manage products" on products for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);
create policy "Operators can update stock" on products for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'operator')
);

-- Stock movements: todos autenticados podem ler; admin/manager/operator podem criar
create policy "Authenticated can read movements" on stock_movements for select to authenticated using (true);
create policy "Operators can create movements" on stock_movements for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager', 'operator'))
);

-- =============================================
-- DADOS INICIAIS DE EXEMPLO (opcional)
-- =============================================

insert into categories (name, description) values
  ('Eletrônicos', 'Equipamentos eletrônicos e componentes'),
  ('Ferramentas', 'Ferramentas manuais e elétricas'),
  ('Materiais de Escritório', 'Papelaria e suprimentos de escritório'),
  ('Limpeza', 'Produtos de limpeza e higiene')
on conflict do nothing;
