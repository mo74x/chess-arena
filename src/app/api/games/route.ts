import { NextResponse } from 'next/server';
import { checkRateLimit, extractClientIp } from '@/lib/arena/rate-limit';
import { SaveGameRequestSchema } from '@/lib/arena/schemas';
import {
  DuplicateGameError,
  HandleConflictError,
  InvalidReceiptError,
  listGames,
  saveVerifiedGame,
} from '@/lib/supabase/games';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get('model') || undefined;
  const result = searchParams.get('result') || undefined;
  const limitRaw = Number(searchParams.get('limit') ?? '20');
  const offsetRaw = Number(searchParams.get('offset') ?? '0');

  try {
    const data = await listGames({
      model,
      result,
      limit: Number.isFinite(limitRaw) ? limitRaw : 20,
      offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load games.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = extractClientIp(request.headers);
  const limit = checkRateLimit(`games:${ip}`, 20);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded for saving games. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = SaveGameRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 400 },
    );
  }

  try {
    const saved = await saveVerifiedGame(parsed.data);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    if (err instanceof HandleConflictError) {
      return NextResponse.json({ error: err.message, code: 'handle_taken' }, { status: 409 });
    }
    if (err instanceof DuplicateGameError) {
      return NextResponse.json({ error: err.message, code: 'duplicate_game' }, { status: 409 });
    }
    if (err instanceof InvalidReceiptError) {
      return NextResponse.json({ error: err.message, code: 'invalid_receipt' }, { status: 403 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save game.' },
      { status: 400 },
    );
  }
}
