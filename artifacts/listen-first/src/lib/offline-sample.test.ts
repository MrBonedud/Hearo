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

test('the prepared contradiction cites the actual slide statement, not the rejected authored guide', () => {
  const contradiction = offlineSampleSteps.find(step => step.status === 'contradicted');
  assert.ok(contradiction);
  assert.deepEqual(contradiction.lineIds, ['S10-03']);
  assert.equal(offlineSampleSource.referenceLines.find(line => line.id === 'S10-03')?.text,
    'Writes must still go to the DBMS, so no performance improvement for them');
});
