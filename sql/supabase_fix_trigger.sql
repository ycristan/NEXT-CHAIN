-- =============================================
-- FIX: Corrige o trigger de criacao de usuarios
-- Execute no SQL Editor do Supabase
-- =============================================

-- Remove trigger e funcao antigos se existirem
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

-- Recria a funcao com tratamento de erro e permissoes corretas
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Garante que o trigger pode chamar a funcao
grant execute on function handle_new_user() to supabase_auth_admin;

-- Recria o trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Garante permissoes na tabela profiles para o auth
grant all on public.profiles to supabase_auth_admin;
grant all on public.profiles to service_role;
