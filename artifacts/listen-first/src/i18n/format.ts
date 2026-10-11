import type { Language } from './translations';

/** Arabic dates use Jordanian conventions; Western digits are kept in both languages. */
export const LOCALES: Record<Language, string> = { ar: 'ar-JO-u-nu-latn', en: 'en-US' };

export type PluralForms = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };

const pluralRules = new Map<Language, Intl.PluralRules>();
function rulesFor(language: Language) {
  let rules = pluralRules.get(language);
  if (!rules) { rules = new Intl.PluralRules(LOCALES[language]); pluralRules.set(language, rules); }
  return rules;
}

export function formatNumber(language: Language, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALES[language], options).format(value);
}

/**
 * Picks the plural form for `count` using Intl.PluralRules (Arabic has zero, one,
 * two, few, many and other categories). An explicit `zero` form also applies to
 * English, where the CLDR rules would otherwise return "other".
 */
export function formatPlural(language: Language, count: number, forms: PluralForms): string {
  const category = count === 0 && forms.zero !== undefined ? 'zero' : rulesFor(language).select(count);
  const template = forms[category as keyof PluralForms] ?? forms.other;
  return template.replace(/\{count\}/g, formatNumber(language, count));
}

const DATE_TIME: Record<Language, Intl.DateTimeFormatOptions> = {
  ar: { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  en: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' },
};
const DATE_ONLY: Record<Language, Intl.DateTimeFormatOptions> = {
  ar: { day: 'numeric', month: 'long', year: 'numeric' },
  en: { day: 'numeric', month: 'short', year: 'numeric' },
};

export function formatDateTime(language: Language, value: number | string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // dateStyle/timeStyle cannot be combined with individual fields, so they replace the defaults.
  const usesStyles = Boolean(options?.dateStyle || options?.timeStyle);
  return new Intl.DateTimeFormat(LOCALES[language], usesStyles ? options : { ...DATE_TIME[language], ...options }).format(date);
}

export function formatDate(language: Language, value: number | string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALES[language], DATE_ONLY[language]).format(date);
}
