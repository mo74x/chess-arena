import 'server-only';
import type { SaveGameRequestInput } from '@/lib/arena/schemas';
import { type GameResult, type GameTermination, replayPgn } from '@/lib/chess/engine';
import { getServerEnv } from '@/lib/env';
import { getSupabaseServiceClient } from './server';

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

  throw new Error('Cannot save an unfinished game without resignation or forfeit.');
}

export async function saveVerifiedGame(input: SaveGameRequestInput): Promise<{
  id: string;
  result: GameResult;
  termination: GameTermination;
  persisted: boolean;
}> {
  const outcome = deriveAuthoritativeOutcome(input);
  const client = getSupabaseServiceClient();

  if (!client) {
    return {
      id: crypto.randomUUID(),
      result: outcome.result,
      termination: outcome.termination,
      persisted: false,
    };
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
