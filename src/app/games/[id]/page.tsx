import Link from 'next/link';
import { Suspense } from 'react';
import { ReplayViewer } from '@/components/ReplayViewer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { en } from '@/lib/i18n/en';
import { getGameById } from '@/lib/supabase/games';

async function ReplayContent({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id } = await paramsPromise;
  const { game, moves } = await getGameById(id);

  if (!game) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
        {en.replay.notFound}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm dark:border-stone-800 dark:bg-stone-900">
        <div>
          <span className="font-semibold text-stone-900 dark:text-stone-100">{game.model}</span>
          <span className="mx-2 text-stone-400 dark:text-stone-600">·</span>
          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
            {game.mode}
          </span>
        </div>
        <div className="font-mono text-xs tabular-nums text-stone-700 dark:text-stone-300">
          {game.result} ({game.termination})
        </div>
      </div>

      <ReplayViewer
        moves={moves.map((m) => ({
          ply: m.ply,
          san: m.san,
          fenAfter: m.fen_after,
          by: m.by,
          comment: m.comment,
          latencyMs: m.latency_ms,
          illegalAttempts: m.illegal_attempts,
        }))}
        orientation={game.human_color === 'w' ? 'white' : 'black'}
      />
    </div>
  );
}

export default function GameReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold text-stone-900 dark:text-stone-100">
              {en.appName}
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600 dark:text-stone-400">
              <Link href="/" className="hover:text-stone-900 dark:hover:text-stone-100">
                {en.nav.play}
              </Link>
              <Link href="/history" className="hover:text-stone-900 dark:hover:text-stone-100">
                {en.nav.history}
              </Link>
              <Link href="/models" className="hover:text-stone-900 dark:hover:text-stone-100">
                {en.nav.models}
              </Link>
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">{en.replay.title}</h1>
        <Suspense fallback={<div className="text-sm text-stone-500 dark:text-stone-400">Loading...</div>}>
          <ReplayContent paramsPromise={params} />
        </Suspense>
      </main>
    </div>
  );
}
