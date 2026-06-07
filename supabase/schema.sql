-- ============================================================
-- Controle de Gastos — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Table: months ──
-- Stores one JSON blob per user per month/year.
-- The "data" column holds: { incomes: [...], sections: [...] }

create table if not exists public.months (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  month      smallint not null check (month >= 0 and month <= 11),
  year       smallint not null check (year >= 2020),
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),

  -- one record per user per month/year
  unique (user_id, month, year)
);

-- ── Index for fast per-user queries ──
create index if not exists months_user_id_idx on public.months (user_id);

-- ── Row Level Security ──
-- Every user can only read and write their own rows.

alter table public.months enable row level security;

create policy "Users can read own months"
  on public.months for select
  using (auth.uid() = user_id);

create policy "Users can insert own months"
  on public.months for insert
  with check (auth.uid() = user_id);

create policy "Users can update own months"
  on public.months for update
  using (auth.uid() = user_id);

create policy "Users can delete own months"
  on public.months for delete
  using (auth.uid() = user_id);
