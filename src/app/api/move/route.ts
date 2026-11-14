import { NextResponse } from 'next/server';
import { checkRateLimit, extractClientIp } from '@/lib/arena/rate-limit';
import { ArenaValidationError, resolveAiMove } from '@/lib/arena/resolve-move';
import { MoveRequestSchema } from '@/lib/arena/schemas';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';

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

  const apiKeyHeader = request.headers.get('x-api-key') ?? undefined;

  try {
    const result = await resolveAiMove({
      ...parsed.data,
      apiKey: apiKeyHeader,
    });
    return NextResponse.json(result, { status: 200 });
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
