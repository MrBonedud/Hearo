import { scoreReport, scoreReportLines } from './report-score';
import type { DemoSource, StudyEvaluation } from '@workspace/api-client-react';

export function studyReportText(evaluation: StudyEvaluation, transcript: string, source: DemoSource, overflow = ''): string {
  const supported = evaluation.assessments?.filter(item => item.verdict === 'supported').length ?? 0;
  const total = evaluation.nodes.length;
  const lines = [
    'Hearo — تقرير الجلسة / Session report', '',
    `Source: ${source.title}`, `Original PDF: ${source.downloadUrl}`,
    `Concepts demonstrated correctly: ${supported}/${total}`,
    'Partial understanding is not counted as mastery.', '',
    ...scoreReportLines(scoreReport(evaluation)), '',
    'Your explanation:', transcript, '', 'Source-backed assessment:',
  ];
  for (const item of evaluation.assessments ?? []) {
    lines.push('', `${evaluation.nodes.find(node => node.id === item.conceptId)?.label ?? item.conceptId}: ${item.verdict}`,
      `Confidence: ${item.confidence}`, `You said: ${item.studentEvidence ?? 'Not demonstrated'}`,
      `AI explanation: ${item.explanation}`);
    for (const id of item.sourceLineIds) {
      const passage = source.referenceLines.find(line => line.id === id);
      if (passage) lines.push(`Reference ${id}, slide ${passage.page}: ${passage.text}`);
    }
    if (item.followUp) lines.push(`Review question: ${item.followUp}`);
  }
  if (overflow) lines.push('', 'Unassessed extra speech (12,000-character limit):', overflow);
  return lines.join('\n');
}
