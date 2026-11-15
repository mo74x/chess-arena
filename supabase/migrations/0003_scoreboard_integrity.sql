-- P0 scoreboard integrity: deduplicate ranked submissions by game_session_id and receipt_hash

alter table public.games
  add column if not exists game_session_id uuid,
  add column if not exists receipt_hash text;

create unique index if not exists games_game_session_id_uidx
  on public.games (game_session_id)
  where game_session_id is not null;

create unique index if not exists games_receipt_hash_uidx
  on public.games (receipt_hash)
  where receipt_hash is not null;
