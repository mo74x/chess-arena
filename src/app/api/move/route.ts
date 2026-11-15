import { Chess } from 'chess.js';
import { NextResponse } from 'next/server';
import { checkRateLimit, extractClientIp } from '@/lib/arena/rate-limit';
import {
  type MoveReceiptPayload,
  signMoveReceipt,
  verifyMoveReceipt,
  verifyPgnProgression,
} from '@/lib/arena/receipt';
import { ArenaValidationError, resolveAiMove } from '@/lib/arena/resolve-move';
import { MoveRequestSchema } from '@/lib/arena/schemas';
import { getServerEnv } from '@/lib/env';
import { resolveModelSpec } from '@/lib/providers/models.config';

export async function POST(request: Request): Promise<NextResponse> {
  const env = getServerEnv();
  const ip = extractClientIp(request.headers);
  const limit = checkRateLimit(`move:${ip}`, env.RATE_LIMIT_MOVES_PER_MINUTE);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before making another move.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.', code: 'invalid_json' }, { status: 400 });
  }

  const parsed = MoveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        code: 'validation_error',
      },
      { status: 400 },
    );
  }

  const resolvedModel = resolveModelSpec(parsed.data.modelId, parsed.data.provider);
  if (!resolvedModel) {
    return NextResponse.json(
      { error: `Unknown or invalid modelId: ${parsed.data.modelId}`, code: 'unknown_model' },
      { status: 400 },
    );
  }

  let prevPayload: MoveReceiptPayload | null = null;
  if (parsed.data.prevReceipt) {
    prevPayload = verifyMoveReceipt(parsed.data.prevReceipt);
    if (!prevPayload) {
      return NextResponse.json(
        { error: 'Invalid move receipt signature.', code: 'invalid_receipt' },
        { status: 403 },
      );
    }
    if (
      parsed.data.gameSessionId &&
      prevPayload.gameSessionId !== parsed.data.gameSessionId
    ) {
      return NextResponse.json(
        { error: 'Move receipt session mismatch.', code: 'invalid_receipt' },
        { status: 403 },
      );
    }
    if (prevPayload.modelId !== resolvedModel.id || prevPayload.mode !== parsed.data.mode) {
      return NextResponse.json(
        { error: 'Move receipt model or mode mismatch.', code: 'invalid_receipt' },
        { status: 403 },
      );
    }
    const prog = verifyPgnProgression(prevPayload.pgn, parsed.data.pgn);
    if (!prog.valid) {
      return NextResponse.json(
        { error: 'PGN does not match chained move receipt.', code: 'invalid_receipt' },
        { status: 403 },
      );
    }
  }

  // Determine pre-move ply & side to move for forfeit attribution and verifiedFromStart
  const preChess = new Chess();
  if (parsed.data.pgn.trim().length > 0) {
    try {
      preChess.loadPgn(parsed.data.pgn.trim());
    } catch {
      return NextResponse.json({ error: 'Invalid PGN.', code: 'invalid_pgn' }, { status: 400 });
    }
  }
  const prePly = preChess.history().length;
  const aiTurn = preChess.turn();
  const verifiedFromStart = prevPayload ? prevPayload.verifiedFromStart : prePly <= 1;

  const apiKeyHeader = request.headers.get('x-api-key') ?? undefined;

  try {
    const result = await resolveAiMove({
      ...parsed.data,
      apiKey: apiKeyHeader,
    });

    const postChess = new Chess();
    if (result.pgn.trim().length > 0) {
      postChess.loadPgn(result.pgn.trim());
    }
    const postPly = postChess.history().length;

    const sessionId =
      parsed.data.gameSessionId ?? prevPayload?.gameSessionId ?? crypto.randomUUID();
    const cumulativeIllegal =
      (prevPayload?.illegalAttempts ?? 0) + result.telemetry.illegalAttempts;
    const cumulativeFallbacks =
      (prevPayload?.fallbackMoves ?? 0) + (result.telemetry.fallbackUsed ? 1 : 0);
    const cumulativeTokens =
      (prevPayload?.totalTokens ?? 0) + result.telemetry.usage.totalTokens;

    const receipt = signMoveReceipt({
      v: 1,
      gameSessionId: sessionId,
      pgn: result.pgn,
      ply: postPly,
      modelId: result.telemetry.modelId,
      mode: result.telemetry.mode,
      policy: result.telemetry.policy,
      illegalAttempts: cumulativeIllegal,
      fallbackMoves: cumulativeFallbacks,
      totalTokens: cumulativeTokens,
      forfeitedBy: result.termination === 'forfeit' ? aiTurn : null,
      verifiedFromStart,
      issuedAt: Date.now(),
    });

    return NextResponse.json({ ...result, receipt }, { status: 200 });
  } catch (err) {
    if (err instanceof ArenaValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { error: 'Unexpected error while resolving move.', code: 'internal_error' },
      { status: 500 },
    );
  }
}
