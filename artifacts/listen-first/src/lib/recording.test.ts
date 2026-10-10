import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionsFile, checkMediaDuration, dueCaptions, hashesMatch, readCaptionsFile, sha256Hex, validateAudioFile, validateCaptionsFile } from './recording';

const H = 'a'.repeat(64);
const file = buildCaptionsFile([{ atMs: 1000, text: 'one' }, { atMs: 3000, text: 'two' }], 'ar-SA', 4000, H);
const bad = (patch: object) => validateCaptionsFile(JSON.stringify({ ...file, ...patch })).ok;
test('valid file roundtrips', () => { assert.equal(validateCaptionsFile(JSON.stringify(file)).ok, true); });
test('rejects empty, malformed, unordered, wrong schema or kind', () => {
  assert.equal(bad({ captions: [] }), false);
  assert.equal(validateCaptionsFile('nope').ok, false);
  assert.equal(bad({ captions: [{ atMs: 5, text: 'a' }, { atMs: 1, text: 'b' }] }), false);
  assert.equal(bad({ schema: 'x' }), false);
  assert.equal(bad({ kind: 'other' }), false);
});
test('rejects timestamps beyond duration and missing or bad hash', () => {
  assert.equal(bad({ captions: [{ atMs: 4001, text: 'late' }] }), false);
  assert.equal(bad({ audioSha256: undefined }), false);
  assert.equal(bad({ audioSha256: 'xyz' }), false);
});
test('oversized captions file is refused before reading', async () => {
  let read = false;
  const r = await readCaptionsFile({ size: 2 * 1024 * 1024, text: async () => { read = true; return ''; } });
  assert.equal(r.ok, false); assert.equal(read, false);
  const failing = await readCaptionsFile({ size: 5, text: async () => { throw new Error('x'); } });
  assert.equal(failing.ok, false);
});
test('hash pairing detects mismatches', async () => {
  const a = await sha256Hex(new Blob(['abc'])), b = await sha256Hex(new Blob(['abd']));
  assert.equal(a, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hashesMatch(a, a), true); assert.equal(hashesMatch(a, b), false); assert.equal(hashesMatch('', ''), false);
});
test('media duration checks', () => {
  assert.equal(checkMediaDuration(4.5, 4000), null);
  assert.notEqual(checkMediaDuration(60, 4000), null);
  assert.notEqual(checkMediaDuration(700, 700000), null);
  assert.equal(checkMediaDuration(Infinity, 4000), null);
  assert.notEqual(checkMediaDuration(NaN, 4000), null);
});
test('audio limits', () => {
  assert.notEqual(validateAudioFile({ size: 0, type: 'audio/webm' }), null);
  assert.notEqual(validateAudioFile({ size: 30 * 1024 * 1024, type: 'audio/webm' }), null);
  assert.notEqual(validateAudioFile({ size: 10, type: 'text/plain' }), null);
  assert.equal(validateAudioFile({ size: 10, type: 'audio/webm' }), null);
});
test('seek and replay never duplicate captions', () => {
  const seen = new Set<number>();
  const take = (t: number) => { const d = dueCaptions(file.captions, seen, t); d.forEach(i => seen.add(i)); return d; };
  assert.deepEqual(take(500), []); assert.deepEqual(take(1500), [0]);
  assert.deepEqual(take(200), []); assert.deepEqual(take(1500), []);
  assert.deepEqual(take(9000), [1]); assert.deepEqual(take(9000), []);
});
