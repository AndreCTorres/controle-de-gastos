-- ============================================================
-- Tabela de metas mensais por categoria
-- Execute no Supabase → SQL Editor
-- ============================================================

-- ── Table: monthly_goals ──
-- Armazena as metas anuais do usuário num único blob JSON por ano.
-- goals = { [monthIndex 0-11]: { [sectionId]: limitValue } }
-- Exemplo: { "0": { "supermercado": 800, "transporte": 300 } }

create table if not exists public.monthly_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  year       smallint not null check (year >= 2020),
  goals      jsonb not null default '{}',
  updated_at timestamptz not null default now(),

  -- um registro por usuário por ano
  unique (user_id, year)
);

-- ── Índice para queries rápidas por usuário ──
create index if not exists monthly_goals_user_id_idx on public.monthly_goals (user_id);

-- ── Row Level Security ──
alter table public.monthly_goals enable row level security;

create policy "Users can read own goals"
  on public.monthly_goals for select
  using (auth.uid() = user_id);

create policy "Users can insert own goals"
  on public.monthly_goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own goals"
  on public.monthly_goals for update
  using (auth.uid() = user_id);

create policy "Users can delete own goals"
  on public.monthly_goals for delete
  using (auth.uid() = user_id);
