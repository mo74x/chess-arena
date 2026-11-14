import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getGameById } from '@/lib/supabase/games';

const UuidSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!UuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid game id.' }, { status: 400 });
  }

  try {
    const data = await getGameById(id);
    if (!data.game) {
      return NextResponse.json({ error: 'Game not found.' }, { status: 404 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch game.' },
      { status: 500 },
    );
  }
}
