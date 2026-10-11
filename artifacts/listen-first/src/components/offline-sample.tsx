import { useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import type { StudyEvaluation, StudyMap } from '@workspace/api-client-react';
import { ConceptMap } from '@/components/concept-map';
import { offlineSampleSource as fixture, offlineSampleSteps as steps, initialOfflineSampleState, offlineSampleReducer } from '@/lib/offline-sample';
import { useTranslation } from '@/i18n/useTranslation';

const arabicLabels: Record<string, string> = { scaling: 'التوسّع', 'load-balancing': 'توزيع الحمل', 'stateless-servers': 'الخوادم عديمة الحالة', sharding: 'تقسيم البيانات', replication: 'تكرار البيانات', caching: 'التخزين المؤقت والاتساق' };

export function OfflineSample({ onExit }: { onExit: () => void }) {
  const [{ step, finished }, dispatch] = useReducer(offlineSampleReducer, initialOfflineSampleState);
  const reduced = useReducedMotion();
  const { t, language } = useTranslation();
  // Concept names follow the interface language; the description keeps the other language for reference.
  const labelsFor = (id: string, fallback: string): [string, string] => {
    const arabic = arabicLabels[id] ?? fallback;
    return language === 'ar' ? [arabic, fallback] : [fallback, arabic];
  };
  const visibleSteps = useMemo(() => step < 0 ? [] : steps.slice(0, step + 1), [step]);
  const current = step >= 0 ? steps[step] : null;
  const lineMap = new Map(fixture.referenceLines.map(line => [line.id, line]));
  // Illustrative statuses; relationships come from the same approved source as live sessions.
  const sampleMap: StudyMap = useMemo(() => ({
    topic: fixture.title,
    edges: fixture.edges,
    nodes: fixture.concepts.map(concept => {
      const entry = visibleSteps.find(item => item.conceptId === concept.id);
      const lines = entry ? entry.lineIds.map(id => lineMap.get(id)?.text).filter(Boolean).join('\n') : '';
      const [label, otherLabel] = labelsFor(concept.id, concept.label);
      return {
        id: concept.id, label,
        description: entry ? otherLabel : `${otherLabel} · ${t('sample.notVisited')}`,
        status: 'skipped' as const, evidence: lines || null,
      };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleSteps, language]);
  const sampleAssessments = useMemo(() => visibleSteps.map(item => ({
    conceptId: item.conceptId, confidence: 'high', sourceLineIds: item.lineIds,
    verdict: item.status === 'supported' ? 'supported' : item.status === 'contradicted' ? 'contradicted' : 'partially_understood',
  })) as unknown as StudyEvaluation['assessments'], [visibleSteps]);
  // Each step replaces the panel, including the button that was pressed. Move
  // focus to the step heading (announced with its step count) and bring the
  // panel's start into view so the new step is read from its beginning.
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepLabelId = useId();
  const shownStep = useRef(`${step}-${finished}`);
  useLayoutEffect(() => {
    const key = `${step}-${finished}`;
    if (shownStep.current === key) return;
    shownStep.current = key;
    const panel = panelRef.current;
    if (!panel) return;
    const topInset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const top = panel.getBoundingClientRect().top;
    if (top < topInset || top > window.innerHeight) panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, finished, reduced]);
  const start = () => dispatch('start');
  const advance = () => dispatch('next');
  // The 21 excerpts render only once opened, in the page flow (no inner scroll box).
  const [excerptsOpen, setExcerptsOpen] = useState(false);
  const usedLineIds = new Set<string>(current && !finished ? current.lineIds : []);
  const currentEvidence = current?.lineIds.map(id => lineMap.get(id)).filter((line): line is NonNullable<typeof line> => Boolean(line));

  return <section className="sample-shell" data-testid="screen-offline-sample">
    <div className="sample-banner" role="note" data-testid="status-sample-disclaimer">
      <div><strong>{t('sample.badge')}</strong>{t('sample.disclaimer')}</div>
      <button type="button" onClick={onExit} data-testid="button-exit-sample">{t('sample.exit')}</button>
    </div>
    <div className="sample-layout">
      <motion.section ref={panelRef} className="sample-main" key={`${step}-${finished}`} initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .35 }}>
        <div className="sample-step" id={stepLabelId}>{finished ? t('sample.complete') : step < 0 ? t('sample.tour') : t('sample.stepCount', { current: String(step + 1).padStart(2, '0'), total: steps.length })}</div>
        <h1 ref={headingRef} dir="auto" tabIndex={-1} aria-describedby={stepLabelId}>{fixture.title}</h1>
        <p className="sample-explain">{t(step < 0 ? 'sample.introStart' : 'sample.introStep')}</p>
        {current && !finished && <>
          <div className="sample-script" dir="auto" data-testid="sample-script">{current.narration}</div>
          <div className="sample-cite" data-testid="sample-evidence">
            {currentEvidence?.map(line => <p key={line.id} dir="ltr"><bdi>{t('source.slideRef', { id: line.id, page: line.page })}:</bdi> {line.text}</p>)}
          </div>
        </>}
        {finished && <div className="sample-report" data-testid="sample-report">
          <h2>{t('sample.nextStep')}</h2>
          <p>{t('sample.reportNote')}</p>
          <p>{t('sample.reportQuestion')}</p>
          <div className="sample-cite"><small>{t('sample.exactReference', { page: 10 })}</small>{['S10-02', 'S10-03', 'S10-05'].map(id => {
            const line = lineMap.get(id);
            return line ? <p key={id} dir="ltr"><bdi>{t('source.slideRef', { id, page: line.page })}:</bdi> {line.text}</p> : null;
          })}</div>
        </div>}
        <div className="sample-controls">
          {step < 0 ? <button className="primary-button" type="button" onClick={start} data-testid="button-sample-begin">{t('sample.start')} <ArrowRight size={16} aria-hidden="true" /></button>
            : finished ? <button className="primary-button" type="button" onClick={start} data-testid="button-sample-restart"><RotateCcw size={16} aria-hidden="true" /> {t('sample.restart')}</button>
              : <button className="primary-button" type="button" onClick={advance} data-testid={step + 1 === steps.length ? 'button-sample-finish' : 'button-sample-next'}>
                {t(step + 1 === steps.length ? 'sample.finish' : 'sample.next')} <ArrowRight size={16} aria-hidden="true" />
              </button>}
          {step > 0 && !finished && <button className="secondary-button" type="button" onClick={() => dispatch('back')} data-testid="button-sample-back"><ArrowLeft size={16} aria-hidden="true" /> {t('common.previous')}</button>}
        </div>
      </motion.section>
      <aside className="sample-map" aria-label={t('sample.mapLabel')} data-testid="sample-concept-map">
        <div className="panel-heading"><div><span className="panel-index">{t('sample.mapIndex')}</span><h2>{t('map.heading')}</h2></div><span className="node-count mono" dir="ltr">{visibleSteps.length}/{fixture.concepts.length}</span></div>
        <p className="panel-hint">{t('sample.mapHint')}</p>
        <ConceptMap map={sampleMap} assessments={sampleAssessments} assessed={false} />
        <details className="sample-source-access" data-testid="details-sample-source" onToggle={event => setExcerptsOpen(event.currentTarget.open)}>
          <summary data-testid="button-sample-excerpts">{t('sample.excerpts', { count: fixture.referenceLines.length })}</summary>
          {excerptsOpen && <div className="sample-excerpts">
            <p className="panel-hint">{t('sample.excerptsNote')}</p>
            <ol dir="ltr" data-testid="list-sample-excerpts">{fixture.referenceLines.map(line => {
              const used = usedLineIds.has(line.id);
              return <li key={line.id} className={used ? 'is-used' : undefined} data-testid={`sample-excerpt-${line.id}`}>
                <span className="sample-excerpt-ref"><bdi>{t('source.slideRef', { id: line.id, page: line.page })}</bdi>{used && <em dir="auto">{t('sample.excerptInStep')}</em>}</span>
                <p>{line.text}</p>
              </li>;
            })}</ol>
          </div>}
        </details>
      </aside>
    </div>
  </section>;
}
