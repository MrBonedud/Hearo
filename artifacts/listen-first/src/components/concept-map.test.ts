import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StudyMap, StudyEvaluation } from '@workspace/api-client-react';
import { ConceptMap } from './concept-map';
import { OfflineSample } from './offline-sample';

const map: StudyMap = {
  topic: 'Reference',
  nodes: ['a', 'b', 'c'].map(id => ({ id, label: `Concept ${id}`, description: 'Source objective', status: 'skipped', evidence: null })),
  edges: [{ from: 'a', to: 'b', label: 'depends on' }],
};
function assessment(id: string, verdict: string, confidence = 'high') {
  return { conceptId: id, verdict, confidence, studentEvidence: 'My words', sourceLineIds: ['S01'], explanation: 'Explanation', followUp: 'Try again' };
}
function render(items?: ReturnType<typeof assessment>[], assessed?: boolean) {
  return renderToStaticMarkup(createElement(ConceptMap, { map, assessments: items as StudyEvaluation['assessments'], assessed }));
}

test('map draws supplied arrows and exposes relationship text without numbered cards', () => {
  const html = render();
  assert.match(html, /<svg/);
  assert.match(html, /marker-end=/);
  assert.match(html, /Directed concept relationships/);
  assert.doesNotMatch(html, /concept-node-index|concept-edge-list/);
  assert.match(html, /aria-controls=/);
  assert.match(html, /Concept graph, scroll sideways/);
});

test('supported and contradicted become full-node status classes, skipped stays grey', () => {
  const html = render([assessment('a', 'supported'), assessment('b', 'contradicted'), assessment('c', 'not_demonstrated')]);
  assert.match(html, /concept-node status-understood/);
  assert.match(html, /concept-node status-incorrect/);
  assert.match(html, /concept-node status-skipped/);
});

test('low confidence and partial never appear as confident green or red', () => {
  const html = render([assessment('a', 'supported', 'low'), assessment('b', 'contradicted', 'low'), assessment('c', 'partially_understood')]);
  assert.doesNotMatch(html, /concept-node status-understood|concept-node status-incorrect/);
  assert.equal((html.match(/concept-node status-partial/g) || []).length, 1);
  assert.equal((html.match(/concept-node status-uncertain/g) || []).length, 2);
  assert.match(html, /Uncertain/);
});

test('low-confidence partial remains uncertain rather than confirmed yellow', () => {
  const html = render([assessment('a', 'partially_understood', 'low')]);
  assert.match(html, /concept-node status-uncertain/);
  assert.doesNotMatch(html, /concept-node status-partial/);
});

test('unchecked concepts remain distinguishable from evaluated omissions', () => {
  assert.match(render(), /Not assessed yet/);
  assert.match(render(undefined, true), /Not demonstrated/);
});

test('offline sample uses actual source relationships and preserves its disclaimer', () => {
  const html = renderToStaticMarkup(createElement(OfflineSample, { onExit: () => undefined }));
  assert.match(html, /It is not evaluated by AI/);
  assert.match(html, /marker-end=/);
  assert.match(html, /Directed concept relationships/);
});
