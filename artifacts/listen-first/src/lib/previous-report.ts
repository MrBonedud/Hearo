/**
 * A kept report is "previous" only once the learner's draft has moved away from
 * the exact explanation it checked. While the draft still equals those words,
 * the kept report is the current one and the session must not call it previous.
 */
export function hasPreviousReportForDraft(report: { transcript: string } | undefined, draft: string): boolean {
  if (!report) return false;
  const checked = report.transcript.trim();
  return Boolean(checked) && checked !== draft.trim();
}
