import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechSession, readSpeechEvent, wordsAfterRepeat, type SpeechResultEvent } from './speech-results';

// Builds a Web Speech API style event: the browser re-sends the whole growing
// results list, and `resultIndex` marks the first entry that changed.
const event = (resultIndex: number, ...items: Array<[string, boolean]>): SpeechResultEvent => ({
  resultIndex,
  results: items.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
});

test('interim words are reported separately and never accepted as final', () => {
  const session = createSpeechSession();
  assert.deepEqual(readSpeechEvent(session, event(0, ['The database', false])), { finalText: '', interim: 'The database' });
  assert.deepEqual(readSpeechEvent(session, event(0, ['The database store', false])), { finalText: '', interim: 'The database store' });
  assert.deepEqual(readSpeechEvent(session, event(0, ['The database store the user information.', true])),
    { finalText: 'The database store the user information.', interim: '' });
});

test('a final re-sent in later events is accepted once and order is kept', () => {
  const session = createSpeechSession();
  const accepted: string[] = [];
  const take = (e: SpeechResultEvent) => { const { finalText } = readSpeechEvent(session, e); if (finalText) accepted.push(finalText); };
  take(event(0, ['First idea.', true]));
  // Overlapping event: resultIndex points back at an already accepted final.
  take(event(0, ['First idea.', true], ['Second', false]));
  take(event(1, ['First idea.', true], ['Second idea.', true]));
  // Exact repeat of the same event.
  take(event(1, ['First idea.', true], ['Second idea.', true]));
  take(event(2, ['First idea.', true], ['Second idea.', true], ['Third idea.', true]));
  assert.deepEqual(accepted, ['First idea.', 'Second idea.', 'Third idea.']);
});

test('cumulative finals (each final repeats the phrase so far) add only the new words', () => {
  const session = createSpeechSession();
  const parts = [
    readSpeechEvent(session, event(0, ['caching', true])).finalText,
    readSpeechEvent(session, event(1, ['caching', true], ['caching speeds up', true])).finalText,
    readSpeechEvent(session, event(2, ['caching', true], ['caching speeds up', true], ['Caching speeds up reads.', true])).finalText,
  ];
  assert.deepEqual(parts, ['caching', 'speeds up', 'reads.']);
  assert.equal(parts.filter(Boolean).join(' '), 'caching speeds up reads.');
});

test('a duplicate final at a new index adds nothing; different text is kept whole', () => {
  const session = createSpeechSession();
  assert.equal(readSpeechEvent(session, event(0, ['Sharding splits data.', true])).finalText, 'Sharding splits data.');
  assert.equal(readSpeechEvent(session, event(1, ['Sharding splits data.', true], ['sharding splits data', true])).finalText, '');
  assert.equal(readSpeechEvent(session, event(2, ['x', true], ['x', true], ['Replication copies it.', true])).finalText, 'Replication copies it.');
});

test('Arabic finals are compared by words, ignoring punctuation', () => {
  assert.equal(wordsAfterRepeat('موازنة الحمل', 'موازنة الحمل، بتوزع الطلبات'), 'بتوزع الطلبات');
  assert.equal(wordsAfterRepeat('موازنة الحمل', 'التخزين المؤقت'), 'التخزين المؤقت');
});

test('empty, missing and blank results are skipped without breaking later ones', () => {
  const session = createSpeechSession();
  const sparse: SpeechResultEvent = { resultIndex: 0, results: [Object.assign([], { isFinal: true }), Object.assign([{ transcript: '  ' }], { isFinal: true }), Object.assign([{ transcript: 'Kept.' }], { isFinal: true })] as never };
  assert.deepEqual(readSpeechEvent(session, sparse), { finalText: 'Kept.', interim: '' });
  assert.deepEqual(readSpeechEvent(session, sparse), { finalText: '', interim: '' });
});

test('a new session starts fresh, so resumed speech is never mistaken for a repeat of an old session', () => {
  const first = createSpeechSession();
  readSpeechEvent(first, event(0, ['Load balancing.', true]));
  const resumed = createSpeechSession();
  assert.equal(readSpeechEvent(resumed, event(0, ['Load balancing again.', true])).finalText, 'Load balancing again.');
});
