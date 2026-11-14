-- Chess Arena Postgres Schema & Row Level Security
-- All client reads/writes route through Next.js server routes using SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  mode text not null check (mode in ('pure', 'assisted', 'engine')),
  human_color text not null check (human_color in ('w', 'b')),
  result text not null check (result in ('1-0', '0-1', '1/2-1/2', '*')),
  termination text not null,
  pgn text not null,
  illegal_attempts int not null default 0,
  fallback_moves int not null default 0,
  total_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.moves (
  game_id uuid not null references public.games(id) on delete cascade,
  ply int not null check (ply >= 1),
  san text not null,
  fen_after text not null,
  by text not null check (by in ('human', 'model')),
  comment text,
  latency_ms int,
  illegal_attempts int not null default 0,
  primary key (game_id, ply)
);

create index if not exists games_model_mode_idx on public.games (model, mode);
create index if not exists games_created_at_idx on public.games (created_at desc);

create or replace view public.model_results as
select
  model,
  mode,
  count(*)::int as games_count,
  count(*) filter (
    where (human_color = 'w' and result = '0-1')
       or (human_color = 'b' and result = '1-0')
  )::int as model_wins,
  count(*) filter (where result = '1/2-1/2')::int as draws,
  count(*) filter (
    where (human_color = 'w' and result = '1-0')
       or (human_color = 'b' and result = '0-1')
  )::int as model_losses,
  coalesce(round(avg(illegal_attempts)::numeric, 2), 0)::float8 as avg_illegal_attempts
from public.games
group by model, mode;

alter table public.games enable row level security;
alter table public.moves enable row level security;

-- Deny direct anon/authenticated table access; server routes use service_role.
drop policy if exists "deny_anon_games" on public.games;
create policy "deny_anon_games" on public.games
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "deny_anon_moves" on public.moves;
create policy "deny_anon_moves" on public.moves
  for all to anon, authenticated
  using (false)
  with check (false);
