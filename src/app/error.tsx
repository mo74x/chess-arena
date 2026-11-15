'use client';

import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {error.message || 'An unexpected error occurred while rendering Chess Arena.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Back to Arena
          </Link>
        </div>
      </div>
    </div>
  );
}
