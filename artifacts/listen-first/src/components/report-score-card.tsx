import type { StudyEvaluation } from '@workspace/api-client-react';
import { scoreReport } from '@/lib/report-score';

export function ReportScoreCard({ evaluation }: { evaluation: StudyEvaluation }) {
  const s = scoreReport(evaluation);
  return <section className="score-card" aria-label="Local rubric score" data-testid="card-report-score">
    <div className="score-main"><strong>{s.score.toFixed(1)}</strong><span>/ 100 local rubric score</span></div>
    <dl>
      <div><dt>Coverage</dt><dd data-testid="text-score-coverage">{s.demonstrated}/{s.required} demonstrated</dd></div>
      <div><dt>Accuracy</dt><dd data-testid="text-score-accuracy">{s.supported}/{s.demonstrated} supported</dd></div>
    </dl>
    <ul>
      <li className="s-ok">Supported {s.supported}</li>
      <li className="s-partial">Partial {s.partial} (not mastery)</li>
      <li className="s-wrong">Contradicted {s.contradicted}</li>
      <li className="s-skip">Not demonstrated {s.skipped}</li>
      {s.missing > 0 && <li className="s-skip">No assessment returned {s.missing}</li>}
    </ul>
    <p>Score = coverage x accuracy. A local rubric over this checked explanation only, not an academic grade.</p>
  </section>;
}
