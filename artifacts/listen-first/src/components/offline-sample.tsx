import { useMemo, useReducer } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import type { StudyEvaluation, StudyMap } from '@workspace/api-client-react';
import { ConceptMap } from '@/components/concept-map';
import { offlineSampleSource as fixture, offlineSampleSteps as steps, initialOfflineSampleState, offlineSampleReducer } from '@/lib/offline-sample';

const arabicLabels: Record<string, string> = { scaling: 'التوسّع', 'load-balancing': 'توزيع الحمل', 'stateless-servers': 'الخوادم عديمة الحالة', sharding: 'تقسيم البيانات', replication: 'تكرار البيانات', caching: 'التخزين المؤقت والاتساق' };
const labels: Record<string, [string, string]> = Object.fromEntries(
  fixture.concepts.map(concept => [concept.id, [arabicLabels[concept.id] ?? concept.label, concept.label]]),
);

export function OfflineSample({ onExit }: { onExit: () => void }) {
  const [{ step, finished }, dispatch] = useReducer(offlineSampleReducer, initialOfflineSampleState);
  const reduced = useReducedMotion();
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
      return {
        id: concept.id, label: labels[concept.id]?.[0] ?? concept.label,
        description: `${labels[concept.id]?.[1] ?? concept.label} · ${entry ? entry.statusLabel : 'Not visited in this sample yet'}`,
        status: 'skipped' as const, evidence: lines || null,
      };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visibleSteps]);
  const sampleAssessments = useMemo(() => visibleSteps.map(item => ({
    conceptId: item.conceptId, confidence: 'high', sourceLineIds: item.lineIds,
    verdict: item.status === 'supported' ? 'supported' : item.status === 'contradicted' ? 'contradicted' : 'partially_understood',
  })) as unknown as StudyEvaluation['assessments'], [visibleSteps]);
  const start = () => dispatch('start');
  const advance = () => dispatch('next');
  const currentEvidence = current?.lineIds.map(id => lineMap.get(id)).filter((line): line is NonNullable<typeof line> => Boolean(line));

  return <section className="sample-shell" data-testid="screen-offline-sample">
    <div className="sample-banner" role="note" data-testid="status-sample-disclaimer">
      <div><strong>OFFLINE SAMPLE · عيّنة توضيحية</strong>This guided illustration is prewritten. It is not evaluated by AI and is not a learner assessment.</div>
      <button type="button" onClick={onExit} data-testid="button-exit-sample">Exit sample</button>
    </div>
    <div className="sample-layout">
      <motion.section className="sample-main" key={`${step}-${finished}`} initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .35 }}>
        <div className="sample-step">{finished ? 'Guided sample · complete' : step < 0 ? 'A small guided tour' : `Illustration ${String(step + 1).padStart(2, '0')} / ${steps.length}`}</div>
        <h1 dir="auto">{fixture.title}</h1>
        <p className="sample-explain" dir="auto">{step < 0
          ? 'جرّب كيف ترتبط الفكرة بالدليل وخريطة المفاهيم. اختر خطوة لعرض شرح مكتوب مسبقًا ومقتطفه من المرجع.'
          : 'Below is a prepared example explanation paired with the exact reference excerpt. The map highlights this topic to show how source context can sit beside an idea.'}</p>
        {current && !finished && <>
          <div className="sample-script" dir="auto" data-testid="sample-script">{current.narration}</div>
          <div className="sample-cite" data-testid="sample-evidence">
            <small>{current.statusLabel.toUpperCase()} · SAMPLE STATUS ONLY</small>
            {currentEvidence?.map(line => <p key={line.id} dir="ltr"><bdi>{line.id} · Slide {line.page}:</bdi> {line.text}</p>)}
          </div>
        </>}
        {finished && <div className="sample-report" data-testid="sample-report">
          <h2>One useful next step</h2>
          <p dir="auto">يتعارض الخطأ المكتوب مسبقًا مع الشريحة 10: الكتابات ما زالت تذهب إلى DBMS؛ التخزين المؤقت لا يحسّن أداءها وفق هذا المرجع. هذه ملاحظة توضيحية ثابتة، وليست تقييمًا لشرح متعلّم.</p>
          <p dir="auto">سؤال للمراجعة: إذا كانت الكتابات تذهب إلى DBMS، فما الذي يسرّعه التخزين المؤقت، وكيف تحافظ على اتساقه بعد تغيّر قاعدة البيانات؟</p>
          <div className="sample-cite"><small>EXACT REFERENCE · SLIDE 10</small>{['S10-02', 'S10-03', 'S10-05'].map(id => {
            const line = lineMap.get(id);
            return line ? <p key={id} dir="ltr"><bdi>{id} · Slide {line.page}:</bdi> {line.text}</p> : null;
          })}</div>
        </div>}
        <div className="sample-controls">
          {step < 0 ? <button className="primary-button" type="button" onClick={start} data-testid="button-sample-begin">Start the sample <ArrowRight size={16} /></button>
            : finished ? <button className="primary-button" type="button" onClick={start} data-testid="button-sample-restart"><RotateCcw size={15} /> Restart guided sample</button>
              : <button className="primary-button" type="button" onClick={advance} data-testid={step + 1 === steps.length ? 'button-sample-finish' : 'button-sample-next'}>
                {step + 1 === steps.length ? 'Finish guided sample' : 'Next concept'} <ArrowRight size={16} />
              </button>}
          {step > 0 && !finished && <button className="secondary-button" type="button" onClick={() => dispatch('back')} data-testid="button-sample-back"><ArrowLeft size={15} /> Previous</button>}
        </div>
      </motion.section>
      <aside className="sample-map" aria-label="Illustrative concept map" data-testid="sample-concept-map">
        <div className="panel-heading"><div><span className="panel-index">SAMPLE</span><h2>خريطة المفاهيم</h2></div><span className="node-count mono">{visibleSteps.length}/{fixture.concepts.length}</span></div>
        <p className="panel-hint" dir="auto">ألوان العينة توضيحية فقط، وليست حكمًا على شرح متعلّم.</p>
        <ConceptMap map={sampleMap} assessments={sampleAssessments} assessed={false} />
        <details className="sample-source-access" data-testid="details-sample-source">
          <summary>المرجع · Reference excerpts ({fixture.referenceLines.length})</summary>
          <ol dir="ltr">{fixture.referenceLines.map(line => <li key={line.id}><bdi>{line.id} · Slide {line.page}:</bdi> {line.text}</li>)}</ol>
        </details>
      </aside>
    </div>
  </section>;
}
