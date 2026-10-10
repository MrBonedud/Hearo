import test from 'node:test';
import assert from 'node:assert/strict';
import { AssessmentQueue, isCheckedPrefix } from './assessment-queue';

test('identical in-flight snapshots coalesce and completed results are reused', async () => {
  let calls = 0;
  const queue = new AssessmentQueue(async (input: string) => { calls++; return input.toUpperCase(); }, 0);
  const first = queue.request('a', 'a');
  assert.equal(queue.request('a', 'a'), first);
  assert.equal(await first, 'A');
  assert.equal(await queue.request('a', 'a'), 'A');
  assert.equal(calls, 1);
  await queue.request('a', 'a', true);
  assert.equal(calls, 2);
});

test('a final snapshot waits for the earlier request and respects request spacing', async () => {
  let clock = 1000;
  const waits: number[] = [];
  const calls: string[] = [];
  let release!: (value: string) => void;
  const firstResult = new Promise<string>(resolve => { release = resolve; });
  const queue = new AssessmentQueue((input: string) => {
    calls.push(input);
    return input === 'old' ? firstResult : Promise.resolve(input);
  }, 8000, () => clock, async ms => { waits.push(ms); clock += ms; });
  const old = queue.request('old', 'old');
  const latest = queue.request('latest', 'latest');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, ['old']);
  release('old-result');
  assert.equal(await old, 'old-result');
  assert.equal(await latest, 'latest');
  assert.deepEqual(calls, ['old', 'latest']);
  assert.deepEqual(waits, [8000]);
});

test('a failed check does not block later snapshots or become a cached verdict', async () => {
  let calls = 0;
  const queue = new AssessmentQueue(async (input: string) => {
    calls++;
    if (calls === 1) throw new Error('provider unavailable');
    return input;
  }, 0);
  await assert.rejects(queue.request('a', 'a'), /provider unavailable/);
  assert.equal(await queue.request('a', 'a'), 'a');
  assert.equal(calls, 2);
});

test('prefix feedback is valid for appended words, never for replacement or partial-word edits', () => {
  assert.equal(isCheckedPrefix('The cache helps reads.', 'The cache helps reads. Writes still go to the DBMS.'), true);
  assert.equal(isCheckedPrefix('The cache helps reads.', 'The cache bypasses writes.'), false);
  assert.equal(isCheckedPrefix('scale', 'scaleless'), false);
  assert.equal(isCheckedPrefix('', 'anything'), false);
});
