import { NextResponse } from 'next/server';
import { SaveGameRequestSchema } from '@/lib/arena/schemas';
import { listGames, saveVerifiedGame } from '@/lib/supabase/games';

export const runtime = 'nodejs';

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save game.' },
      { status: 400 },
    );
  }
}
