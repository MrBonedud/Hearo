import { scoreReport, scoreReportLines } from './report-score';
import type { DemoSource, StudyEvaluation } from '@workspace/api-client-react';
import { translate, type Language, type TranslationKey, type TranslationVars } from '@/i18n/translations';

const verdictKeys: Record<string, TranslationKey> = {
  supported: 'verdict.supported', contradicted: 'verdict.contradicted', partially_understood: 'verdict.partial',
  not_demonstrated: 'verdict.notDemonstrated', uncertain: 'verdict.uncertain',
};
const confidenceKeys: Record<string, TranslationKey> = { high: 'confidence.high', medium: 'confidence.medium', low: 'confidence.low' };

/** Plain-text report in the interface language. Learner words, AI text and source passages stay as written. */
export function studyReportText(evaluation: StudyEvaluation, transcript: string, source: DemoSource, overflow = '', lang: Language = 'en'): string {
  const t = (key: TranslationKey, vars?: TranslationVars) => translate(lang, key, vars);
  const supported = evaluation.assessments?.filter(item => item.verdict === 'supported').length ?? 0;
  const total = evaluation.nodes.length;
  const lines = [
    t('reportFile.title'), '',
    t('reportFile.source', { title: source.title }), t('reportFile.pdf', { url: source.downloadUrl }),
    t('reportFile.correct', { supported, total }),
    t('reportFile.partialNote'), '',
    ...scoreReportLines(scoreReport(evaluation), lang), '',
    t('reportFile.explanation'), transcript, '', t('reportFile.assessment'),
  ];
  for (const item of evaluation.assessments ?? []) {
    const verdict = verdictKeys[item.verdict] ? t(verdictKeys[item.verdict]) : item.verdict;
    const confidence = confidenceKeys[item.confidence] ? t(confidenceKeys[item.confidence]) : item.confidence;
    lines.push('', `${evaluation.nodes.find(node => node.id === item.conceptId)?.label ?? item.conceptId}: ${verdict}`,
      t('reportFile.confidence', { level: confidence }),
      t('reportFile.youSaid', { text: item.studentEvidence ?? t('reportFile.notDemonstrated') }),
      t('reportFile.aiExplanation', { text: item.explanation }));
    for (const id of item.sourceLineIds) {
      const passage = source.referenceLines.find(line => line.id === id);
      if (passage) lines.push(t('reportFile.reference', { id, page: passage.page, text: passage.text }));
    }
    if (item.followUp) lines.push(t('reportFile.followUp', { text: item.followUp }));
  }
  if (overflow) lines.push('', t('reportFile.overflow', { max: 12000 }), overflow);
  return lines.join('\n');
}
