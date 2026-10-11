// Turns Web Speech API result events into text that is accepted exactly once.
//
// The browser keeps a growing `results` list per recognition session and
// re-sends it with every event. Finals must therefore be consumed by index, and
// some recognisers (notably Chrome on Android) also send each final as the whole
// phrase so far ("caching", then "caching speeds up reads"). Only words that were
// not already accepted are returned; interim words are reported separately and
// never become part of the learner's editable text until they are final.

export type SpeechResultLike = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
export type SpeechResultEvent = { resultIndex: number; results: ArrayLike<SpeechResultLike> };

/** Bookkeeping for one recognition session (one `start()` of one recogniser). */
export type SpeechSession = { consumed: Set<number>; lastFinal: string };
export const createSpeechSession = (): SpeechSession => ({ consumed: new Set(), lastFinal: '' });

const splitWords = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const comparable = (word: string) => word.toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, '');

/** Words of `next` that come after a repeated copy of `previous`; all of `next` when it does not repeat it. */
export function wordsAfterRepeat(previous: string, next: string) {
  const earlier = splitWords(previous).map(comparable);
  const incoming = splitWords(next);
  if (!earlier.length || incoming.length < earlier.length) return incoming.join(' ');
  for (let index = 0; index < earlier.length; index++) {
    if (comparable(incoming[index]) !== earlier[index]) return incoming.join(' ');
  }
  return incoming.slice(earlier.length).join(' ');
}

/** Reads one result event. Mutates `session` so the same final is never returned twice. */
export function readSpeechEvent(session: SpeechSession, event: SpeechResultEvent) {
  const finalized: string[] = [];
  const provisional: string[] = [];
  for (let index = Math.max(0, event.resultIndex); index < event.results.length; index++) {
    const result = event.results[index];
    const text = result?.[0]?.transcript?.trim() ?? '';
    if (result?.isFinal) {
      if (session.consumed.has(index)) continue;
      session.consumed.add(index);
      if (!text) continue;
      const fresh = wordsAfterRepeat(session.lastFinal, text);
      session.lastFinal = text;
      if (fresh) finalized.push(fresh);
    } else if (text) provisional.push(text);
  }
  return { finalText: finalized.join(' '), interim: provisional.join(' ') };
}
