import 'server-only';
import { createHash } from 'node:crypto';
import type { SaveGameRequestInput } from '@/lib/arena/schemas';
import { type GameResult, type GameTermination, replayPgn } from '@/lib/chess/engine';
import { getServerEnv } from '@/lib/env';
import { getModelSpecById, isRankedEligibleModel } from '@/lib/providers/models.config';
import { getSupabaseServiceClient } from './server';

export class HandleConflictError extends Error {
  readonly status = 409;
  constructor(handle: string) {
    super(`Handle "${handle}" is already claimed by another player.`);
    this.name = 'HandleConflictError';
  }
}

export function hashPlayerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const NATURAL_TERMINATIONS = new Set<GameTermination>([
  'checkmate',
  'stalemate',
  'insufficient_material',
  'threefold_repetition',
  'fifty_move_rule',
]);

export function computeIsRanked(
  input: SaveGameRequestInput,
  termination: GameTermination,
): boolean {
  if (input.mode !== 'pure') return false;
  if (!isRankedEligibleModel(input.modelId)) return false;
  if (!input.playerHandle || !input.playerToken) return false;

  if (NATURAL_TERMINATIONS.has(termination)) {
    return true;
  }
  if (termination === 'forfeit' && input.forfeitedBy !== input.humanColor) {
    return input.moves.length >= 4;
  }
  return input.moves.length >= 6;
}

export interface PersistedGameSummary {
  id: string;
  model: string;
  mode: string;
  human_color: 'w' | 'b';
  result: GameResult;
  termination: string;
  pgn: string;
  illegal_attempts: number;
  fallback_moves: number;
  total_tokens: number;
  created_at: string;
}

export interface PersistedMoveRow {
  game_id: string;
  ply: number;
  san: string;
  fen_after: string;
  by: 'human' | 'model';
  comment: string | null;
  latency_ms: number | null;
  illegal_attempts: number;
}

export interface ModelStatsRow {
  model: string;
  mode: string;
  games_count: number;
  model_wins: number;
  draws: number;
  model_losses: number;
  avg_illegal_attempts: number;
}

export interface PlayerScoreboardRow {
  model: string;
  mode: string;
  player_token_hash: string;
  player_handle: string;
  player_avatar: string | null;
  model_games_count: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  last_played_at: string;
}

/**
 * Re-validates the PGN on the server and computes authoritative result/termination
 * before persisting to Supabase.
 */
export function deriveAuthoritativeOutcome(input: SaveGameRequestInput): {
  pgn: string;
  result: GameResult;
  termination: GameTermination;
} {
  const env = getServerEnv();
  const replayed = replayPgn(input.pgn, env.MAX_MOVES_PER_GAME);

  if (replayed.status.isGameOver && replayed.status.termination) {
    return {
      pgn: replayed.pgn,
      result: replayed.status.result,
      termination: replayed.status.termination,
    };
  }

  if (input.resignedBy) {
    const result: GameResult = input.resignedBy === 'w' ? '0-1' : '1-0';
    return { pgn: replayed.pgn, result, termination: 'resign' };
  }

  if (input.forfeitedBy) {
    const result: GameResult = input.forfeitedBy === 'w' ? '0-1' : '1-0';
    return { pgn: replayed.pgn, result, termination: 'forfeit' };
  }

  if (input.timedOutBy) {
    const result: GameResult = input.timedOutBy === 'w' ? '0-1' : '1-0';
    return { pgn: replayed.pgn, result, termination: 'timeout' };
  }

  if (input.drawAgreed) {
    return { pgn: replayed.pgn, result: '1/2-1/2', termination: 'draw_agreement' };
  }

  throw new Error('Cannot save an unfinished game without resignation or forfeit.');
}

