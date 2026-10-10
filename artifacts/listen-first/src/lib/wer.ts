export const WER_DISCLAIMER = 'Normalization removes diacritics, tatweel, punctuation and letter-case, and unifies alef, ya and ta marbuta forms. It does not model dialect, so dialect words count as substitutions. This is one trial against one sentence, not a general accuracy claim.';

export function normalizeTokens(text: string): string[] {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean);
}

export type WerResult = {
  referenceWords: number; observedWords: number; substitutions: number; deletions: number; insertions: number;
  distance: number; wer: number | null;
};

export function computeWer(intended: string, observed: string): WerResult {
  const r = normalizeTokens(intended), o = normalizeTokens(observed);
  const d: number[][] = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(o.length).fill(0)]);
  for (let j = 0; j <= o.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= o.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === o[j - 1] ? 0 : 1));
  }
  let i = r.length, j = o.length, substitutions = 0, deletions = 0, insertions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (r[i - 1] === o[j - 1] ? 0 : 1)) {
      if (r[i - 1] !== o[j - 1]) substitutions++;
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { deletions++; i--; }
    else { insertions++; j--; }
  }
  return {
    referenceWords: r.length, observedWords: o.length, substitutions, deletions, insertions,
    distance: d[r.length][o.length], wer: r.length ? d[r.length][o.length] / r.length : null,
  };
}

export function buildTrialRecord(input: {
  intended: string; observedOriginal: string; scoredText: string; scoredSource: 'browser_recognition' | 'user_edited';
  language: string; date?: Date;
}) {
  return {
    schema: 'hearo-speech-trial-v1',
    date: (input.date ?? new Date()).toISOString(),
    language: input.language,
    intendedText: input.intended,
    observedOriginalText: input.observedOriginal,
    scoredText: input.scoredText,
    scoredTextSource: input.scoredSource,
    wordStats: computeWer(input.intended, input.scoredText),
    audioIncluded: false,
    disclaimer: WER_DISCLAIMER,
  };
}
