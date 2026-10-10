import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConceptAssessment } from '@workspace/api-client-react';
import { FeedbackSoundGate, playFeedbackTone } from '@/lib/feedback-sounds';

const PREFERENCE_KEY = 'hearo.feedback-sounds.v1';
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function initialPreference() {
  try { return localStorage.getItem(PREFERENCE_KEY) === 'on'; }
  catch { return false; }
}

export function useFeedbackSounds(sessionKey: number) {
  const [enabled, setEnabled] = useState(initialPreference);
  const enabledRef = useRef(enabled);
  const context = useRef<AudioContext | null>(null);
  const stopTone = useRef<(() => void) | null>(null);
  const gate = useRef(new FeedbackSoundGate());
  const owner = useRef(sessionKey);
  const supported = typeof window !== 'undefined'
    && Boolean(window.AudioContext || (window as AudioWindow).webkitAudioContext);

  const unlock = useCallback(() => {
    try {
      const Constructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
      if (!Constructor) return;
      context.current ??= new Constructor();
      if (context.current.state === 'suspended') void context.current.resume().catch(() => undefined);
    } catch { /* Unsupported or blocked audio never interrupts studying. */ }
  }, []);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    try { localStorage.setItem(PREFERENCE_KEY, next ? 'on' : 'off'); }
    catch { /* The toggle still works for this page without storage. */ }
    if (next) unlock();
    else { stopTone.current?.(); stopTone.current = null; }
  }, [unlock]);

  // Browsers require a user gesture, including after restoring an ON preference.
  useEffect(() => {
    const gesture = () => { if (enabledRef.current) unlock(); };
    window.addEventListener('pointerdown', gesture);
    window.addEventListener('keydown', gesture);
    return () => {
      window.removeEventListener('pointerdown', gesture);
      window.removeEventListener('keydown', gesture);
      stopTone.current?.();
      const previous = context.current;
      context.current = null;
      if (previous && previous.state !== 'closed') void previous.close().catch(() => undefined);
    };
  }, [unlock]);

  useEffect(() => {
    gate.current.reset();
    owner.current = sessionKey;
    stopTone.current?.();
    stopTone.current = null;
  }, [sessionKey]);

  const announce = useCallback((assessments: ConceptAssessment[]) => {
    if (owner.current !== sessionKey) {
      gate.current.reset();
      owner.current = sessionKey;
    }
    // No sound while hidden, or when browser autoplay has not been unlocked.
    const canPlay = enabledRef.current && context.current?.state === 'running'
      && document.visibilityState === 'visible';
    const tone = gate.current.next(assessments, canPlay, performance.now());
    if (!tone || !context.current) return;
    try {
      stopTone.current?.();
      stopTone.current = playFeedbackTone(context.current, tone);
    } catch { /* Audio failures must not affect evaluation or transcript state. */ }
  }, [sessionKey]);

  return { enabled, toggle, announce, supported };
}
