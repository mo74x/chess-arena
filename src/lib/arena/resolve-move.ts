import {
  type GameResult,
  type GameTermination,
  getGameStatus,
  replayPgn,
  sanitizeSanCandidate,
} from '@/lib/chess/engine';
import { getServerEnv } from '@/lib/env';
import {
  ENGINE_SKILL_DEFAULT,
  resolveModelSpec,
  type ArenaModelSpec,
  type GameMode,
  type IllegalMovePolicy,
  type ProviderId,
} from '@/lib/providers/models.config';
import { getProviderAdapter, resolveProviderApiKey } from '@/lib/providers/registry';
import {
  sanitizeProviderError,
  type ProviderAdapter,
  type StockfishCandidate,
  type TokenUsage,
} from '@/lib/providers/types';
import { getBestMove, getTopCandidates } from '@/lib/stockfish/engine';
import { LlmMoveJsonSchema } from './schemas';

export interface ResolveAiMoveInput {
  pgn: string;
  modelId: string;
  provider?: ProviderId;
  mode: GameMode;
  policy: IllegalMovePolicy;
  skillLevel?: number;
  apiKey?: string;
  allowServerFallback?: boolean;
  includeEval?: boolean;
}

export interface MoveTelemetry {
  provider: ArenaModelSpec['provider'];
  modelId: string;
  mode: GameMode;
  policy: IllegalMovePolicy;
  illegalAttempts: number;
  retriesUsed: number;
  attemptedIllegalMoves: string[];
  fallbackUsed: boolean;
  latencyMs: number;
  usage: TokenUsage;
}

export interface ResolveAiMoveOutput {
  san: string | null;
  fen: string;
  pgn: string;
  comment: string | null;
  evalCp?: number;
  mate?: number;
  candidates?: StockfishCandidate[];
  gameOver: boolean;
  result: GameResult;
  termination: GameTermination | null;
  inCheck: boolean;
  telemetry: MoveTelemetry;
}

export interface ResolveAiMoveDeps {
  getAdapter?: (provider: Exclude<ArenaModelSpec['provider'], 'engine'>) => ProviderAdapter;
  resolveApiKey?: typeof resolveProviderApiKey;
  getCandidates?: (fen: string, multiPv?: number, movetimeMs?: number) => Promise<StockfishCandidate[]>;
  getEngineBestMove?: (
    fen: string,
    skillLevel: number,
    movetimeMs?: number,
  ) => Promise<{ san: string; uci: string; evalCp: number; mate?: number }>;
}

const MIN_RETRY_BUDGET_MS = 2_000;
const MAX_RETRIES = 2;

/**
 * Strips markdown code fences if an LLM wraps JSON in ```json ... ```.
 */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1]!.trim() : trimmed;
}

export function parseLlmMoveReply(rawText: string): { move: string; comment?: string } | null {
  const cleaned = stripCodeFences(rawText);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned);
    const validated = LlmMoveJsonSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
}

