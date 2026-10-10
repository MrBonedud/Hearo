import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearSavedStudies, createSavedStudiesBackup, deleteSavedStudy, importSavedStudies,
  matchesVerifiedSource, MAX_STUDY_LABEL_LENGTH, parseSavedStudiesBackup, readSavedStudy,
  readSavedStudies, updateSavedStudyLabel, writeSavedStudy, type SavedStudySession,
} from './study-session-storage';
import { studyReportText } from './study-report';
import type { DemoSource } from '@workspace/api-client-react';

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
function draft(): SavedStudySession {
  return { id: 'study-1', version: 1, savedAt: 123, source: { id: 'test', title: 'Test',
    pdfSha256: '0'.repeat(64), contentSha256: '1'.repeat(64) },
    map: { topic: 'Test', nodes: [], edges: [] }, transcript: 'هذا شرح اصطناعي', evaluation: null,
    phase: 'session', citedPassageIds: [], overflowText: 'كلمات زائدة محفوظة' };
}

test('multiple drafts and reports remain independent, reopenable, and individually deletable', () => {
  const storage = memoryStorage();
  const first = draft();
  const second = { ...draft(), id: 'study-2', savedAt: 456, transcript: 'Second explanation' };
  writeSavedStudy(first, storage);
  writeSavedStudy(second, storage);
  const loaded = readSavedStudies(storage);
  assert.equal(loaded.status, 'valid');
  if (loaded.status === 'valid') {
    assert.deepEqual(loaded.value, [second, first]);
    assert.deepEqual(loaded.value[1], first);
  }
  const remaining = deleteSavedStudy(first.id, storage);
  assert.deepEqual(remaining, [second]);
  const reopened = readSavedStudies(storage);
  assert.equal(reopened.status, 'valid');
  if (reopened.status === 'valid') assert.deepEqual(reopened.value, [second]);
});

test('legacy saved drafts without the optional overflow field still load', () => {
  const storage = memoryStorage();
  const value = draft(); delete value.overflowText;
  writeSavedStudy(value, storage);
  assert.equal(readSavedStudies(storage).status, 'valid');
});

test('legacy single-study saves migrate without losing drafts', () => {
  const storage = memoryStorage();
  const legacy = { ...draft() } as Record<string, unknown>;
  delete legacy.id;
  storage.setItem('hearo.saved-study.v1', JSON.stringify(legacy));
  const result = readSavedStudies(storage);
  assert.equal(result.status, 'valid');
  if (result.status === 'valid') {
    assert.equal(result.value.length, 1);
    assert.equal(result.value[0].id, 'legacy-123');
    assert.equal(result.value[0].transcript, 'هذا شرح اصطناعي');
  }
  assert.equal(storage.values.has('hearo.saved-study.v1'), false);
});

test('labels persist independently without changing source, citations, or sibling studies', () => {
  const storage = memoryStorage();
  const original: SavedStudySession = {
    ...draft(),
    phase: 'review',
    evaluation: {
      topic: 'Test',
      nodes: [],
      edges: [],
      feedback: [],
      assessments: [{
        conceptId: 'concept',
        verdict: 'supported',
        confidence: 'high',
        studentEvidence: 'The explanation',
        sourceLineIds: ['S01'],
        explanation: 'Supported by the source.',
        followUp: 'What follows?',
      }],
    },
    citedPassageIds: ['S01'],
  };
  const sibling = { ...draft(), id: 'study-2', savedAt: 122, transcript: 'A separate draft.' };
  writeSavedStudy(original, storage);
  writeSavedStudy(sibling, storage);

  const labeled = updateSavedStudyLabel(original.id, '  Exam review  ', storage);
  const updated = labeled.find(study => study.id === original.id);
  assert.equal(updated?.label, 'Exam review');
  assert.deepEqual(updated?.source, original.source);
  assert.deepEqual(updated?.citedPassageIds, original.citedPassageIds);
  assert.equal(updated?.savedAt, original.savedAt);
  assert.equal(labeled.find(study => study.id === sibling.id)?.label, undefined);

  const cleared = updateSavedStudyLabel(original.id, '   ', storage);
  assert.equal(cleared.find(study => study.id === original.id)?.label, undefined);
  assert.throws(() => updateSavedStudyLabel(original.id, 'x'.repeat(MAX_STUDY_LABEL_LENGTH + 1), storage));
});

test('unlabeled current and migrated saves remain readable', () => {
  const currentStorage = memoryStorage();
  writeSavedStudy(draft(), currentStorage);
  const current = readSavedStudies(currentStorage);
  assert.equal(current.status, 'valid');
  if (current.status === 'valid') assert.equal(current.value[0].label, undefined);

  const legacyStorage = memoryStorage();
  const legacy = { ...draft() } as Record<string, unknown>;
  delete legacy.id;
  legacyStorage.setItem('hearo.saved-study.v1', JSON.stringify(legacy));
  const migrated = readSavedStudies(legacyStorage);
  assert.equal(migrated.status, 'valid');
  if (migrated.status === 'valid') {
    assert.equal(migrated.value[0].label, undefined);
    assert.equal(migrated.value[0].transcript, 'هذا شرح اصطناعي');
  }
});

