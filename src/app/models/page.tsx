import Link from 'next/link';
import { Suspense } from 'react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { en } from '@/lib/i18n/en';
import { getModelLeaderboard, getPlayerScoreboard } from '@/lib/supabase/games';

async function ModelsContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ model?: string; mode?: string }>;
}) {
  const params = await searchParamsPromise;
  const selectedModel = params.model || undefined;
  const selectedMode = params.mode || 'pure';

  const [{ models, configured }, { entries: scoreboard }] = await Promise.all([
    getModelLeaderboard(),
    getPlayerScoreboard({ model: selectedModel, mode: selectedMode }),
  ]);

  if (!configured) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
        {en.history.unconfigured}
      </div>
    );
  }

  const distinctModels = Array.from(new Set(models.map((m) => m.model)));

  return (
    <div className="space-y-8">
      {/* Top Players vs Models (3/1/0 Scoreboard) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              {en.models.scoreboardTitle}
            </h2>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              {en.models.scoreboardSubtitle}
            </p>
          </div>

          <form method="GET" className="flex flex-wrap items-center gap-2">
            <select
              name="model"
              defaultValue={selectedModel ?? ''}
              className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            >
              <option value="">{en.models.allModels}</option>
              {distinctModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              name="mode"
              defaultValue={selectedMode}
              className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            >
              <option value="pure">Pure (Ranked)</option>
              <option value="assisted">Assisted</option>
              <option value="engine">Engine</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              Filter
            </button>
          </form>
        </div>

        {scoreboard.length === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
            {en.models.empty}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <table className="w-full text-left text-sm" data-testid="player-scoreboard-table">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500 dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-400">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">{en.models.player}</th>
                  <th className="px-4 py-2.5">{en.models.model}</th>
                  <th className="px-4 py-2.5">{en.models.games}</th>
                  <th className="px-4 py-2.5">{en.models.playerWins}</th>
                  <th className="px-4 py-2.5">{en.models.draws}</th>
                  <th className="px-4 py-2.5">{en.models.playerLosses}</th>
                  <th className="px-4 py-2.5">{en.models.winRate}</th>
                  <th className="px-4 py-2.5">{en.models.points}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {scoreboard.map((row, index) => {
                  const winRate =
                    row.games_played > 0
                      ? Math.round((row.wins / row.games_played) * 100)
                      : 0;
                  return (
                    <tr
                      key={`${row.player_token_hash}:${row.model}:${row.mode}`}
                      className="hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-stone-500 dark:text-stone-400">
                        {index + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar avatarId={row.player_avatar} size="sm" />
                          <span className="font-medium text-stone-900 dark:text-stone-100">
                            {row.player_handle}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-stone-700 dark:text-stone-300">
                        {row.model}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{row.games_played}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {row.wins}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-stone-600 dark:text-stone-400">
                        {row.draws}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-rose-700 dark:text-rose-400">
                        {row.losses}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums">{winRate}%</td>
                      <td className="px-4 py-2.5 font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                        {row.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Model Overview */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          Model Aggregate Stats
        </h2>
        {models.length === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
            {en.models.empty}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500 dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-400">
                <tr>
                  <th className="px-4 py-2.5">{en.models.model}</th>
                  <th className="px-4 py-2.5">{en.models.mode}</th>
                  <th className="px-4 py-2.5">{en.models.games}</th>
                  <th className="px-4 py-2.5">{en.models.wins}</th>
                  <th className="px-4 py-2.5">{en.models.draws}</th>
                  <th className="px-4 py-2.5">{en.models.losses}</th>
                  <th className="px-4 py-2.5">{en.models.avgIllegal}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {models.map((row) => (
                  <tr key={`${row.model}:${row.mode}`} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="px-4 py-2.5 font-medium text-stone-900 dark:text-stone-100">
                      {row.model}
                    </td>
                    <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">{row.mode}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{row.games_count}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{row.model_wins}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{row.draws}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{row.model_losses}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{row.avg_illegal_attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; mode?: string }>;
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
              <Link href="/models" className="font-medium text-stone-900 dark:text-stone-100">
                {en.nav.models}
              </Link>
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            {en.models.title}
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">{en.models.subtitle}</p>
        </div>
        <Suspense
          fallback={<div className="text-sm text-stone-500 dark:text-stone-400">Loading...</div>}
        >
          <ModelsContent searchParamsPromise={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
