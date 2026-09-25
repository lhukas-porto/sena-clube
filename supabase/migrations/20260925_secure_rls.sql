-- ==========================================================================
-- SenaClube — Blindagem de RLS (Row Level Security)
-- Permite leitura pública (SELECT) para os participantes,
-- mas restringe modificações (INSERT, UPDATE, DELETE) exclusivamente para o backend via service_role.
-- ==========================================================================

-- 1. Revoga a política anterior excessivamente permissiva de atualização anônima
drop policy if exists "Permitir atualização do bolão" on public.bolao_data;

-- 2. Mantém leitura pública estrita para todos os participantes
drop policy if exists "Permitir leitura pública do bolão" on public.bolao_data;
create policy "Permitir leitura pública do bolão"
  on public.bolao_data
  for select
  to public
  using (true);

-- 3. Apenas o backend autenticado com service_role pode inserir, atualizar ou excluir dados
drop policy if exists "Permitir escrita apenas via backend service_role" on public.bolao_data;
create policy "Permitir escrita apenas via backend service_role"
  on public.bolao_data
  for all
  to service_role
  using (true)
  with check (true);
