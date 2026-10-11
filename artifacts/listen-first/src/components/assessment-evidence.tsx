import { ArrowRight, CheckCircle, CircleHelp, MinusCircle, RotateCcw } from 'lucide-react';
import type { ConceptAssessment, DemoSource, StudyMap } from '@workspace/api-client-react';
import type { TranslationKey } from '@/i18n/translations';
import { useTranslation } from '@/i18n/useTranslation';

const meta = {
  supported: { label: 'verdict.supported', Icon: CheckCircle },
  contradicted: { label: 'verdict.contradicted', Icon: RotateCcw },
  partially_understood: { label: 'verdict.partial', Icon: CircleHelp },
  not_demonstrated: { label: 'verdict.notDemonstrated', Icon: MinusCircle },
} as const satisfies Record<ConceptAssessment['verdict'], { label: TranslationKey; Icon: unknown }>;

const confidenceKeys: Record<string, TranslationKey> = { high: 'confidence.high', medium: 'confidence.medium', low: 'confidence.low' };

/** Visual card kind: low-confidence supported or contradicted verdicts are shown as neutral "uncertain". */
export function assessmentKind(item: ConceptAssessment) {
  const low = String(item.confidence) === 'low';
  return low && (item.verdict === 'supported' || item.verdict === 'contradicted') ? 'uncertain' : item.verdict;
}

export function AssessmentEvidence({ assessments, source, map, fileUrl, onPractice, heading, hint }: {
  assessments: ConceptAssessment[]; source: DemoSource; map: StudyMap; fileUrl: string;
  onPractice: () => void; heading?: string; hint?: string;
}) {
  const { t, dir } = useTranslation();
  return <section className="assessment-evidence" aria-label={heading ?? t('evidence.regionLabel')}>
    <h2>{heading ?? t('evidence.heading')}</h2>
    <p className="panel-hint">{hint ?? t('evidence.hint')}</p>
    {assessments.map(item => {
      const low = String(item.confidence) === 'low';
      const kind = assessmentKind(item);
      const m = meta[item.verdict];
      const uncertain = low && kind === 'uncertain';
      const Icon = uncertain ? CircleHelp : m.Icon;
      const lines = item.sourceLineIds.map(id => ({ id, line: source.referenceLines.find(value => value.id === id) }));
      const found = lines.filter(value => value.line);
      const confidence = confidenceKeys[String(item.confidence)];
      return <article className={`assessment-card verdict-${kind} feedback-card`} key={item.conceptId} data-testid={`assessment-${item.conceptId}`}>
        <div className="assessment-heading">
          <h3 dir="auto">{map.nodes.find(node => node.id === item.conceptId)?.label}</h3>
          <span className="assessment-verdict"><Icon size={16} aria-hidden="true" /> {t(uncertain ? 'verdict.uncertain' : m.label)}</span>
        </div>
        {item.studentEvidence && <blockquote dir="auto" className="feedback-quote"><span dir={dir}>{t('evidence.yourWords')}</span>{item.studentEvidence}</blockquote>}
        <p dir="auto" className="feedback-ai"><strong dir={dir}>{t('evidence.aiLabel')} </strong>{item.explanation}</p>
        {item.verdict === 'contradicted' && !low && <div className="feedback-compare">
          <div><span>{t('evidence.source')}</span>{found.length ? <q dir="auto">{found[0].line!.text}</q> : <em>{t('evidence.noPassage')}</em>}</div>
          <div><span>{t('evidence.you')}</span><q dir="auto">{item.studentEvidence || '—'}</q></div>
          <button type="button" className="back-link" onClick={onPractice} data-testid={`button-practice-${item.conceptId}`}>{t('evidence.tryAgain')}</button>
        </div>}
        <details className="feedback-details">
          <summary>{t('evidence.detailsSummary')}</summary>
          <p className="assessment-confidence">{t('evidence.confidence', { level: confidence ? t(confidence) : String(item.confidence) })}</p>
          {found.length ? found.map(({ id, line }) => <div className="assessment-citation" key={id}>
            <a href={`${fileUrl}#page=${line!.page}`} target="_blank" rel="noreferrer" data-testid={`link-evidence-${item.conceptId}-${id}`}>{t('evidence.citation', { id, page: line!.page })}</a>
            <blockquote dir="auto">{line!.text}</blockquote>
          </div>) : <p>{t('evidence.noCitation')}</p>}
          <div className="assessment-practice"><h4>{t('evidence.practice')}</h4><p dir="auto">{item.followUp}</p></div>
        </details>
        {!(item.verdict === 'contradicted' && !low) && <button className="back-link" type="button" onClick={onPractice} data-testid={`button-practice-${item.conceptId}`}>{t('evidence.revise')} <ArrowRight size={16} aria-hidden="true" /></button>}
      </article>;
    })}
  </section>;
}
