import type { StudyEvaluation } from '@workspace/api-client-react';

export type ReportScore = {
  required: number; supported: number; partial: number; contradicted: number; skipped: number; missing: number;
  demonstrated: number; coverage: number; accuracy: number; score: number;
};

const ratio = (top: number, bottom: number) => (bottom > 0 ? top / bottom : 0);

/** Local rubric over the current evaluation only. Not an academic grade. */
export function scoreReport(evaluation: Pick<StudyEvaluation, 'nodes' | 'assessments'>): ReportScore {
  const required = new Set(evaluation.nodes.map(node => node.id));
  const verdicts = new Map<string, string>();
  for (const item of evaluation.assessments ?? []) if (required.has(item.conceptId)) verdicts.set(item.conceptId, item.verdict);
  let supported = 0, partial = 0, contradicted = 0, skipped = 0;
  for (const verdict of verdicts.values()) {
    if (verdict === 'supported') supported++;
    else if (verdict === 'partially_understood') partial++;
    else if (verdict === 'contradicted') contradicted++;
    else if (verdict === 'not_demonstrated') skipped++;
  }
  const demonstrated = supported + partial + contradicted;
  const coverage = ratio(demonstrated, required.size);
  const accuracy = ratio(supported, demonstrated);
  return {
    required: required.size, supported, partial, contradicted, skipped,
    missing: required.size - (supported + partial + contradicted + skipped),
    demonstrated, coverage, accuracy, score: Math.round(coverage * accuracy * 1000) / 10,
  };
}

export function scoreReportLines(s: ReportScore): string[] {
  return [
    `Local rubric score: ${s.score.toFixed(1)} / 100 (coverage x accuracy; not an academic grade)`,
    `Coverage: ${s.demonstrated}/${s.required} objectives demonstrated (supported, partial or contradicted)`,
    `Accuracy: ${s.supported}/${s.demonstrated} demonstrated objectives supported`,
    `Supported: ${s.supported} | Partial: ${s.partial} (not mastery) | Contradicted: ${s.contradicted} | Not demonstrated: ${s.skipped} | No assessment returned: ${s.missing}`,
  ];
}
