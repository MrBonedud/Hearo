import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteSavedStudy, readSavedStudy, writeSavedStudy, type SavedStudySession } from './study-session-storage';
import { studyReportText } from './study-report';
import type { DemoSource } from '@workspace/api-client-react';

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
function draft(): SavedStudySession {
  return { version: 1, savedAt: 123, source: { id: 'test', title: 'Test',
    pdfSha256: '0'.repeat(64), contentSha256: '1'.repeat(64) },
    map: { topic: 'Test', nodes: [], edges: [] }, transcript: 'هذا شرح اصطناعي', evaluation: null,
    phase: 'session', citedPassageIds: [], overflowText: 'كلمات زائدة محفوظة' };
}

test('draft and unassessed overflow survive saving, reading and deletion', () => {
  const storage = memoryStorage();
  const value = draft();
  writeSavedStudy(value, storage);
  const loaded = readSavedStudy(storage);
  assert.equal(loaded.status, 'valid');
  if (loaded.status === 'valid') assert.deepEqual(loaded.value, value);
  deleteSavedStudy(storage);
  assert.equal(readSavedStudy(storage).status, 'empty');
});

test('legacy saved drafts without the optional overflow field still load', () => {
  const storage = memoryStorage();
  const value = draft(); delete value.overflowText;
  writeSavedStudy(value, storage);
  assert.equal(readSavedStudy(storage).status, 'valid');
});

test('newer unassessed draft retains the last report with its original checked text', () => {
  const storage = memoryStorage();
  const value = { ...draft(), transcript: 'new unchecked words', previousReport: {
    transcript: 'original checked words',
    evaluation: { topic: 'Test', nodes: [], edges: [], feedback: [] },
  } };
  writeSavedStudy(value, storage);
  const loaded = readSavedStudy(storage);
  assert.equal(loaded.status, 'valid');
  if (loaded.status === 'valid') {
    assert.equal(loaded.value.transcript, 'new unchecked words');
    assert.equal(loaded.value.evaluation, null);
    assert.deepEqual(loaded.value.previousReport, value.previousReport);
  }
  assert.throws(() => writeSavedStudy({ ...value, previousReport: { transcript: 'old', evaluation: null } } as unknown as SavedStudySession, storage));
});

test('invalid overflow, report without assessment, and corrupt JSON are rejected', () => {
  const storage = memoryStorage();
  assert.throws(() => writeSavedStudy({ ...draft(), overflowText: 1 } as unknown as SavedStudySession, storage));
  assert.throws(() => writeSavedStudy({ ...draft(), phase: 'review' }, storage));
  storage.setItem('hearo.saved-study.v1', 'broken');
  assert.equal(readSavedStudy(storage).status, 'invalid');
  assert.equal(storage.values.size, 0);
});

test('report exports exact quotations, cited slide, follow-up and unassessed overflow', () => {
  const source: DemoSource = { id: 'test', title: 'Test source', author: 'Test author',
    filename: 'test.pdf', downloadUrl: 'https://example.com/test.pdf', byteLength: 1,
    pageCount: 1, scope: 'test', aiAvailable: true, referenceText: 'Exact reference',
    referenceLines: [{ id: 'S01', page: 1, text: 'Exact reference' }] };
  const report = studyReportText({ topic: 'Test', nodes: [], edges: [], feedback: [],
    assessments: [{ conceptId: 'test', verdict: 'partially_understood', confidence: 'high',
      studentEvidence: 'هذا شرح', sourceLineIds: ['S01'], explanation: 'AI explanation',
      followUp: 'What is missing?' }] }, 'هذا شرح', source, 'Unassessed extra words');
  assert.ok(report.includes('You said: هذا شرح'));
  assert.ok(report.includes('Reference S01, slide 1: Exact reference'));
  assert.ok(report.includes('Review question: What is missing?'));
  assert.ok(report.includes('Unassessed extra speech'));
  assert.ok(report.includes('Unassessed extra words'));
  assert.equal(report.includes('sourceToken'), false);
});
