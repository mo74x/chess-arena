import { NextResponse } from 'next/server';
import { getModelLeaderboard } from '@/lib/supabase/games';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || undefined;

  try {
    const data = await getModelLeaderboard(mode);
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load model stats.' },
      { status: 500 },
    );
  }
}
