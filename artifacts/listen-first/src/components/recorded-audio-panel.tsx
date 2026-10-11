import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Download, Mic, Square, Upload } from 'lucide-react';
import type { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { buildCaptionsFile, checkMediaDuration, dueCaptions, hashesMatch, MAX_RECORDING_MS, readCaptionsFile, sha256Hex, validateAudioFile, type CaptionsFile } from '@/lib/recording';
import type { UiMessage } from '@/i18n/messages';
import { useTranslation } from '@/i18n/useTranslation';

type Recorder = ReturnType<typeof useAudioRecorder>;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export function RecordedAudioPanel({ recorder, language, busy, hasDraft, onCaption, onBeforeReplay, onReplayingChange }: {
  recorder: Recorder; language: string; busy: boolean; hasDraft: boolean;
  onCaption: (text: string) => void;
  /** Parent stops study speech, archives and clears the draft if replacing. Resolves false to refuse. */
  onBeforeReplay: (replace: boolean) => Promise<boolean>;
  onReplayingChange: (replaying: boolean) => void;
}) {
  const { t, plural, message } = useTranslation();
  const [audioFile, setAudioFile] = useState<Blob | null>(null);
  const [audioHash, setAudioHash] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionsFile | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<UiMessage | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [appendedCount, setAppendedCount] = useState(0);
  const appended = useRef(new Set<number>());
  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;
  const replayingRef = useRef(onReplayingChange);
  replayingRef.current = onReplayingChange;
  const audio = useRef<HTMLAudioElement>(null);
  const hashJob = useRef<Promise<string> | null>(null);
  const token = useRef(0);
  const mounted = useRef(true);
  const { take } = recorder;
  const locked = busy || recorder.recording || recorder.starting;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; audio.current?.pause(); replayingRef.current(false); }; }, []);
  useEffect(() => { replayingRef.current(replaying); }, [replaying]);
  useEffect(() => {
    if (!audioFile) { setAudioUrl(null); return; }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [audioFile]);

  const resetReplay = () => { audio.current?.pause(); appended.current = new Set(); setAppendedCount(0); setReplaying(false); setConfirming(false); };
  const clearPair = () => { token.current++; resetReplay(); hashJob.current = null; setAudioFile(null); setAudioHash(null); setCaptions(null); };
  // Anything that makes live speech, a recording or finishing active invalidates replay.
  useEffect(() => { if (locked && (replaying || confirming)) resetReplay(); }, [locked, replaying, confirming]);

  const pickAudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || locked) return;
    const issue = validateAudioFile(file);
    if (issue) { setProblem({ raw: issue }); return; }
    const mine = ++token.current;
    const job = sha256Hex(file); hashJob.current = job;
    try {
      const hash = await job;
      if (!mounted.current || token.current !== mine) return;
      if (captions && !hashesMatch(captions.audioSha256, hash)) { setProblem({ key: 'rec.audioMismatch' }); return; }
      setProblem(null); resetReplay(); setAudioFile(file); setAudioHash(hash);
    } catch { if (mounted.current) setProblem({ key: 'rec.audioReadFailed' }); }
  };
  const pickCaptions = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file || locked) return;
    const result = await readCaptionsFile(file);
    if (!mounted.current) return;
    if (!result.ok) { setProblem({ raw: result.error }); return; }
    let hash = audioHash;
    if (audioFile && !hash && hashJob.current) { try { hash = await hashJob.current; } catch { hash = null; } }
    if (!mounted.current) return;
    if (audioFile && !hashesMatch(result.value.audioSha256, hash ?? '')) { setProblem({ key: 'rec.captionsMismatch' }); return; }
    setProblem(null); resetReplay(); setCaptions(result.value);
  };
  const useLastTake = () => {
    if (!take || !take.captions.length || !take.sha256 || locked) return;
    clearPair();
    setAudioFile(take.blob); setAudioHash(take.sha256);
    setCaptions(buildCaptionsFile(take.captions, take.language, take.durationMs, take.sha256));
    setProblem(null);
  };
  const approve = async () => {
    if (locked || starting) return;
    setStarting(true);
    const ok = await onBeforeReplay(hasDraft).catch(() => false);
    if (!mounted.current) return;
    setStarting(false); setConfirming(false);
    if (!ok) { setProblem({ key: 'rec.replayRefused' }); return; }
    appended.current = new Set(); setAppendedCount(0); setReplaying(true);
  };
  const sync = () => {
    const el = audio.current;
    if (!el || !replaying || !captions) return;
    const seconds = Number.isFinite(el.duration) ? Math.min(el.currentTime, el.duration) : el.currentTime;
    for (const i of dueCaptions(captions.captions, appended.current, Math.min(seconds * 1000, captions.durationMs))) {
      appended.current.add(i);
      onCaptionRef.current(captions.captions[i].text);
    }
    setAppendedCount(appended.current.size);
  };
  const loaded = () => {
    const el = audio.current;
    if (!el || !captions) return;
    const issue = checkMediaDuration(el.duration, captions.durationMs);
    if (issue) { clearPair(); setProblem({ raw: issue }); }
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const ready = Boolean(audioFile && captions && audioHash && hashesMatch(audioHash, captions.audioSha256));

  return <section className="rec-panel" aria-label={t('rec.title')} data-testid="panel-recorded-audio">
    <div className="rec-head"><strong>{t('rec.title')}</strong><span>{t('rec.subtitle')}</span></div>
    {!recorder.supported ? <p className="rec-note">{t('rec.unsupported')}</p> : <div className="rec-row">
      <button type="button" className="back-link" disabled={recorder.recording ? false : busy || replaying || starting || recorder.starting} onClick={() => recorder.recording ? void recorder.stop() : void recorder.start(language)} data-testid="button-record-audio">
        {recorder.recording ? <><Square size={16} aria-hidden="true" /> {t('rec.stop', { time: clock(recorder.elapsedMs) })}</> : <><Mic size={16} aria-hidden="true" /> {t(recorder.starting ? 'rec.waitingMic' : 'rec.record')}</>}
      </button>
      <small>{t('rec.limit', { time: clock(MAX_RECORDING_MS) })}</small>
    </div>}
    {recorder.message && <p className="rec-note" role="status" data-testid="status-recording-message">{t(recorder.message)} <button type="button" className="rec-dismiss" onClick={() => recorder.setMessage('')}>{t('common.dismiss')}</button></p>}
    {take && <div className="rec-row" data-testid="recording-take">
      <audio controls src={take.url} />
      <button type="button" className="back-link" onClick={() => save(take.blob, `hearo-recording-${stamp}.${take.mime.includes('ogg') ? 'ogg' : take.mime.includes('mp4') ? 'm4a' : 'webm'}`)} data-testid="button-download-audio"><Download size={16} aria-hidden="true" /> {t('rec.audio')}</button>
      <button type="button" className="back-link" disabled={!take.captions.length || !take.sha256} onClick={() => take.sha256 && save(new Blob([JSON.stringify(buildCaptionsFile(take.captions, take.language, take.durationMs, take.sha256), null, 2)], { type: 'application/json' }), `hearo-recording-${stamp}.captions.json`)} data-testid="button-download-captions"><Download size={16} aria-hidden="true" /> {t('rec.captionsJson', { count: take.captions.length })}</button>
      <button type="button" className="back-link" disabled={locked || !take.captions.length || !take.sha256} onClick={useLastTake} data-testid="button-load-last-take">{t('rec.replayTake')}</button>
      <button type="button" className="back-link" disabled={recorder.recording} onClick={() => { clearPair(); recorder.clearTake(); }}>{t('rec.discard')}</button>
    </div>}
    <div className="rec-row">
      <label className={`back-link rec-file ${locked ? 'is-disabled' : ''}`} aria-disabled={locked}><Upload size={16} aria-hidden="true" /> {t('rec.importAudio')}<input type="file" accept="audio/*" hidden disabled={locked} onChange={e => void pickAudio(e)} data-testid="input-import-audio" /></label>
      <label className={`back-link rec-file ${locked ? 'is-disabled' : ''}`} aria-disabled={locked}><Upload size={16} aria-hidden="true" /> {t('rec.importCaptions')}<input type="file" accept="application/json,.json" hidden disabled={locked} onChange={e => void pickCaptions(e)} data-testid="input-import-captions" /></label>
      <small>{t('rec.pairStatus', { audio: t(audioFile ? 'rec.audioReady' : 'rec.noAudio'), captions: captions ? plural('captions', captions.captions.length) : t('rec.noCaptions') })}</small>
    </div>
    {problem && <p className="rec-note rec-problem" role="alert" dir="auto" data-testid="status-recording-problem">{message(problem)}</p>}
    {ready && <div className="rec-replay">
      <span className="rec-badge" data-testid="badge-recorded-playback">{t('rec.badge')}</span>
      <p>{t('rec.replayExplain')}</p>
      {audioUrl && <audio ref={audio} controls src={audioUrl} onLoadedMetadata={loaded} onTimeUpdate={sync} onSeeked={sync} onEnded={sync} data-testid="audio-replay" />}
      {!replaying && !confirming && <button type="button" className="back-link" disabled={locked} onClick={() => setConfirming(true)} data-testid="button-start-replay">{t('rec.sync')}</button>}
      {confirming && <div className="rec-confirm" role="alertdialog" aria-label={t('rec.confirmLabel')}>
        <p>{t(hasDraft ? 'rec.confirmDraft' : 'rec.confirmNoDraft')}</p>
        <button type="button" className="back-link" disabled={starting || locked} onClick={() => void approve()} data-testid="button-confirm-replay">{t(hasDraft ? 'rec.archiveAndStart' : 'common.start')}</button>
        <button type="button" className="back-link" disabled={starting} onClick={() => setConfirming(false)} data-testid="button-cancel-replay">{t('common.cancel')}</button>
      </div>}
      {replaying && <p className="rec-note" data-testid="status-replay">{t('rec.replaying', { added: appendedCount, total: captions!.captions.length })} <button type="button" className="rec-dismiss" onClick={resetReplay}>{t('rec.stopSync')}</button></p>}
    </div>}
  </section>;
}
