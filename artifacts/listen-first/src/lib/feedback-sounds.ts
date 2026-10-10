import type { ConceptAssessment } from '@workspace/api-client-react';

export type FeedbackTone = 'supported' | 'contradicted';
type Verdict = ConceptAssessment['verdict'] | 'uncertain';
type Assessment = Pick<ConceptAssessment, 'conceptId' | 'verdict' | 'confidence'>;

export const FEEDBACK_SOUND_COOLDOWN_MS = 6000;

/** Tracks fresh accepted verdicts, not component renders or restored reports. */
export class FeedbackSoundGate {
  private previous = new Map<string, Verdict>();
  private lastPlayedAt = -Infinity;

  reset() {
    this.previous.clear();
    this.lastPlayedAt = -Infinity;
  }

  next(assessments: Assessment[], enabled: boolean, now: number): FeedbackTone | null {
    let tone: FeedbackTone | null = null;
    for (const item of assessments) {
      const verdict: Verdict = item.confidence === 'low' ? 'uncertain' : item.verdict;
      const before = this.previous.get(item.conceptId) ?? 'not_demonstrated';
      this.previous.set(item.conceptId, verdict);
      if (before === verdict) continue;
      if (verdict === 'contradicted') tone = 'contradicted';
      else if (verdict === 'supported' && tone !== 'contradicted') tone = 'supported';
    }
    // Suppressed changes are remembered, never queued for a later stale sound.
    if (!enabled || !tone || !Number.isFinite(now)
      || now - this.lastPlayedAt < FEEDBACK_SOUND_COOLDOWN_MS) return null;
    this.lastPlayedAt = now;
    return tone;
  }
}

/** Quiet, short synthesized feedback. No voice, downloads or third-party calls. */
export function playFeedbackTone(context: AudioContext, tone: FeedbackTone): () => void {
  if (context.state !== 'running') return () => undefined;
  const nodes: { oscillator: OscillatorNode; gain: GainNode }[] = [];
  const note = (frequency: number, offset: number, duration: number, volume: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + offset;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (tone === 'contradicted') oscillator.frequency.exponentialRampToValueAtTime(120, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
    nodes.push({ oscillator, gain });
  };
  if (tone === 'supported') {
    note(660, 0, 0.09, 0.025);
    note(880, 0.065, 0.12, 0.03);
  } else note(180, 0, 0.1, 0.025);
  return () => nodes.forEach(({ oscillator, gain }) => {
    try { oscillator.stop(); } catch { /* Already ended. */ }
    oscillator.disconnect();
    gain.disconnect();
  });
}
