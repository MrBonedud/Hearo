import type { StudyEvaluation } from '@workspace/api-client-react';
import { scoreReport } from '@/lib/report-score';
import { useTranslation } from '@/i18n/useTranslation';

export function ReportScoreCard({ evaluation }: { evaluation: StudyEvaluation }) {
  const { t, number } = useTranslation();
  const s = scoreReport(evaluation);
  return <section className="score-card" aria-label={t('score.regionLabel')} data-testid="card-report-score">
    <div className="score-main"><strong>{number(s.score, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong><span>{t('score.outOf')}</span></div>
    <div className="progress-track score-progress" aria-hidden="true"><span className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, s.score))}%` }} /></div>
    <dl>
      <div><dt>{t('score.coverage')}</dt><dd data-testid="text-score-coverage">{t('score.coverageValue', { done: s.demonstrated, total: s.required })}</dd></div>
      <div><dt>{t('score.accuracy')}</dt><dd data-testid="text-score-accuracy">{t('score.accuracyValue', { done: s.supported, total: s.demonstrated })}</dd></div>
    </dl>
    <ul>
      <li className="s-ok">{t('score.supported', { count: s.supported })}</li>
      <li className="s-partial">{t('score.partial', { count: s.partial })}</li>
      <li className="s-wrong">{t('score.contradicted', { count: s.contradicted })}</li>
      <li className="s-skip">{t('score.skipped', { count: s.skipped })}</li>
      {s.missing > 0 && <li className="s-skip">{t('score.missing', { count: s.missing })}</li>}
    </ul>
    <p>{t('score.note')}</p>
  </section>;
}
