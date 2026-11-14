import Link from 'next/link';
import { Suspense } from 'react';
import { en } from '@/lib/i18n/en';
import { ARENA_MODELS } from '@/lib/providers/models.config';
import { listGames } from '@/lib/supabase/games';

async function HistoryContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ model?: string; result?: string }>;
}) {
  const params = await searchParamsPromise;
  const { games, configured } = await listGames({
    model: params.model || undefined,
    result: params.result || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-4">
      <form method="GET" className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
        <select
          name="model"
          defaultValue={params.model ?? ''}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800"
        >
          <option value="">{en.history.filterModel}</option>
          {ARENA_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
        <select
          name="result"
          defaultValue={params.result ?? ''}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800"
        >
          <option value="">{en.history.filterResult}</option>
          <option value="1-0">1-0</option>
          <option value="0-1">0-1</option>
          <option value="1/2-1/2">1/2-1/2</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          Filter
        </button>
      </form>

      {!configured ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
          {en.history.unconfigured}
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
          {en.history.empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Mode</th>
                <th className="px-4 py-2.5">Result</th>
                <th className="px-4 py-2.5">Termination</th>
                <th className="px-4 py-2.5">Illegal Attempts</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {games.map((g) => (
                <tr key={g.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 font-medium text-stone-900">{g.model}</td>
                  <td className="px-4 py-2.5 text-stone-600">{g.mode}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">{g.result}</td>
                  <td className="px-4 py-2.5 text-stone-600">{g.termination}</td>
                  <td className="px-4 py-2.5 font-mono tabular-nums">{g.illegal_attempts}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/games/${g.id}`}
                      className="text-xs font-medium text-teal-700 hover:underline"
                    >
                      {en.history.replay}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; result?: string }>;
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-base font-semibold text-stone-900">
            {en.appName}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-stone-600">
            <Link href="/">{en.nav.play}</Link>
            <Link href="/history" className="font-medium text-stone-900">
              {en.nav.history}
            </Link>
            <Link href="/models">{en.nav.models}</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <h1 className="text-xl font-semibold text-stone-900">{en.history.title}</h1>
        <Suspense fallback={<div className="text-sm text-stone-500">Loading...</div>}>
          <HistoryContent searchParamsPromise={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
