-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
create table if not exists public.flights (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null,
  deleted boolean not null default false
);
create table if not exists public.trips (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null,
  deleted boolean not null default false
);
create index if not exists flights_user_updated on public.flights (user_id, updated_at);
create index if not exists trips_user_updated on public.trips (user_id, updated_at);

alter table public.flights enable row level security;
alter table public.trips enable row level security;

drop policy if exists "own flights" on public.flights;
create policy "own flights" on public.flights for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own trips" on public.trips;
create policy "own trips" on public.trips for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
