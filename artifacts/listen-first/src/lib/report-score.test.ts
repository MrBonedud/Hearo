import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreReport } from './report-score';

const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id, description: '', status: 'skipped', evidence: null })) as never;
const a = (conceptId: string, verdict: string) => ({ conceptId, verdict }) as never;

test('coverage x accuracy with partial not mastery', () => {
  const s = scoreReport({ nodes, assessments: [a('a', 'supported'), a('b', 'partially_understood'), a('c', 'contradicted'), a('d', 'not_demonstrated')] });
  assert.equal(s.demonstrated, 3); assert.equal(s.coverage, 0.75); assert.equal(s.accuracy, 1 / 3);
  assert.equal(s.score, 25); assert.equal(s.skipped, 1); assert.equal(s.missing, 0);
});
test('zero cases and missing assessments are safe', () => {
  const s = scoreReport({ nodes, assessments: [a('a', 'not_demonstrated'), a('zzz', 'supported')] });
  assert.equal(s.score, 0); assert.equal(s.accuracy, 0); assert.equal(s.missing, 3);
  assert.equal(scoreReport({ nodes: [] as never, assessments: [] }).score, 0);
  assert.equal(scoreReport({ nodes, assessments: undefined }).missing, 4);
});
test('all supported is 100', () => {
  assert.equal(scoreReport({ nodes, assessments: ['a', 'b', 'c', 'd'].map(id => a(id, 'supported')) }).score, 100);
});
