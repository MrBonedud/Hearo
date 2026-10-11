import { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { isLanguage, translate, type Language } from './translations';

export const LANGUAGE_STORAGE_KEY = 'hearo.lang';
export const DEFAULT_LANGUAGE: Language = 'ar';

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void };

export const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => undefined,
});

/** A saved choice wins; unreadable or invalid values are ignored (and invalid ones removed). */
export function readStoredLanguage(): Language | null {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
    if (stored === null) return null;
    if (isLanguage(stored)) return stored;
    globalThis.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch { /* storage blocked: fall back to detection */ }
  return null;
}

/** First visit: English browsers get English, everyone else gets the Arabic default. */
export function detectInitialLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;
  const browser = typeof navigator === 'undefined' ? '' : navigator.language ?? '';
  return /^en(-|$)/i.test(browser) ? 'en' : DEFAULT_LANGUAGE;
}

function setMeta(selector: string, content: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content);
}

export function applyDocumentLanguage(language: Language) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = language;
  root.dir = language === 'ar' ? 'rtl' : 'ltr';
  const title = translate(language, 'meta.title');
  const description = translate(language, 'meta.description');
  document.title = title;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);
  setMeta('meta[property="og:locale"]', language === 'ar' ? 'ar_JO' : 'en_US');
}

export function LanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: Language }) {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage ?? detectInitialLanguage());

  // Layout effect: lang/dir/title change before the browser paints, so there is no LTR flash.
  useLayoutEffect(() => { applyDocumentLanguage(language); }, [language]);

  // Keep other open tabs in step with an explicit choice.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY && isLanguage(event.newValue)) setLanguageState(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* choice still applies for this visit */ }
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
