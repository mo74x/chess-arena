import Link from 'next/link';
import { Suspense } from 'react';
import { en } from '@/lib/i18n/en';
import { getModelLeaderboard } from '@/lib/supabase/games';

async function ModelsContent() {
  const { models, configured } = await getModelLeaderboard();

  if (!configured) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
        {en.history.unconfigured}
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
        {en.models.empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
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
        <tbody className="divide-y divide-stone-100">
          {models.map((row) => (
            <tr key={`${row.model}:${row.mode}`} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 font-medium text-stone-900">{row.model}</td>
              <td className="px-4 py-2.5 text-stone-600">{row.mode}</td>
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
  );
}

export default function ModelsPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-base font-semibold text-stone-900">
            {en.appName}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-stone-600">
            <Link href="/">{en.nav.play}</Link>
            <Link href="/history">{en.nav.history}</Link>
            <Link href="/models" className="font-medium text-stone-900">
              {en.nav.models}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{en.models.title}</h1>
          <p className="text-sm text-stone-600">{en.models.subtitle}</p>
        </div>
        <Suspense fallback={<div className="text-sm text-stone-500">Loading...</div>}>
          <ModelsContent />
        </Suspense>
      </main>
    </div>
  );
}