export async function saveVerifiedGame(input: SaveGameRequestInput): Promise<{
  id: string;
  result: GameResult;
  termination: GameTermination;
  isRanked: boolean;
  persisted: boolean;
}> {
  const outcome = deriveAuthoritativeOutcome(input);
  const isRanked = computeIsRanked(input, outcome.termination);
  const tokenHash = input.playerToken ? hashPlayerToken(input.playerToken) : null;
  const client = getSupabaseServiceClient();

  if (!client) {
    return {
      id: crypto.randomUUID(),
      result: outcome.result,
      termination: outcome.termination,
      isRanked,
      persisted: false,
    };
  }

  if (input.playerHandle && tokenHash) {
    const { data: existingClaim, error: claimError } = await client
      .from('games')
      .select('id')
      .ilike('player_handle', input.playerHandle)
      .neq('player_token_hash', tokenHash)
      .limit(1);

    if (claimError) {
      throw new Error(claimError.message);
    }
    if (existingClaim && existingClaim.length > 0) {
      throw new HandleConflictError(input.playerHandle);
    }
  }

  const { data: gameRow, error: gameError } = await client
    .from('games')
    .insert({
      model: input.modelId,
      mode: input.mode,
      human_color: input.humanColor,
      result: outcome.result,
      termination: outcome.termination,
      pgn: outcome.pgn,
      illegal_attempts: input.illegalAttempts,
      fallback_moves: input.fallbackMoves,
      total_tokens: input.totalTokens,
      player_handle: input.playerHandle ?? null,
      player_avatar: input.playerAvatar ?? null,
      player_token_hash: tokenHash,
      is_ranked: isRanked,
    })
    .select('id')
    .single();

  if (gameError || !gameRow) {
    throw new Error(gameError?.message ?? 'Failed to insert game.');
  }

  if (input.moves.length > 0) {
    const moveRows = input.moves.map((m) => ({
      game_id: gameRow.id,
      ply: m.ply,
      san: m.san,
      fen_after: m.fenAfter,
      by: m.by,
      comment: m.comment ?? null,
      latency_ms: m.latencyMs ?? null,
      illegal_attempts: m.illegalAttempts,
    }));

    const { error: movesError } = await client.from('moves').insert(moveRows);
    if (movesError) {
      throw new Error(movesError.message);
    }
  }

  return {
    id: gameRow.id,
    result: outcome.result,
    termination: outcome.termination,
    isRanked,
    persisted: true,
  };
}

export async function listGames(options: {
  model?: string;
  result?: string;
  limit?: number;
  offset?: number;
}): Promise<{ games: PersistedGameSummary[]; total: number; configured: boolean }> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return { games: [], total: 0, configured: false };
  }

  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);

  let query = client
    .from('games')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.model) {
    query = query.eq('model', options.model);
  }
  if (options.result) {
    query = query.eq('result', options.result);
  }

  const { data, count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    games: (data ?? []) as PersistedGameSummary[],
    total: count ?? 0,
    configured: true,
  };
}

export async function getGameById(id: string): Promise<{
  game: PersistedGameSummary | null;
  moves: PersistedMoveRow[];
  configured: boolean;
}> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return { game: null, moves: [], configured: false };
  }

  const { data: game, error: gameError } = await client
    .from('games')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (gameError) {
    throw new Error(gameError.message);
  }
  if (!game) {
    return { game: null, moves: [], configured: true };
  }

  const { data: moves, error: movesError } = await client
    .from('moves')
    .select('*')
    .eq('game_id', id)
    .order('ply', { ascending: true });

  if (movesError) {
    throw new Error(movesError.message);
  }

  return {
    game: game as PersistedGameSummary,
    moves: (moves ?? []) as PersistedMoveRow[],
    configured: true,
  };
}

export async function getModelLeaderboard(mode?: string): Promise<{
  models: ModelStatsRow[];
  configured: boolean;
}> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return { models: [], configured: false };
  }

  let query = client.from('model_results').select('*').order('games_count', { ascending: false });
  if (mode) {
    query = query.eq('mode', mode);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    models: (data ?? []) as ModelStatsRow[],
    configured: true,
  };
}

export async function getPlayerScoreboard(options?: {
  model?: string;
  mode?: string;
}): Promise<{
  entries: PlayerScoreboardRow[];
  configured: boolean;
}> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return { entries: [], configured: false };
  }

  let query = client
    .from('model_player_scoreboard')
    .select('*')
    .order('points', { ascending: false })
    .order('wins', { ascending: false })
    .order('games_played', { ascending: true })
    .limit(200);

  if (options?.mode) {
    query = query.eq('mode', options.mode);
  } else {
    query = query.eq('mode', 'pure');
  }
  if (options?.model) {
    query = query.eq('model', options.model);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  // Hide custom models with fewer than 3 ranked games to avoid typos cluttering the public table
  const filtered = ((data ?? []) as PlayerScoreboardRow[]).filter((row) => {
    const isPreset = Boolean(getModelSpecById(row.model));
    return isPreset || row.model_games_count >= 3;
  });

  return {
    entries: filtered,
    configured: true,
  };
}
