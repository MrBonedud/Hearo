import assert from 'node:assert/strict';
import test from 'node:test';
import { hasPreviousReportForDraft } from './previous-report';

const checked = 'Load balancing spreads requests across servers.';

test('no kept report never shows the previous-report notice', () => {
  assert.equal(hasPreviousReportForDraft(undefined, ''), false);
  assert.equal(hasPreviousReportForDraft(undefined, checked), false);
});

test('a report of the exact current draft is not a previous report', () => {
  assert.equal(hasPreviousReportForDraft({ transcript: checked }, checked), false);
  // Surrounding whitespace is not a different explanation.
  assert.equal(hasPreviousReportForDraft({ transcript: `${checked} ` }, `  ${checked}\n`), false);
});

test('a draft that moved past, away from, or below the checked words has a previous report', () => {
  assert.equal(hasPreviousReportForDraft({ transcript: checked }, `${checked} It also improves availability.`), true);
  assert.equal(hasPreviousReportForDraft({ transcript: checked }, 'A completely different explanation.'), true);
  assert.equal(hasPreviousReportForDraft({ transcript: checked }, 'Load balancing'), true);
  assert.equal(hasPreviousReportForDraft({ transcript: checked }, ''), true);
});

test('an empty kept transcript is never offered as a previous report', () => {
  assert.equal(hasPreviousReportForDraft({ transcript: '   ' }, 'New words.'), false);
});
