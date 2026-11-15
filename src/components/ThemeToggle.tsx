'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'chess-arena:theme';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener('chess-arena-theme', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('chess-arena-theme', callback);
  };
}

function getIsDark(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('dark');
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getIsDark, () => true);

  const toggle = () => {
    const nextDark = !isDark;
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new Event('chess-arena-theme'));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
