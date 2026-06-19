-- ════════════════════════════════════════════════════════════════════
--  Tomorrowland 2026 Companion — Supabase schema
--  Run this whole file in: Supabase Dashboard → SQL Editor → New query → Run
--  Safe to re-run (uses IF NOT EXISTS / idempotent policies).
-- ════════════════════════════════════════════════════════════════════

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ── members ──────────────────────────────────────────────────────────
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  session_token text not null unique,
  color         text not null,
  created_at    timestamptz not null default now()
);

-- ── lineup (festival DJ × stage × day) ───────────────────────────────
create table if not exists public.lineup (
  id              uuid primary key default gen_random_uuid(),
  day             date not null,                 -- 2026-07-24 / 25 / 26
  artist_name     text not null,
  stage_name      text not null,
  start_time      timestamptz,                   -- nullable → "Time TBA"
  end_time        timestamptz,                   -- nullable
  genre           text,
  last_scraped_at timestamptz not null default now(),
  -- prevents duplicate rows on re-sync; the seed/scrape upserts on this key.
  -- start_time is included so an artist can have two sets on the same stage/day
  -- (e.g. Symphony Of Unity twice at Freedom by Bud).
  unique (day, artist_name, stage_name, start_time)
);

-- ── itinerary_items (shared, group-editable) ─────────────────────────
create table if not exists public.itinerary_items (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  artist_name text not null,
  stage_name  text not null,
  start_time  timestamptz,                        -- nullable → lives in TBA tray
  end_time    timestamptz,
  added_by    uuid references public.members(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ── locations (live GPS, one row per member, upserted) ───────────────
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade unique,
  lat        double precision not null,
  lng        double precision not null,
  updated_at timestamptz not null default now()
);

-- ── expenses ─────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  amount       numeric not null,            -- original amount
  currency     text not null default 'EUR', -- 'EUR' | 'SGD'
  amount_sgd   numeric not null,            -- converted to SGD at entry time
  paid_by      uuid references public.members(id) on delete set null,
  split_type   text not null default 'equal', -- equal | custom | unit | own | settlement
  split_detail jsonb not null default '{}'::jsonb,
  category     text not null default 'Other', -- for analytics "by type"
  spent_on     date,                          -- festival day for analytics "by day"
  settled      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── Realtime: add every table to the supabase_realtime publication ───
do $$
declare t text;
begin
  foreach t in array array['members','lineup','itinerary_items','locations','expenses']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── RLS: enabled with permissive policies (app authenticates via a
--    localStorage session token, same model as the Vinabae app). ──────
alter table public.members          enable row level security;
alter table public.lineup           enable row level security;
alter table public.itinerary_items  enable row level security;
alter table public.locations        enable row level security;
alter table public.expenses         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','lineup','itinerary_items','locations','expenses']
  loop
    execute format('drop policy if exists "anon_all_%1$s" on public.%1$I', t);
    execute format(
      'create policy "anon_all_%1$s" on public.%1$I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Helpful indexes
create index if not exists idx_lineup_day        on public.lineup(day);
create index if not exists idx_itinerary_day     on public.itinerary_items(day);
create index if not exists idx_itinerary_addedby on public.itinerary_items(added_by);
create index if not exists idx_expenses_created  on public.expenses(created_at);
