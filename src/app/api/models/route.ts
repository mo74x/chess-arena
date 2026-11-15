import { NextResponse } from 'next/server';
import { getModelLeaderboard, getPlayerScoreboard } from '@/lib/supabase/games';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || undefined;
  const model = searchParams.get('model') || undefined;

  try {
    const [leaderboard, scoreboard] = await Promise.all([
      getModelLeaderboard(mode),
      getPlayerScoreboard({ mode, model }),
    ]);
    return NextResponse.json(
      {
        models: leaderboard.models,
        scoreboard: scoreboard.entries,
        configured: leaderboard.configured,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load model stats.' },
      { status: 500 },
    );
  }
}
