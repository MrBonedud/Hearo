import type { ConceptAssessment, DemoSource, StudyMap } from '@workspace/api-client-react';

const verdictLabels = {
  supported: 'Supported',
  partially_understood: 'Partially understood',
  contradicted: 'Contradicted',
  not_demonstrated: 'Not demonstrated',
};

export function AssessmentEvidence({ assessments, source, map, fileUrl, onPractice }: {
  assessments: ConceptAssessment[]; source: DemoSource; map: StudyMap; fileUrl: string;
  onPractice: () => void;
}) {
  return <section className="assessment-evidence" aria-label="Source-backed assessment">
    <h2 className="serif">What your explanation demonstrates</h2>
    <p className="panel-hint">Meaning, not word matching. AI explanations are separate from exact source quotations. Partial understanding is not counted as mastery.</p>
    {assessments.map(item => <article className={`assessment-card verdict-${item.verdict}`} key={item.conceptId} data-testid={`assessment-${item.conceptId}`}>
      <div className="assessment-heading">
        <h3>{map.nodes.find(node => node.id === item.conceptId)?.label}</h3>
        <span className="assessment-verdict">{verdictLabels[item.verdict]}</span>
      </div>
      <p className="assessment-confidence">Model confidence: {item.confidence} · not a calibrated score</p>
      {item.studentEvidence && <div><h4>Your words · كلماتك</h4><blockquote dir="auto">{item.studentEvidence}</blockquote></div>}
      <div><h4>AI assessment · not source text</h4><p dir="auto">{item.explanation}</p></div>
      {item.sourceLineIds.map(id => {
        const line = source.referenceLines.find(value => value.id === id);
        return line ? <div className="assessment-citation" key={id} dir="ltr">
          <a href={`${fileUrl}#page=${line.page}`} target="_blank" rel="noreferrer" data-testid={`link-evidence-${item.conceptId}-${id}`}>Source: {id} · Slide {line.page}</a>
          <blockquote>{line.text}</blockquote>
        </div> : null;
      })}
      <div className="assessment-practice"><h4>Practice / clarify</h4><p dir="auto">{item.followUp}</p></div>
      <button className="back-link" type="button" onClick={onPractice} data-testid={`button-practice-${item.conceptId}`}>Revise my explanation →</button>
    </article>)}
  </section>;
}
