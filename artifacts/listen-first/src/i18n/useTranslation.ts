import { useContext, useMemo } from 'react';
import { LanguageContext } from './LanguageContext';
import { formatDate, formatDateTime, formatNumber, formatPlural } from './format';
import { renderMessage, type UiMessage } from './messages';
import { plurals, translate, type PluralKey, type TranslationKey, type TranslationVars } from './translations';

export function useTranslation() {
  const { language, setLanguage } = useContext(LanguageContext);
  return useMemo(() => ({
    language,
    setLanguage,
    dir: language === 'ar' ? 'rtl' as const : 'ltr' as const,
    t: (key: TranslationKey, vars?: TranslationVars) => translate(language, key, vars),
    plural: (key: PluralKey, count: number) => formatPlural(language, count, plurals[language][key]),
    message: (value: UiMessage) => renderMessage(value, language),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(language, value, options),
    dateTime: (value: number | string | Date, options?: Intl.DateTimeFormatOptions) => formatDateTime(language, value, options),
    date: (value: number | string | Date) => formatDate(language, value),
  }), [language, setLanguage]);
}

export type Translator = ReturnType<typeof useTranslation>;
