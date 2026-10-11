import { translate, type Language, type TranslationKey, type TranslationVars } from './translations';

/**
 * A message kept in state. Keys are translated at render time, so switching
 * language updates messages that are already on screen. `raw` holds text that
 * came from the server, the browser, or a shared library.
 */
export type UiMessage =
  | { key: TranslationKey; vars?: TranslationVars }
  | { raw: string; fallback?: TranslationKey }
  /** For messages assembled from several translated parts (for example plural summaries). */
  | { compose: (language: Language) => string };

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

/** Arabic for known English-only messages from the study server and local libraries. */
const KNOWN_ARABIC: Record<string, string> = {
  // Study server (English-only responses)
  'A verified source and a non-empty explanation are required. Select the PDF again if your session expired.':
    'لازم يكون في مصدر متحقَّق منه وشرح مش فاضي. إذا انتهت جلستك، اختر ملف PDF مرة ثانية.',
  'No AI checker is connected. Your answer is unchanged. Configure OPENAI_API_KEY or GEMINI_API_KEY through Replit Secrets.':
    'ما في أداة تحقق AI موصولة. شرحك ما تغيّر. لازم صاحب المشروع يضبط OPENAI_API_KEY أو GEMINI_API_KEY.',
  'A check is already running or was just requested. Please try again shortly.':
    'في تحقق شغّال أو انطلب قبل شوي. جرّب مرة ثانية بعد لحظات.',
  'The study checker is busy. Please try again shortly.':
    'أداة التحقق مشغولة هلأ. جرّب مرة ثانية بعد لحظات.',
  'The configured AI checkers could not complete this check because of a quota or rate limit. Your text is unchanged; no assessment was recorded. Check provider quota, then retry.':
    'ما قدرنا نكمّل التحقق بسبب حد الاستخدام عند مزوّد AI. نصّك ما تغيّر وما انسجل أي تقييم. تأكد من الرصيد وجرّب مرة ثانية.',
  'The configured AI checkers are temporarily unavailable. Your text is unchanged; no assessment was recorded. Please retry shortly.':
    'أدوات التحقق مش متاحة مؤقتًا. نصّك ما تغيّر وما انسجل أي تقييم. جرّب مرة ثانية بعد شوي.',
  'The answer could not be assessed reliably. Your text is unchanged; please retry. No assessment was recorded.':
    'ما قدرنا نقيّم الشرح بشكل موثوق. نصّك ما تغيّر وما انسجل أي تقييم. جرّب مرة ثانية.',
  'Verification temporarily unavailable. Please try again.':
    'التحقق من الملف مش متاح مؤقتًا. جرّب مرة ثانية.',
  // Captions and audio files
  'The captions file is larger than 1 MB.': 'ملف النص الملتقط أكبر من 1 MB.',
  'The captions file could not be read.': 'ما قدرنا نقرأ ملف النص الملتقط.',
  'The audio duration could not be read.': 'ما قدرنا نقرأ مدة التسجيل.',
  'The audio is longer than the 10 minute limit.': 'التسجيل أطول من الحد المسموح (10 دقائق).',
  'The audio length does not match the captions file, so it is not the recording these captions belong to.':
    'طول التسجيل ما بطابق ملف النص، يعني هاد مش التسجيل اللي بخص هالنص.',
  'The captions file is not valid JSON.': 'ملف النص مش بصيغة JSON صحيحة.',
  'This is not a Hearo captured-captions file.': 'هاد الملف مش ملف نص ملتقط من Hearo.',
  'The captions language is missing or invalid.': 'لغة النص ناقصة أو غير صالحة.',
  'The recorded duration is missing or over the limit.': 'مدة التسجيل ناقصة أو أكثر من الحد.',
  'The captions file has no valid audio SHA-256, so it cannot be matched to an audio file.':
    'ملف النص ما فيه بصمة SHA-256 صالحة للصوت، فما بنقدر نطابقه مع تسجيل.',
  'The captions file has no captions, so there is nothing to replay.': 'ملف النص فاضي، فما في إشي نعيد تشغيله.',
  'The captions file has too many entries.': 'ملف النص فيه عدد كبير جدًا من الأسطر.',
  'A caption entry is malformed or out of time order.': 'في سطر بالنص تالف أو مش مرتّب حسب الوقت.',
  'Choose an audio file recorded by Hearo.': 'اختر ملف صوت مسجّل من Hearo.',
  'The audio file is empty.': 'ملف الصوت فاضي.',
  'The audio file is larger than 25 MB.': 'ملف الصوت أكبر من 25 MB.',
  // Saved study storage and backups
  'SHA-256 is not available in this browser.': 'هالمتصفح ما بدعم SHA-256.',
  'This backup contains too many studies.': 'النسخة الاحتياطية فيها عدد كبير جدًا من الدراسات.',
  'A saved study could not be added to the backup.': 'ما قدرنا نضيف دراسة محفوظة للنسخة الاحتياطية.',
  'This backup would be larger than 10 MB. Export fewer studies at a time.':
    'النسخة الاحتياطية رح تكون أكبر من 10 MB. صدّر عدد أقل من الدراسات كل مرة.',
  'This backup file is larger than 10 MB.': 'ملف النسخة الاحتياطية أكبر من 10 MB.',
  'This file is not a valid Hearo backup.': 'هاد الملف مش نسخة احتياطية صالحة من Hearo.',
  'This file is not a supported Hearo backup.': 'هاد الملف نسخة احتياطية من Hearo بصيغة مش مدعومة.',
  'Saved study storage is unavailable.': 'تخزين الدراسات المحفوظة مش متاح.',
  'The saved study data is invalid.': 'بيانات الدراسة المحفوظة غير صالحة.',
  'The saved study could not be found.': 'ما لقينا الدراسة المحفوظة.',
};

const LABEL_LIMIT = /^Study labels must be (\d+) characters or fewer\.$/;

function sentences(text: string) {
  return text.split(/(?<=[.!?؟])\s+/).map(part => part.trim()).filter(Boolean);
}

/** For "Arabic sentence. English sentence." messages, keep the sentences written in `language`. */
function pickLanguageSentences(text: string, language: Language): string | null {
  const parts = sentences(text);
  const arabic = parts.filter(part => ARABIC.test(part));
  const other = parts.filter(part => !ARABIC.test(part));
  if (!arabic.length || !other.length) return null;
  return (language === 'ar' ? arabic : other).join(' ');
}

/**
 * Localizes text the client did not author. English mode keeps English-only text
 * exactly as received, so server details stay intact. Unknown English text in
 * Arabic mode is shown after a translated summary rather than hidden.
 */
export function localizeExternalMessage(raw: string, language: Language, fallback?: TranslationKey): string {
  const text = raw.trim();
  if (!text) return fallback ? translate(language, fallback) : '';
  const bilingual = pickLanguageSentences(text, language);
  if (bilingual) return bilingual;
  if (language === 'en') return text;
  const known = KNOWN_ARABIC[text];
  if (known) return known;
  const limit = LABEL_LIMIT.exec(text);
  if (limit) return translate('ar', 'storage.labelTooLong', { max: Number(limit[1]) });
  if (ARABIC.test(text) || !LATIN.test(text)) return text;
  return fallback ? `${translate('ar', fallback)} (${text})` : text;
}

export function renderMessage(message: UiMessage, language: Language): string {
  if ('compose' in message) return message.compose(language);
  return 'key' in message
    ? translate(language, message.key, message.vars)
    : localizeExternalMessage(message.raw, language, message.fallback);
}
