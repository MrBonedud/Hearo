import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConceptAssessment, DemoSource, StudyMap } from '@workspace/api-client-react';
import { AssessmentEvidence } from './assessment-evidence';
import { FeedbackSoundToggle } from './feedback-sound-toggle';
import { LanguageProvider } from '@/i18n/LanguageContext';
import type { Language } from '@/i18n/translations';

const inLanguage = (language: Language, element: ReactElement) =>
  renderToStaticMarkup(createElement(LanguageProvider, { initialLanguage: language }, element));

const map: StudyMap = {
  topic: 'System Design', edges: [],
  nodes: [{ id: 'load-balancing', label: 'Load balancing', description: 'Distribute requests', status: 'skipped', evidence: null }],
};
const source = {
  referenceLines: [{ id: 'S05-01', page: 5, text: 'Use load balancing to distribute incoming HTTP requests across many front-end servers' }],
} as DemoSource;
const assessment: ConceptAssessment = {
  conceptId: 'load-balancing', verdict: 'contradicted', confidence: 'high',
  studentEvidence: 'كل الطلبات تذهب دائمًا إلى خادم واحد.', sourceLineIds: ['S05-01'],
  explanation: 'The reference describes distributing requests.', followUp: 'How are requests distributed?',
};
const card = (item: ConceptAssessment, language: Language = 'en') => inLanguage(language, createElement(AssessmentEvidence, {
  assessments: [item], source, map, fileUrl: '/api/study/source/file', onPractice() {},
}));

test('contradiction shows supportive correction, exact words, exact source and native expansion', () => {
  const html = card(assessment);
  assert.ok(html.includes('Review this point'));
  assert.ok(html.includes(assessment.studentEvidence!));
  assert.ok(html.includes(source.referenceLines[0].text));
  assert.ok(html.includes('href="/api/study/source/file#page=5"'));
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('Try explaining it again'));
  assert.ok(html.includes('AI assessment · not source text'));
});

test('Arabic interface localises labels but keeps learner words and source text untouched', () => {
  const html = card(assessment, 'ar');
  assert.ok(html.includes('راجع هالنقطة'));
  assert.ok(html.includes('جرّب شرحها مرة ثانية'));
  assert.ok(html.includes('تقييم الذكاء الاصطناعي · مش من نص المصدر'));
  assert.ok(html.includes(assessment.studentEvidence!));
  assert.ok(html.includes(source.referenceLines[0].text));
  assert.ok(html.includes('href="/api/study/source/file#page=5"'));
  assert.ok(html.includes('dir="auto"'));
  assert.ok(!html.includes('Review this point'));
});

test('low-confidence positive and negative verdicts are neutral, not confident red/green', () => {
  for (const verdict of ['supported', 'contradicted'] as const) {
    const html = card({ ...assessment, verdict, confidence: 'low' });
    assert.ok(html.includes('verdict-uncertain'));
    assert.ok(html.includes('Uncertain · check the source'));
    assert.ok(card({ ...assessment, verdict, confidence: 'low' }, 'ar').includes('مش أكيد، راجع المصدر'));
    assert.ok(!html.includes(`verdict-${verdict}`));
    assert.ok(!html.includes('feedback-compare'));
  }
});

test('missing citations never invent a quotation or link', () => {
  const html = card({ ...assessment, sourceLineIds: ['unknown-source'] });
  assert.ok(html.includes('No source citation attached.'));
  assert.ok(card({ ...assessment, sourceLineIds: ['unknown-source'] }, 'ar').includes('ما في اقتباس من المصدر.'));
  assert.ok(!html.includes('#page='));
  assert.ok(!html.includes(source.referenceLines[0].text));
});

test('sound toggle exposes actual pressed state and unsupported browser message', () => {
  const off = inLanguage('en', createElement(FeedbackSoundToggle, { enabled: false, onToggle() {} }));
  assert.ok(off.includes('aria-pressed="false"'));
  assert.ok(off.includes('Feedback sound off'));
  const unavailable = inLanguage('en', createElement(FeedbackSoundToggle, { enabled: true, supported: false, onToggle() {} }));
  assert.ok(unavailable.includes('disabled'));
  assert.ok(unavailable.includes('Sound unavailable'));
  assert.ok(unavailable.includes('aria-pressed="false"'));
  const offArabic = inLanguage('ar', createElement(FeedbackSoundToggle, { enabled: false, onToggle() {} }));
  assert.ok(offArabic.includes('صوت الملاحظات طافي'));
  assert.ok(offArabic.includes('aria-pressed="false"'));
});