export class ArenaValidationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function resolveAiMove(
  input: ResolveAiMoveInput,
  deps: ResolveAiMoveDeps = {},
): Promise<ResolveAiMoveOutput> {
  const startedAt = Date.now();
  const env = getServerEnv();
  const model = resolveModelSpec(input.modelId, input.provider);
  if (!model) {
    throw new ArenaValidationError(`Unknown or invalid modelId: ${input.modelId}`, 400, 'unknown_model');
  }

  let replayed;
  try {
    replayed = replayPgn(input.pgn, env.MAX_MOVES_PER_GAME);
  } catch (err) {
    throw new ArenaValidationError(
      err instanceof Error ? err.message : 'Invalid PGN.',
      400,
      'invalid_pgn',
    );
  }

  if (replayed.status.isGameOver) {
    throw new ArenaValidationError('Game is already over.', 409, 'game_already_over');
  }

  const getCandidatesFn = deps.getCandidates ?? getTopCandidates;
  const getEngineBestMoveFn = deps.getEngineBestMove ?? getBestMove;
  const getAdapterFn = deps.getAdapter ?? getProviderAdapter;
  const resolveKeyFn = deps.resolveApiKey ?? resolveProviderApiKey;

  const colorName = replayed.turn === 'w' ? 'white' : 'black';

  // Engine baseline mode (Stockfish directly, no LLM call)
  if (input.mode === 'engine' || model.provider === 'engine') {
    const skill = input.skillLevel ?? ENGINE_SKILL_DEFAULT;
    const engineMove = await getEngineBestMoveFn(replayed.fen, skill, 250);
    const applied = replayed.chess.move(engineMove.san);
    if (!applied) {
      throw new ArenaValidationError('Engine returned an illegal move.', 500, 'engine_error');
    }
    const nextStatus = getGameStatus(replayed.chess);
    return {
      san: applied.san,
      fen: replayed.chess.fen(),
      pgn: replayed.chess.pgn(),
      comment: `Stockfish (Skill ${skill})`,
      evalCp: engineMove.evalCp,
      mate: engineMove.mate,
      gameOver: nextStatus.isGameOver,
      result: nextStatus.result,
      termination: nextStatus.termination,
      inCheck: nextStatus.inCheck,
      telemetry: {
        provider: model.provider,
        modelId: model.id,
        mode: input.mode,
        policy: input.policy,
        illegalAttempts: 0,
        retriesUsed: 0,
        attemptedIllegalMoves: [],
        fallbackUsed: false,
        latencyMs: Date.now() - startedAt,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
    };
  }

  // Resolve API key before invoking Stockfish or LLM
  let apiKey: string | undefined;
  try {
    apiKey = resolveKeyFn(model.provider, input.apiKey, {
      allowServerFallback: input.allowServerFallback,
    });
  } catch (err) {
    const sanitized = sanitizeProviderError(err);
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: number }).status) : sanitized.status;
    throw new ArenaValidationError(
      err instanceof Error ? err.message : sanitized.safeMessage,
      status,
      'missing_key',
    );
  }

  let candidates: StockfishCandidate[] | undefined;
  if (input.mode === 'assisted') {
    try {
      candidates = await getCandidatesFn(replayed.fen, 3, 250);
    } catch {
      candidates = undefined;
    }
  }

  const deadline = startedAt + env.MOVE_TIMEOUT_MS;
  const adapter = getAdapterFn(model.provider);
  const legalSet = new Set(replayed.legalMovesSan);
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const attemptedIllegalMoves: string[] = [];

  let illegalAttempts = 0;
  let retriesUsed = 0;
  let retryContext: { rejectedMove: string; reason: string; attemptNumber: number } | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (attempt > 0 && remainingMs < MIN_RETRY_BUDGET_MS) {
      break;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, remainingMs));

    try {
      // Attempt 1 in pure mode omits legalMovesSan (except mock-legal/mock-illegal-once which ignore or use it for deterministic testing);
      // Wait: mock-legal needs legalMovesSan to pick a legal move without duplicating chess.js inside mock.ts.
      const includeLegalMoves =
        attempt > 0 || input.mode === 'assisted' || model.provider === 'mock';

      const res = await adapter.getMove(
        {
          model,
          mode: input.mode,
          color: colorName,
          fen: replayed.fen,
          recentMovesSan: replayed.recentMovesSan,
          legalMovesSan: includeLegalMoves ? replayed.legalMovesSan : undefined,
          candidates,
          retryContext,
        },
        { apiKey, signal: controller.signal },
      );

      clearTimeout(timer);
      totalUsage.inputTokens += res.usage.inputTokens;
      totalUsage.outputTokens += res.usage.outputTokens;
      totalUsage.totalTokens += res.usage.totalTokens;

      const parsed = parseLlmMoveReply(res.rawText);
      if (!parsed) {
        illegalAttempts += 1;
        attemptedIllegalMoves.push('(malformed)');
        retryContext = {
          rejectedMove: '(malformed)',
          reason: 'Reply was not valid JSON with a move field',
          attemptNumber: attempt + 1,
        };
        if (attempt < MAX_RETRIES) retriesUsed += 1;
        continue;
      }

      const candidateSan = sanitizeSanCandidate(parsed.move);
      if (!legalSet.has(candidateSan)) {
        illegalAttempts += 1;
        attemptedIllegalMoves.push(parsed.move);
        retryContext = {
          rejectedMove: parsed.move,
          reason: 'Move is not legal in this position',
          attemptNumber: attempt + 1,
        };
        if (attempt < MAX_RETRIES) retriesUsed += 1;
        continue;
      }

      const applied = replayed.chess.move(candidateSan);
      if (!applied) {
        illegalAttempts += 1;
        attemptedIllegalMoves.push(parsed.move);
        retryContext = {
          rejectedMove: parsed.move,
          reason: 'Move could not be applied',
          attemptNumber: attempt + 1,
        };
        if (attempt < MAX_RETRIES) retriesUsed += 1;
        continue;
      }

      const nextStatus = getGameStatus(replayed.chess);
      let evalCp: number | undefined;
      let mate: number | undefined;

      if (input.includeEval !== false && model.provider !== 'mock') {
        try {
          const postEval = await getCandidatesFn(replayed.chess.fen(), 1, 150);
          evalCp = postEval[0]?.evalCp;
          mate = postEval[0]?.mate;
        } catch {
          // Non-fatal: eval bar is best-effort
        }
      }

      return {
        san: applied.san,
        fen: replayed.chess.fen(),
        pgn: replayed.chess.pgn(),
        comment: parsed.comment ?? null,
        evalCp,
        mate,
        candidates,
        gameOver: nextStatus.isGameOver,
        result: nextStatus.result,
        termination: nextStatus.termination,
        inCheck: nextStatus.inCheck,
        telemetry: {
          provider: model.provider,
          modelId: model.id,
          mode: input.mode,
          policy: input.policy,
          illegalAttempts,
          retriesUsed,
          attemptedIllegalMoves,
          fallbackUsed: false,
          latencyMs: Date.now() - startedAt,
          usage: totalUsage,
        },
      };
    } catch (err) {
      clearTimeout(timer);
      const sanitized = sanitizeProviderError(err);
      throw new ArenaValidationError(sanitized.safeMessage, sanitized.status, sanitized.code);
    }
  }

  // Retries exhausted or budget depleted: apply strict (forfeit) or friendly (fallback).
  if (input.policy === 'strict') {
    const winnerResult: GameResult = replayed.turn === 'w' ? '0-1' : '1-0';
    return {
      san: null,
      fen: replayed.fen,
      pgn: replayed.pgn,
      comment: 'Model forfeited after exceeding illegal move retries.',
      candidates,
      gameOver: true,
      result: winnerResult,
      termination: 'forfeit',
      inCheck: replayed.status.inCheck,
      telemetry: {
        provider: model.provider,
        modelId: model.id,
        mode: input.mode,
        policy: input.policy,
        illegalAttempts,
        retriesUsed,
        attemptedIllegalMoves,
        fallbackUsed: false,
        latencyMs: Date.now() - startedAt,
        usage: totalUsage,
      },
    };
  }

  // Friendly policy: deterministic fallback legal move (legalMovesSan[0])
  const fallbackSan = replayed.legalMovesSan[0];
  if (!fallbackSan) {
    throw new ArenaValidationError('No legal fallback move available.', 500, 'no_legal_moves');
  }
  const appliedFallback = replayed.chess.move(fallbackSan);
  const nextStatus = getGameStatus(replayed.chess);

  return {
    san: appliedFallback.san,
    fen: replayed.chess.fen(),
    pgn: replayed.chess.pgn(),
    comment: 'Fallback legal move played after illegal model replies.',
    candidates,
    gameOver: nextStatus.isGameOver,
    result: nextStatus.result,
    termination: nextStatus.termination,
    inCheck: nextStatus.inCheck,
    telemetry: {
      provider: model.provider,
      modelId: model.id,
      mode: input.mode,
      policy: input.policy,
      illegalAttempts,
      retriesUsed,
      attemptedIllegalMoves,
      fallbackUsed: true,
      latencyMs: Date.now() - startedAt,
      usage: totalUsage,
    },
  };
}
