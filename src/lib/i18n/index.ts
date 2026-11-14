import { ar } from './ar';
import { en } from './en';

export type Locale = 'en' | 'ar';

export function getDictionary(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
