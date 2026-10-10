import { useEffect, useMemo, useRef, useState } from 'react';

type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal?: boolean };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useSpeechTranscription(append: (text: string) => void) {
  const [language, setLanguage] = useState('ar-SA');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [message, setMessage] = useState('');
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
    if (pending) appendRef.current(pending);
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
      try { instance.stop(); }
      catch { flush(); recognition.current = null; setListening(false); done(); }
    return promise;
  };

  const start = () => {
    if (recognition.current) return;
    setMessage('');
    const browser = window as SpeechWindow;
    const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Constructor) { setMessage('التفريغ الصوتي غير متاح هنا. استخدم Chrome أو اكتب شرحك. Speech transcription is unavailable; type your explanation instead.'); return; }
    try {
      const instance = new Constructor();
      const consumed = new Set<number>();
      instance.continuous = true;
      instance.interimResults = true;
      instance.lang = language;
      instance.onresult = event => {
        if (recognition.current !== instance) return;
        const finalized: string[] = [];
        const provisional: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result?.[0]) continue;
          if (result.isFinal) {
            if (!consumed.has(i)) { finalized.push(result[0].transcript); consumed.add(i); }
          } else provisional.push(result[0].transcript);
        }
        if (finalized.length) appendRef.current(finalized.join(' ').trim());
        interimRef.current = provisional.join(' ');
        setInterim(interimRef.current);
      };
      instance.onerror = event => {
        if (recognition.current !== instance) return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setMessage('اسمح بالميكروفون أو أكمل بالكتابة. Microphone permission was not granted; your typed notes are unchanged.');
        else if (event.error === 'audio-capture') setMessage('لا يوجد ميكروفون متاح. No microphone was found. You can continue by typing.');
        else if (event.error !== 'aborted') setMessage('توقف التفريغ الصوتي. أعد تشغيله أو أكمل بالكتابة. Speech transcription stopped; your notes are still here.');
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
      setMessage('تعذر تشغيل الميكروفون. تحقق من الأذونات أو اكتب شرحك. Could not start the microphone; type your explanation instead.');
    }
  };

  return { language, setLanguage, listening, interim, message, setMessage, supported, start, stop };
}