test('clear all removes the full history and any legacy copy', () => {
  const storage = memoryStorage();
  writeSavedStudy(draft(), storage);
  storage.setItem('hearo.saved-study.v1', 'legacy');
  clearSavedStudies(storage);
  assert.equal(readSavedStudies(storage).status, 'empty');
  assert.equal(storage.values.size, 0);
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
  storage.setItem('hearo.saved-studies.v2', 'broken');
  assert.equal(readSavedStudies(storage).status, 'invalid');
  assert.equal(storage.values.size, 0);
});

test('browser history persists fingerprints and citation IDs, never transient authorization or PDF data', () => {
  const storage = memoryStorage();
  const evaluation = {
    topic: 'Test',
    nodes: [],
    edges: [],
    feedback: [],
    assessments: [{
      conceptId: 'concept',
      verdict: 'supported' as const,
      confidence: 'high' as const,
      studentEvidence: 'Evidence',
      sourceLineIds: ['S01'],
      explanation: 'Supported by the source.',
      followUp: 'What connects these ideas?',
    }],
  };
  const saved = {
    ...draft(), phase: 'review' as const, evaluation, citedPassageIds: ['S01'],
    sourceToken: 'transient-token', pdfBytes: 'transient-pdf',
  };
  writeSavedStudy(saved as unknown as SavedStudySession, storage);
  const raw = [...storage.values.values()].join('');
  assert.ok(raw.includes(saved.source.pdfSha256));
  assert.ok(raw.includes('S01'));
  assert.equal(raw.includes('sourceToken'), false);
  assert.equal(raw.includes('transient-token'), false);
  assert.equal(raw.includes('pdfBytes'), false);
  assert.equal(raw.includes('transient-pdf'), false);
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

test('backup round-trips multiple drafts and reports without PDF bytes or verification tokens', () => {
  const draftStudy = draft();
  const reportStudy: SavedStudySession = {
    ...draft(),
    id: 'report-1',
    savedAt: 456,
    phase: 'review',
    citedPassageIds: ['S01'],
    evaluation: {
      topic: 'Test',
      nodes: [],
      edges: [],
      feedback: [],
      assessments: [{
        conceptId: 'concept',
        verdict: 'supported',
        confidence: 'high',
        studentEvidence: 'Evidence',
        sourceLineIds: ['S01'],
        explanation: 'Supported.',
        followUp: 'What comes next?',
      }],
    },
  };
  const withTransientValues = {
    ...draftStudy,
    sourceToken: 'do-not-export-token',
    verificationToken: 'do-not-export-verification',
    pdfBytes: 'do-not-export-pdf',
  } as unknown as SavedStudySession;

  const backup = createSavedStudiesBackup([withTransientValues, reportStudy]);
  assert.equal(backup.includes('do-not-export-token'), false);
  assert.equal(backup.includes('do-not-export-verification'), false);
  assert.equal(backup.includes('do-not-export-pdf'), false);
  const restored = parseSavedStudiesBackup(backup);
  assert.equal(restored.rejectedCount, 0);
  assert.equal(restored.studies.length, 2);
  assert.deepEqual(restored.studies[0], draftStudy);
  assert.deepEqual(restored.studies[1], reportStudy);
});

test('backup import skips invalid entries, merges safely, and keeps existing study IDs', () => {
  const backup = JSON.parse(createSavedStudiesBackup([draft()])) as { studies: unknown[] };
  backup.studies.push({ ...draft(), id: 'broken', source: { id: 'test' } });
  const parsed = parseSavedStudiesBackup(JSON.stringify({ format: 'hearo-study-backup', version: 1, studies: backup.studies }));
  assert.equal(parsed.studies.length, 1);
  assert.equal(parsed.rejectedCount, 1);

  const storage = memoryStorage();
  const existing = { ...draft(), transcript: 'Keep the local version.' };
  writeSavedStudy(existing, storage);
  const imported = importSavedStudies([...parsed.studies, { ...draft(), id: 'study-2', savedAt: 456 }], storage);
  assert.equal(imported.addedCount, 1);
  assert.equal(imported.duplicateCount, 1);
  assert.equal(imported.studies.length, 2);
  assert.equal(imported.studies.find(item => item.id === 'study-1')?.transcript, 'Keep the local version.');
  assert.throws(() => parseSavedStudiesBackup(JSON.stringify({ format: 'hearo-study-backup', version: 99, studies: [] })));
});

test('a restored report only matches its original verified source and cited passage IDs', () => {
  const report: SavedStudySession = {
    ...draft(),
    phase: 'review',
    citedPassageIds: ['S01'],
    evaluation: {
      topic: 'Test',
      nodes: [],
      edges: [],
      feedback: [],
      assessments: [{
        conceptId: 'concept',
        verdict: 'supported',
        confidence: 'high',
        studentEvidence: 'Evidence',
        sourceLineIds: ['S01'],
        explanation: 'Supported.',
        followUp: 'What comes next?',
      }],
    },
  };
  const source: DemoSource = {
    id: 'test', title: 'Test source', author: 'Test author', filename: 'test.pdf',
    downloadUrl: 'https://example.com/test.pdf', byteLength: 1, pageCount: 1, scope: 'test',
    aiAvailable: true, referenceText: 'Exact reference',
    referenceLines: [{ id: 'S01', page: 1, text: 'Exact reference' }],
  };
  assert.equal(matchesVerifiedSource(report, report.source, source), true);
  assert.equal(matchesVerifiedSource(report, { ...report.source, pdfSha256: '2'.repeat(64) }, source), false);
  assert.equal(matchesVerifiedSource(report, report.source, { ...source, referenceLines: [] }), false);
});
