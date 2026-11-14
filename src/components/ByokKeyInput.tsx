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
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor="byok-key-input" className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
          <KeyRound className="h-4 w-4 text-stone-500" />
          <span>{labels.byokTitle}</span>
        </label>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"
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
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-none"
      />
      <p className="mt-1.5 text-xs text-stone-500">{labels.byokHint}</p>
    </div>
  );
}
