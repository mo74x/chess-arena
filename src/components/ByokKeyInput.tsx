'use client';

import { KeyRound, X } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n/en';

interface ByokKeyInputProps {
  value: string;
  onChange: (next: string) => void;
  labels: Dictionary['setup'];
}

export function ByokKeyInput({ value, onChange, labels }: ByokKeyInputProps) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/60">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor="byok-key-input" className="flex items-center gap-1.5 text-sm font-medium text-stone-800 dark:text-stone-200">
          <KeyRound className="h-4 w-4 text-stone-500 dark:text-stone-400" />
          <span>{labels.byokTitle}</span>
        </label>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
          >
            <X className="h-3.5 w-3.5" />
            <span>{labels.clearKey}</span>
          </button>
        ) : null}
      </div>
      <input
        id="byok-key-input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={labels.byokPlaceholder}
        data-testid="byok-key-input"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-teal-500"
      />
      <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{labels.byokHint}</p>
    </div>
  );
}
