import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_BYTES, MAX_RECORDING_MS, sha256Hex, type CaptionEntry } from '@/lib/recording';

export type RecordedTake = { blob: Blob; url: string; mime: string; durationMs: number; captions: CaptionEntry[]; language: string; sha256: string | null };

/** Opt-in local capture. Audio never leaves the browser. */
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [message, setMessage] = useState('');
  const [take, setTake] = useState<RecordedTake | null>(null);
  const supported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bytes = useRef(0);
  const startedAt = useRef(0);
  const captions = useRef<CaptionEntry[]>([]);
  const language = useRef('ar-SA');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopping = useRef<Promise<void> | null>(null);
  const settle = useRef<(() => void) | null>(null);
  const takeUrl = useRef<string | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  };

  const stop = useCallback((): Promise<void> => {
    if (pending.current) { generation.current++; pending.current = false; if (mounted.current) setStarting(false); return Promise.resolve(); }
    if (stopping.current) return stopping.current;
    const instance = recorder.current;
    if (!instance || instance.state === 'inactive') { release(); return Promise.resolve(); }
    const promise = new Promise<void>(resolve => {
      settle.current = resolve;
      try { instance.stop(); } catch { release(); recorder.current = null; stopping.current = null; settle.current = null; if (mounted.current) setRecording(false); resolve(); }
    });
    stopping.current = promise;
    return promise;
  }, []);

  const clearTake = useCallback(() => {
    if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    takeUrl.current = null;
    setTake(null);
  }, []);

  const start = useCallback(async (lang: string) => {
    if (recorder.current || pending.current || !supported || !mounted.current) return;
    pending.current = true; setStarting(true); setMessage(''); clearTake();
    const mine = ++generation.current;
    let media: MediaStream;
    try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (issue) {
      if (generation.current !== mine || !mounted.current) return;
      pending.current = false; setStarting(false);
      const name = (issue as { name?: string })?.name;
      setMessage(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'تم رفض الميكروفون للتسجيل. Microphone access was denied, so nothing was recorded. Normal speech and typing still work.'
        : 'تعذر بدء التسجيل. Could not start recording; no audio was captured.');
      return;
    }
    if (generation.current !== mine || !mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
    pending.current = false; setStarting(false);
    try {
      const instance = new MediaRecorder(media);
      stream.current = media; recorder.current = instance;
      chunks.current = []; bytes.current = 0; captions.current = []; language.current = lang;
      instance.ondataavailable = event => {
        if (!event.data.size) return;
        chunks.current.push(event.data);
        bytes.current += event.data.size;
        if (bytes.current >= MAX_RECORDING_BYTES) { if (mounted.current) setMessage('Recording stopped at the 25 MB limit.'); void stop(); }
      };
      instance.onstop = () => {
        const durationMs = Math.min(MAX_RECORDING_MS, Math.round(performance.now() - startedAt.current));
        const mime = instance.mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type: mime });
        const taken = captions.current.slice();
        release(); recorder.current = null; stopping.current = null;
        if (mounted.current) {
          setRecording(false);
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            takeUrl.current = url;
            setTake({ blob, url, mime, durationMs, captions: taken, language: language.current, sha256: null });
            void sha256Hex(blob).then(sha256 => { if (mounted.current && takeUrl.current === url) setTake(prev => prev && prev.url === url ? { ...prev, sha256 } : prev); })
              .catch(() => { if (mounted.current) setMessage('This browser could not fingerprint the recording, so a matched captions file cannot be exported.'); });
            if (!taken.length) setMessage('No final captions were captured, so there is no captions file to replay. The audio can still be downloaded.');
          } else setMessage('The recording was empty and was discarded.');
        }
        const done = settle.current; settle.current = null; done?.();
      };
      startedAt.current = performance.now();
      instance.start(1000);
      setRecording(true); setElapsedMs(0);
      timer.current = setInterval(() => {
        const elapsed = performance.now() - startedAt.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) { setMessage('Recording stopped at the 10 minute limit.'); void stop(); }
      }, 500);
    } catch {
      release(); recorder.current = null;
      setMessage('تعذر بدء التسجيل. Could not start recording; no audio was captured.');
    }
  }, [supported, stop, clearTake]);

  /** Called only with FINAL recognition text; stamped with time since recording began. */
  const noteCaption = useCallback((text: string) => {
    if (!recorder.current || recorder.current.state !== 'recording' || !text.trim()) return;
    captions.current.push({ atMs: Math.min(MAX_RECORDING_MS, Math.round(performance.now() - startedAt.current)), text: text.trim() });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; generation.current++; pending.current = false;
      const instance = recorder.current;
      if (instance) { instance.ondataavailable = null; instance.onstop = null; try { if (instance.state !== 'inactive') instance.stop(); } catch { /* released below */ } }
      recorder.current = null; release();
      const done = settle.current; settle.current = null; done?.();
      if (takeUrl.current) URL.revokeObjectURL(takeUrl.current);
    };
  }, []);

  return { supported, recording, starting, elapsedMs, message, setMessage, take, start, stop, noteCaption, clearTake };
}
