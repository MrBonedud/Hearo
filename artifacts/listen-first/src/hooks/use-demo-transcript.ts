import { useEffect, useMemo, useState } from 'react';

/** Presentation playback only: this does not use a microphone or an AI service. */
export function useDemoTranscript(text: string, reducedMotion: boolean) {
  const words = useMemo(() => text.trim().split(/\s+/).filter(Boolean), [text]);
  const [progress, setProgress] = useState({ text: '', count: 0 });
  const count = reducedMotion ? words.length : progress.text === text ? progress.count : 0;

  useEffect(() => {
    setProgress({ text, count: reducedMotion ? words.length : 0 });
    if (reducedMotion || !words.length) return;
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed++;
      setProgress({ text, count: revealed });
      if (revealed >= words.length) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [text, words, reducedMotion]);

  return {
    text: count >= words.length ? text : words.slice(0, count).join(' '),
    writing: count < words.length,
  };
}
