import assert from 'node:assert/strict';
import test from 'node:test';
import { initialOfflineSampleState, offlineSampleReducer, offlineSampleSource, offlineSampleSteps } from './offline-sample';

test('offline illustration uses only the currently approved English slide source and its objective citations', () => {
  assert.equal(offlineSampleSource.title, 'Large-Scale Web Applications');
  assert.equal(offlineSampleSteps.length, offlineSampleSource.concepts.length);
  for (const step of offlineSampleSteps) {
    const concept = offlineSampleSource.concepts.find(item => item.id === step.conceptId);
    assert.ok(concept);
    for (const id of step.lineIds) {
      assert.ok(concept.supportingLines.includes(id));
      assert.ok(offlineSampleSource.referenceLines.some(line => line.id === id && line.text.trim()));
    }
  }
});

test('the offline tour advances, finishes, restarts and goes back without any provider', () => {
  let state = offlineSampleReducer(initialOfflineSampleState, 'start');
  assert.equal(state.step, 0);
  state = offlineSampleReducer(state, 'next');
  assert.equal(state.step, 1);
  state = offlineSampleReducer(state, 'back');
  assert.equal(state.step, 0);
  for (let index = 0; index < offlineSampleSteps.length; index++) state = offlineSampleReducer(state, 'next');
  assert.deepEqual(state, { step: offlineSampleSteps.length - 1, finished: true });
  assert.deepEqual(offlineSampleReducer(state, 'start'), { step: 0, finished: false });
});

test('the demo keeps one incomplete answer and one misconception without announcing either in the script', () => {
  assert.equal(offlineSampleSteps.filter(step => step.status === 'supported').length, 4);
  assert.equal(offlineSampleSteps.filter(step => step.status === 'partial').length, 1);
  assert.equal(offlineSampleSteps.filter(step => step.status === 'contradicted').length, 1);
  for (const step of offlineSampleSteps) {
    assert.doesNotMatch(step.narration, /خطأ مكتوب مسبقًا|هذا المثال لم يشرح|فهم غلط|مثال جاهز ناقص/);
  }
  const sharding = offlineSampleSteps.find(step => step.conceptId === 'sharding');
  assert.ok(sharding);
  assert.equal(sharding.status, 'partial');
  assert.match(sharding.narration, /Data shard/);
  assert.doesNotMatch(sharding.narration, /تعقيد/);
  assert.ok(sharding.lineIds.includes('S09-04'));
  const caching = offlineSampleSteps.find(step => step.conceptId === 'caching');
  assert.ok(caching);
  assert.equal(caching.status, 'contradicted');
  assert.deepEqual(caching.lineIds, ['S10-03']);
  assert.match(caching.narration, /يسرّع الكتابات تلقائيًا/);
  assert.equal(offlineSampleSource.referenceLines.find(line => line.id === 'S10-03')?.text,
    'Writes must still go to the DBMS, so no performance improvement for them');
});
