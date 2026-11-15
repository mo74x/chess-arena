import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <p className="font-mono text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">404</p>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          The match or page you requested could not be found.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          Back to Arena
        </Link>
      </div>
    </div>
  );
}
