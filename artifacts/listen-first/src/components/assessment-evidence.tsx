import { CheckCircle, CircleHelp, MinusCircle, RotateCcw } from 'lucide-react';
import type { ConceptAssessment, DemoSource, StudyMap } from '@workspace/api-client-react';

const meta = {
  supported: { text: 'صحيح، مدعوم بالمصدر', en: 'Supported by source', Icon: CheckCircle },
  contradicted: { text: 'راجع هذه النقطة', en: 'Contradicted', Icon: RotateCcw },
  partially_understood: { text: 'نحتاج شرحًا أوضح', en: 'Partially understood', Icon: CircleHelp },
  not_demonstrated: { text: 'لم توضّح هذا بعد', en: 'Not demonstrated', Icon: MinusCircle },
} as const;

/** Visual card kind: low-confidence supported or contradicted verdicts are shown as neutral "uncertain". */
export function assessmentKind(item: ConceptAssessment) {
  const low = String(item.confidence) === 'low';
  return low && (item.verdict === 'supported' || item.verdict === 'contradicted') ? 'uncertain' : item.verdict;
}

export function AssessmentEvidence({ assessments, source, map, fileUrl, onPractice, heading, hint }: {
  assessments: ConceptAssessment[]; source: DemoSource; map: StudyMap; fileUrl: string;
  onPractice: () => void; heading?: string; hint?: string;
}) {
  return <section className="assessment-evidence" aria-label={heading ?? 'Source-backed assessment'}>
    <h2>{heading ?? 'What your explanation demonstrates'}</h2>
    <p className="panel-hint">{hint ?? 'Meaning, not word matching. AI explanations are separate from exact source quotations. Partial understanding is not counted as mastery.'}</p>
    {assessments.map(item => {
      const low = String(item.confidence) === 'low';
      const kind = assessmentKind(item);
      const m = meta[item.verdict];
      const Icon = low && kind === 'uncertain' ? CircleHelp : m.Icon;
      const lines = item.sourceLineIds.map(id => ({ id, line: source.referenceLines.find(value => value.id === id) }));
      const found = lines.filter(value => value.line);
      return <article className={`assessment-card verdict-${kind} feedback-card`} key={item.conceptId} data-testid={`assessment-${item.conceptId}`}>
        <div className="assessment-heading">
          <h3>{map.nodes.find(node => node.id === item.conceptId)?.label}</h3>
          <span className="assessment-verdict"><Icon size={15} aria-hidden="true" /> {low && kind === 'uncertain' ? 'غير مؤكد، راجع المصدر' : m.text} <small>· {low && kind === 'uncertain' ? 'Uncertain' : m.en}</small></span>
        </div>
        {item.studentEvidence && <blockquote dir="auto" className="feedback-quote"><span dir="ltr">كلماتك · Your words</span>{item.studentEvidence}</blockquote>}
        <p dir="auto" className="feedback-ai"><strong>AI assessment · not source text: </strong>{item.explanation}</p>
        {item.verdict === 'contradicted' && !low && <div className="feedback-compare">
          <div><span>Source · المصدر</span>{found.length ? <q dir="ltr">{found[0].line!.text}</q> : <em>No source passage attached.</em>}</div>
          <div><span>You · أنت</span><q dir="auto">{item.studentEvidence || '—'}</q></div>
          <button type="button" className="back-link" onClick={onPractice} data-testid={`button-practice-${item.conceptId}`}>جرّب شرحها مرة ثانية · Try explaining it again</button>
        </div>}
        <details className="feedback-details">
          <summary>Citations &amp; confidence · الأدلة والثقة</summary>
          <p className="assessment-confidence">Model confidence: {item.confidence} · not a calibrated score</p>
          {found.length ? found.map(({ id, line }) => <div className="assessment-citation" key={id} dir="ltr">
            <a href={`${fileUrl}#page=${line!.page}`} target="_blank" rel="noreferrer" data-testid={`link-evidence-${item.conceptId}-${id}`}>Source: {id} · Slide {line!.page}</a>
            <blockquote>{line!.text}</blockquote>
          </div>) : <p>No source citation attached.</p>}
          <div className="assessment-practice"><h4>Practice / clarify</h4><p dir="auto">{item.followUp}</p></div>
        </details>
        {!(item.verdict === 'contradicted' && !low) && <button className="back-link" type="button" onClick={onPractice} data-testid={`button-practice-${item.conceptId}`}>Revise my explanation →</button>}
      </article>;
    })}
  </section>;
}
