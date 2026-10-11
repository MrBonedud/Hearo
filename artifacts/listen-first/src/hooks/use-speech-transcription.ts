import { useEffect, useMemo, useRef, useState } from 'react';
import type { TranslationKey } from '@/i18n/translations';
import { createSpeechSession, readSpeechEvent, type SpeechResultEvent } from '@/lib/speech-results';

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

/**
 * Browser speech recognition. `append` receives only new text, once: final
 * segments while listening, plus any still-provisional words when the session
 * ends (so nothing spoken is dropped). `listening` stays true until the
 * recogniser has really ended, including the short `stopping` phase after a
 * pause request, because late finals can still arrive then.
 */
export function useSpeechTranscription(append: (text: string, isFinal?: boolean) => void) {
  const [language, setLanguage] = useState('ar-SA');
  const [listening, setListening] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [interim, setInterim] = useState('');
  // Translation keys, so messages already on screen follow a language switch.
  const [message, setMessage] = useState<TranslationKey | ''>('');
  const recognition = useRef<Recognition | null>(null);
  const interimRef = useRef('');
  const appendRef = useRef(append);
  appendRef.current = append;
  const waiting = useRef<(() => void) | null>(null);
  const stopping = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const supported = useMemo(() => {
    const browser = window as SpeechWindow;
    return Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition);
  }, []);

  const flush = () => {
    const pending = interimRef.current.trim();
    interimRef.current = '';
    if (pending) appendRef.current(pending, false);
    setInterim('');
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const instance = recognition.current;
      recognition.current = null;
      instance?.abort();
      waiting.current?.();
    };
  }, []);

  const stop = (): Promise<void> => {
    if (stopping.current) return stopping.current;
    const instance = recognition.current;
    if (!instance) return Promise.resolve();
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    stopping.current = promise;
      const done = () => {
        clearTimeout(timeout);
        waiting.current = null;
        stopping.current = null;
        if (mounted.current) setPausing(false);
        resolve();
      };
      const timeout = setTimeout(() => {
        if (recognition.current === instance) {
          flush();
          recognition.current = null;
          instance.abort();
          setListening(false);
        }
        done();
      }, 2500);
      waiting.current = done;
      setPausing(true);
      try { instance.stop(); }
      catch { flush(); recognition.current = null; setListening(false); done(); }
    return promise;
  };

  const start = () => {
    if (recognition.current) return;
    setMessage('');
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setMessage('speech.unavailable'); return; }
    try {
      const instance = new Constructor();
      const session = createSpeechSession();
      instance.continuous = true;
      instance.interimResults = true;
      instance.lang = language;
      instance.onresult = event => {
        // Results from an ended or replaced session are stale and never touch the text.
        if (recognition.current !== instance) return;
        const { finalText, interim: provisional } = readSpeechEvent(session, event);
        if (finalText) appendRef.current(finalText, true);
        interimRef.current = provisional;
        setInterim(provisional);
      };
      instance.onerror = event => {
        if (recognition.current !== instance) return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setMessage('speech.permission');
        else if (event.error === 'audio-capture') setMessage('speech.noMic');
        else if (event.error !== 'aborted') setMessage('speech.stopped');
      };
      instance.onend = () => {
        if (recognition.current !== instance || !mounted.current) return;
        flush();
        recognition.current = null;
        setListening(false);
        waiting.current?.();
      };
      recognition.current = instance;
      instance.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setListening(false);
      setMessage('speech.startFailed');
    }
  };

  return { language, setLanguage, listening, stopping: pausing, interim, message, setMessage, supported, start, stop };
}
