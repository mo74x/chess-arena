import { NextResponse } from 'next/server';
import { validateProductionEnv } from '@/lib/env';
import { checkStockfishHealth } from '@/lib/stockfish/engine';
import { isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(): Promise<NextResponse> {
  const env = validateProductionEnv();
  const stockfish = await checkStockfishHealth();
  const supabase = isSupabaseConfigured() ? 'configured' : 'disabled';

  const ok = env.ok && stockfish;
  return NextResponse.json(
    {
      ok,
      env: {
        valid: env.ok,
        missing: env.missing,
        warnings: env.warnings,
      },
      stockfish,
      supabase,
    },
    { status: ok ? 200 : 503 },
  );
}
