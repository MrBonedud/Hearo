import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDate, formatPlural, type PluralForms } from './format';
import { detectInitialLanguage, LANGUAGE_STORAGE_KEY } from './LanguageContext';
import { messages, plurals, translate, type TranslationKey } from './translations';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('Arabic and English define the same keys with the same placeholders', () => {
  const enKeys = Object.keys(messages.en).sort();
  assert.deepEqual(Object.keys(messages.ar).sort(), enKeys);
  for (const key of enKeys as TranslationKey[]) {
    assert.ok(messages.ar[key].trim(), `empty Arabic text for ${key}`);
    assert.deepEqual(placeholders(messages.ar[key]), placeholders(messages.en[key]), `placeholder mismatch for ${key}`);
  }
  assert.deepEqual(Object.keys(plurals.ar).sort(), Object.keys(plurals.en).sort());
});

test('Arabic plural categories follow Intl.PluralRules (0, 1, 2, 3–10, 11+)', () => {
  const sessions: PluralForms = { zero: 'ما في جلسات', one: 'جلسة واحدة', two: 'جلستان', few: '{count} جلسات', many: '{count} جلسة', other: '{count} جلسة' };
  assert.equal(formatPlural('ar', 0, sessions), 'ما في جلسات');
  assert.equal(formatPlural('ar', 1, sessions), 'جلسة واحدة');
  assert.equal(formatPlural('ar', 2, sessions), 'جلستان');
  assert.equal(formatPlural('ar', 3, sessions), '3 جلسات');
  assert.equal(formatPlural('ar', 10, sessions), '10 جلسات');
  assert.equal(formatPlural('ar', 11, sessions), '11 جلسة');
  assert.equal(formatPlural('ar', 100, sessions), '100 جلسة');
});

test('English plurals use one/other with an optional zero form', () => {
  const sessions: PluralForms = { zero: 'No sessions', one: '{count} session', other: '{count} sessions' };
  assert.equal(formatPlural('en', 0, sessions), 'No sessions');
  assert.equal(formatPlural('en', 1, sessions), '1 session');
  assert.equal(formatPlural('en', 2, sessions), '2 sessions');
  assert.equal(formatPlural('en', 2, plurals.en.words), '2 words');
  assert.equal(formatPlural('ar', 2, plurals.ar.words), 'كلمتين');
});

test('dates are localised for display with Western digits', () => {
  const date = new Date(Date.UTC(2026, 9, 11, 12));
  assert.equal(formatDate('en', date), 'Oct 11, 2026');
  const arabic = formatDate('ar', date);
  assert.match(arabic, /11/);
  assert.match(arabic, /2026/);
  assert.doesNotMatch(arabic, /[٠-٩]/);
});

test('missing keys fall back to English, then to the key itself', () => {
  const partial = messages.ar as Record<string, string>;
  const saved = partial['nav.home'];
  delete partial['nav.home'];
  try {
    assert.equal(translate('ar', 'nav.home'), messages.en['nav.home']);
  } finally {
    partial['nav.home'] = saved;
  }
  assert.equal(translate('en', 'no.such.key' as TranslationKey), 'no.such.key');
});

function withBrowser(stored: string | null, language: string, run: (storage: Map<string, string>) => void) {
  const storage = new Map<string, string>();
  if (stored !== null) storage.set(LANGUAGE_STORAGE_KEY, stored);
  const globals = globalThis as Record<string, unknown>;
  const previous = { localStorage: globals.localStorage, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  globals.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { language }, configurable: true });
  try {
    run(storage);
  } finally {
    globals.localStorage = previous.localStorage;
    if (previous.navigator) Object.defineProperty(globalThis, 'navigator', previous.navigator);
  }
}

test('first visit detects English browsers; everyone else gets Arabic; a saved choice wins', () => {
  withBrowser(null, 'en-US', () => assert.equal(detectInitialLanguage(), 'en'));
  withBrowser(null, 'en', () => assert.equal(detectInitialLanguage(), 'en'));
  withBrowser(null, 'ar-JO', () => assert.equal(detectInitialLanguage(), 'ar'));
  withBrowser(null, 'fr-FR', () => assert.equal(detectInitialLanguage(), 'ar'));
  withBrowser('ar', 'en-US', () => assert.equal(detectInitialLanguage(), 'ar'));
  withBrowser('en', 'ar-JO', () => assert.equal(detectInitialLanguage(), 'en'));
  withBrowser('klingon', 'en-GB', storage => {
    assert.equal(detectInitialLanguage(), 'en');
    assert.equal(storage.has(LANGUAGE_STORAGE_KEY), false, 'invalid saved value is removed');
  });
});
