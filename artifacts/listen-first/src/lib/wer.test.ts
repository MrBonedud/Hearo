import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrialRecord, computeWer, normalizeTokens } from './wer';

test('normalizes diacritics, alef forms and punctuation', () => {
  assert.deepEqual(normalizeTokens('أَهْلاً، بِكَ!'), ['اهلا', 'بك']);
});
test('counts substitutions, deletions, insertions', () => {
  const r = computeWer('a b c d', 'a x c d e');
  assert.equal(r.substitutions, 1); assert.equal(r.deletions, 0); assert.equal(r.insertions, 1);
  assert.equal(r.wer, 0.5);
  const del = computeWer('a b c', 'a c');
  assert.equal(del.deletions, 1); assert.equal(del.wer, 1 / 3);
});
test('empty reference has no WER; identical is zero', () => {
  assert.equal(computeWer('', 'abc').wer, null);
  assert.equal(computeWer('', 'abc').insertions, 1);
  assert.equal(computeWer('مرحبا بكم', 'مرحبًا بكم').wer, 0);
});
test('trial record has no audio and marks source', () => {
  const t = buildTrialRecord({ intended: 'a b', observedOriginal: 'a', scoredText: 'a', scoredSource: 'browser_recognition', language: 'ar-SA', date: new Date(0) });
  assert.equal(t.audioIncluded, false); assert.equal(t.wordStats.deletions, 1); assert.equal(t.date, '1970-01-01T00:00:00.000Z');
});
