'use client';

import { Languages } from 'lucide-react';
import type { Locale } from '@/lib/i18n';

interface LanguageToggleProps {
  locale: Locale;
  label: string;
  onToggle: (next: Locale) => void;
}

export function LanguageToggle({ locale, label, onToggle }: LanguageToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(locale === 'en' ? 'ar' : 'en')}
      className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-50"
      data-testid="language-toggle"
    >
      <Languages className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
