-- Player identity, ranked eligibility, and 3/1/0 user-vs-model scoreboard

alter table public.games
  add column if not exists player_handle text,
  add column if not exists player_avatar text,
  add column if not exists player_token_hash text,
  add column if not exists is_ranked boolean not null default false;

alter table public.games
  drop constraint if exists games_player_handle_len_check;

alter table public.games
  add constraint games_player_handle_len_check
  check (player_handle is null or char_length(player_handle) between 3 and 24);

create index if not exists games_ranked_model_player_idx
  on public.games (model, mode, player_token_hash)
  where is_ranked = true;

create index if not exists games_player_handle_lower_idx
  on public.games (lower(player_handle))
  where player_handle is not null;

-- Ranked user-vs-model scoreboard: 3 points per human win, 1 per draw, 0 per loss
create or replace view public.model_player_scoreboard as
with model_counts as (
  select
    model,
    mode,
    count(*)::int as model_games_count
  from public.games
  where is_ranked = true
  group by model, mode
)
select
  g.model,
  g.mode,
  g.player_token_hash,
  max(g.player_handle) as player_handle,
  max(g.player_avatar) as player_avatar,
  mc.model_games_count,
  count(*)::int as games_played,
  count(*) filter (
    where (g.human_color = 'w' and g.result = '1-0')
       or (g.human_color = 'b' and g.result = '0-1')
  )::int as wins,
  count(*) filter (where g.result = '1/2-1/2')::int as draws,
  count(*) filter (
    where (g.human_color = 'w' and g.result = '0-1')
       or (g.human_color = 'b' and g.result = '1-0')
  )::int as losses,
  (
    count(*) filter (
      where (g.human_color = 'w' and g.result = '1-0')
         or (g.human_color = 'b' and g.result = '0-1')
    ) * 3
    + count(*) filter (where g.result = '1/2-1/2')
  )::int as points,
  max(g.created_at) as last_played_at
from public.games g
join model_counts mc on mc.model = g.model and mc.mode = g.mode
where g.is_ranked = true
  and g.player_token_hash is not null
  and g.player_handle is not null
group by g.model, g.mode, g.player_token_hash, mc.model_games_count;

revoke all on public.model_player_scoreboard from anon, authenticated;
