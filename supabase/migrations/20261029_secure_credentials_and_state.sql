-- ==========================================================================
-- SenaClube — Migração de Segurança: Tabela Privada de Credenciais e RLS
-- Move credenciais administrativas para a tabela privada 'admin_auth'
-- Acesso restrito exclusivamente ao backend autenticado com service_role
-- ==========================================================================

-- 1. Criação da tabela privada de autenticação administrativa
create table if not exists public.admin_auth (
  id text primary key default 'sena_clube_admin_auth',
  username text not null default 'admin',
  password_hash text not null,
  salt text not null,
  token_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 2. Habilita Row Level Security (RLS)
alter table public.admin_auth enable row level security;

-- 3. Apenas o backend autenticado com service_role pode consultar ou alterar credenciais
drop policy if exists "Acesso exclusivo service_role para admin_auth" on public.admin_auth;
create policy "Acesso exclusivo service_role para admin_auth"
  on public.admin_auth
  for all
  to service_role
  using (true)
  with check (true);

-- 4. Migra credenciais pré-existentes de bolao_data (se houver) e limpa a tabela pública
do $$
begin
  if exists (select 1 from public.bolao_data where id = 'sena_clube_admin_auth') then
    insert into public.admin_auth (id, username, password_hash, salt, token_version, updated_at)
    select
      'sena_clube_admin_auth',
      coalesce(estado_json->>'username', 'admin'),
      coalesce(estado_json->>'passwordHash', ''),
      coalesce(estado_json->>'salt', ''),
      1,
      updated_at
    from public.bolao_data
    where id = 'sena_clube_admin_auth'
      and estado_json->>'passwordHash' is not null
    on conflict (id) do update set
      username = excluded.username,
      password_hash = excluded.password_hash,
      salt = excluded.salt,
      updated_at = excluded.updated_at;

    delete from public.bolao_data where id = 'sena_clube_admin_auth';
  end if;
end $$;

-- 5. Defesa em profundidade: restringe SELECT em bolao_data para não expor registros de administração
drop policy if exists "Permitir leitura pública do bolão" on public.bolao_data;
create policy "Permitir leitura pública do bolão"
  on public.bolao_data
  for select
  to public
  using (id not like '%admin%');

