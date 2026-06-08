-- ============================================================
-- Tabela de notificações de atualização do app
-- Execute no Supabase → SQL Editor
-- ============================================================

create table if not exists public.app_updates (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Qualquer usuário autenticado pode ler atualizações publicadas
alter table public.app_updates enable row level security;

create policy "Authenticated users can read published updates"
  on public.app_updates for select
  to authenticated
  using (published = true);

-- ── Como publicar uma atualização ──
-- Insira um registro com published = true:
--
-- insert into public.app_updates (title, body, published)
-- values (
--   'Nova funcionalidade: Relatório Anual',
--   'Agora você pode visualizar um resumo completo do seu ano financeiro. Acesse pelo botão "Ver ano" no cabeçalho.',
--   true
-- );
--
-- Cada usuário verá o modal uma única vez.
-- Para republicar para todos (ex: nova versão), insira um novo registro.
