import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluateStudy, type StudyEvaluation, type StudyEvaluationInput } from '@workspace/api-client-react';
import { AssessmentQueue, isCheckedPrefix } from '@/lib/assessment-queue';

function keyOf(input: StudyEvaluationInput): string {
  return JSON.stringify([input.sourceToken, input.topic, input.referenceText, input.transcript.trim()]);
}

export function useLiveAssessment({
  input, enabled, sessionKey, onResult, onSettled, paused = false,
}: {
  input: StudyEvaluationInput | null;
  enabled: boolean;
  sessionKey: number;
  onResult: (result: StudyEvaluation, checkedTranscript: string) => void;
  onSettled?: () => void;
  paused?: boolean;
}) {
  const latest = useRef({ input, enabled, sessionKey, onResult, onSettled, paused });
  latest.current = { input, enabled, sessionKey, onResult, onSettled, paused };
  const queue = useRef<AssessmentQueue<StudyEvaluationInput, StudyEvaluation> | null>(null);
  if (!queue.current) queue.current = new AssessmentQueue(data => evaluateStudy(data));
  const mounted = useRef(true);
  const count = useRef(0);
  const attempted = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const check = useCallback(async (snapshot: StudyEvaluationInput, force = false) => {
    const owner = latest.current.sessionKey;
    // Even identical input belongs to the activation that requested it.
    const requestKey = JSON.stringify([owner, keyOf(snapshot)]);
    attempted.current = keyOf(snapshot);
    count.current++;
    if (mounted.current) { setBusy(true); setError(null); }
    try {
      const result = await queue.current!.request(requestKey, snapshot, force);
      const current = latest.current;
      if (mounted.current && current.enabled && current.input
        && current.sessionKey === owner
        && current.input.sourceToken === snapshot.sourceToken
        && isCheckedPrefix(snapshot.transcript.trim(), current.input.transcript.trim())) {
        current.onResult(result, snapshot.transcript.trim());
      }
      return result;
    } catch (issue) {
      if (mounted.current && latest.current.sessionKey === owner
        && latest.current.input?.sourceToken === snapshot.sourceToken) setError(issue);
      throw issue;
    } finally {
      count.current--;
      if (mounted.current) {
        setBusy(count.current > 0);
        latest.current.onSettled?.();
      }
    }
  }, []);

  const key = input ? keyOf(input) : '';
  const sourceKey = input?.sourceToken ?? '';
  useEffect(() => { attempted.current = null; setError(null); }, [sourceKey, sessionKey]);
  useEffect(() => {
    if (!enabled) { attempted.current = null; return; }
    // A failed provider request pauses automatic work until an explicit retry.
    // Continuing to type must not keep hitting an exhausted quota.
    if (paused || error || !input?.transcript.trim() || busy || attempted.current === key) return;
    const timer = setTimeout(() => {
      if (!count.current && latest.current.enabled && !latest.current.paused && latest.current.input
        && latest.current.sessionKey === sessionKey && keyOf(latest.current.input) === key) {
        void check(latest.current.input).catch(() => undefined);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [key, enabled, paused, busy, error, check, sessionKey]);

  return { busy, error, check };
}
