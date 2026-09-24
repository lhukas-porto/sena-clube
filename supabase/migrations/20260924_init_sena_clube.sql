-- ==========================================================================
-- SenaClube — Estrutura de Banco de Dados Supabase (PostgreSQL + RLS)
-- ==========================================================================

-- 1. Criação da tabela principal do SenaClube
create table if not exists public.bolao_data (
  id text primary key default 'sena_clube_master',
  nome_bolao text not null default 'Bolão Mega Sena dos amigos',
  taxa_organizador_global numeric default 0.20,
  ciclo_visualizado_id integer default 1,
  estado_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Habilitar Row Level Security (RLS)
alter table public.bolao_data enable row level security;

-- 3. Políticas de Segurança (RLS)
-- Leitura pública para que qualquer participante consulte o placar e ranking
drop policy if exists "Permitir leitura pública do bolão" on public.bolao_data;
create policy "Permitir leitura pública do bolão"
  on public.bolao_data
  for select
  using (true);

-- Atualização e inserção
drop policy if exists "Permitir atualização do bolão" on public.bolao_data;
create policy "Permitir atualização do bolão"
  on public.bolao_data
  for all
  using (true)
  with check (true);

-- 4. Função e Trigger para updated_at automático
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.bolao_data;
create trigger set_updated_at
  before update on public.bolao_data
  for each row
  execute function public.handle_updated_at();

-- 5. Carga de Dados Inicial (Seed) caso a tabela esteja vazia
insert into public.bolao_data (id, nome_bolao, taxa_organizador_global, ciclo_visualizado_id, estado_json)
values (
  'sena_clube_master',
  'Bolão Mega Sena dos amigos',
  0.20,
  1,
  '{
    "nomeBolao": "Bolão Mega Sena dos amigos",
    "taxaOrganizadorGlobal": 0.2,
    "cicloVisualizadoId": 1,
    "ciclos": [
      {
        "id": 1,
        "nome": "Ciclo 1",
        "status": "ativo",
        "concursoInicial": 3061,
        "concursoFinal": null,
        "valorCota": 30,
        "taxaOrganizador": 0.2,
        "premioQuadra": 5000,
        "concursos": [],
        "apostas": [],
        "apostasDescartadas": [],
        "faseApostas": "aberta",
        "alertasExibidos": { "quadraCicloId": null, "senaCicloId": null },
        "ganhadorSenaNome": null,
        "ganhadorQuadraNome": null,
        "criadoEm": "2026-09-24T20:35:48.390Z",
        "finalizadoEm": null
      }
    ]
  }'::jsonb
)
on conflict (id) do nothing;
