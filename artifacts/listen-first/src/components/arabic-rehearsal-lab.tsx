import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, Mic, Square } from 'lucide-react';
import { useSpeechTranscription } from '@/hooks/use-speech-transcription';
import { buildTrialRecord, computeWer, WER_DISCLAIMER } from '@/lib/wer';

export function ArabicRehearsalLab({ blocked, onBusyChange }: { blocked: boolean; onBusyChange: (busy: boolean) => void }) {
  const [intended, setIntended] = useState('');
  const [observed, setObserved] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const [trialLanguage, setTrialLanguage] = useState('ar-SA');
  // A dedicated recognizer: nothing here touches the study transcript.
  const speech = useSpeechTranscription(text => setObserved(previous => [previous, text].filter(Boolean).join(' ')));
  const { listening, start, stop, language, setLanguage } = speech;
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  useEffect(() => { busyRef.current(listening); }, [listening]);
  useEffect(() => () => busyRef.current(false), []);

  const scored = edited ?? observed;
  const stats = useMemo(() => computeWer(intended, scored), [intended, scored]);
  const hasTrial = Boolean(intended.trim() && scored.trim());
  const download = () => {
    const record = buildTrialRecord({ intended, observedOriginal: observed, scoredText: scored, scoredSource: edited === null ? 'browser_recognition' : 'user_edited', language: trialLanguage });
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `hearo-speech-trial-${record.date.slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <details className="lab-card" data-testid="panel-rehearsal-lab">
    <summary><FlaskConical size={14} /> Arabic speech rehearsal lab <small>separate from your study</small></summary>
    <p className="lab-note">Type the sentence you intend to say, speak it, and compare it with what this browser heard. Uses your browser's recognizer only; no AI check is called.</p>
    <label className="field-label" htmlFor="lab-intended">Intended sentence</label>
    <textarea id="lab-intended" dir="auto" rows={2} value={intended} maxLength={1000} onChange={e => setIntended(e.target.value)} disabled={listening} data-testid="input-lab-intended" />
    <div className="rec-row">
      <label className="speech-language">اللغة<select value={language} disabled={listening} onChange={e => { setLanguage(e.target.value); setTrialLanguage(e.target.value); }} data-testid="select-lab-language"><option value="ar-SA">العربية</option><option value="en-US">English</option></select></label>
      {speech.supported
        ? <button type="button" className="back-link" disabled={blocked && !listening} onClick={() => { if (listening) void stop(); else { setObserved(''); setEdited(null); start(); } }} data-testid="button-lab-record">
          {listening ? <><Square size={13} /> Stop trial</> : <><Mic size={13} /> Start trial</>}</button>
        : <small>Speech recognition is unavailable in this browser.</small>}
      {blocked && !listening && <small>Pause the study microphone or recording first.</small>}
    </div>
    {speech.message && <p className="rec-note" role="status">{speech.message}</p>}
    <label className="field-label">Observed original text (browser output, read-only)</label>
    <div className="lab-observed" dir="auto" data-testid="text-lab-observed">{observed || (listening ? 'Listening...' : 'Nothing captured yet.')}{speech.interim && <i> {speech.interim}</i>}</div>
    <label className="field-label" htmlFor="lab-edited">Edited text (optional; marked as edited, not browser output)</label>
    <textarea id="lab-edited" dir="auto" rows={2} value={edited ?? ''} placeholder="Leave empty to score the original browser output" onChange={e => setEdited(e.target.value ? e.target.value : null)} disabled={listening} data-testid="input-lab-edited" />
    {hasTrial ? <div className="lab-stats" data-testid="lab-stats">
      <strong>{stats.wer === null ? 'n/a' : `${(stats.wer * 100).toFixed(1)}%`} word error rate</strong>
      <span>Scored text: {edited === null ? 'browser output' : 'your edited text'}</span>
      <span>{stats.referenceWords} intended words · {stats.observedWords} observed words</span>
      <span>Substitutions {stats.substitutions} · Deletions {stats.deletions} · Insertions {stats.insertions}</span>
    </div> : <p className="lab-note">Enter a sentence and capture or type an observed text to see word statistics.</p>}
    <p className="lab-note">{WER_DISCLAIMER}</p>
    <button type="button" className="back-link" disabled={!hasTrial} onClick={download} data-testid="button-download-trial"><Download size={13} /> Download trial JSON (no audio)</button>
  </details>;
}
