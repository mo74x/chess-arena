import { NextResponse } from 'next/server';
import { checkRateLimit, extractClientIp } from '@/lib/arena/rate-limit';
import { AnalyzeRequestSchema } from '@/lib/arena/schemas';
import { replayPgn } from '@/lib/chess/engine';
import { getServerEnv } from '@/lib/env';
import { analyzeGame } from '@/lib/stockfish/engine';

export async function POST(request: Request): Promise<NextResponse> {
  const ip = extractClientIp(request.headers);
  const limit = checkRateLimit(`analyze:${ip}`, 5);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Analysis rate limit exceeded. Wait before analyzing another game.', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.', code: 'invalid_json' }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid PGN payload.', code: 'validation_error' }, { status: 400 });
  }

  const env = getServerEnv();
  try {
    const replayed = replayPgn(parsed.data.pgn, env.MAX_MOVES_PER_GAME);
    if (replayed.ply === 0) {
      return NextResponse.json({ error: 'Cannot analyze an empty game.', code: 'empty_game' }, { status: 400 });
    }
    const analysis = await analyzeGame(replayed.pgn, 80);
    return NextResponse.json(analysis, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to analyze game.', code: 'analysis_failed' },
      { status: 400 },
    );
  }
}
