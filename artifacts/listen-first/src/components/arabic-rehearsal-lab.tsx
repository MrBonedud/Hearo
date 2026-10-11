import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FlaskConical, Mic, Square } from 'lucide-react';
import { useSpeechTranscription } from '@/hooks/use-speech-transcription';
import { buildTrialRecord, computeWer } from '@/lib/wer';
import { useTranslation } from '@/i18n/useTranslation';

export function ArabicRehearsalLab({ blocked, onBusyChange }: { blocked: boolean; onBusyChange: (busy: boolean) => void }) {
  const { t, number } = useTranslation();
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
    <summary><FlaskConical size={16} aria-hidden="true" /> {t('lab.title')} <small>{t('lab.separate')}</small></summary>
    <p className="lab-note">{t('lab.intro')}</p>
    <label className="field-label" htmlFor="lab-intended">{t('lab.intended')}</label>
    <textarea id="lab-intended" dir="auto" rows={2} value={intended} maxLength={1000} onChange={e => setIntended(e.target.value)} disabled={listening} data-testid="input-lab-intended" />
    <div className="rec-row">
      <label className="speech-language">{t('speech.language')}<select value={language} disabled={listening} onChange={e => { setLanguage(e.target.value); setTrialLanguage(e.target.value); }} data-testid="select-lab-language"><option value="ar-SA" lang="ar">العربية</option><option value="en-US" lang="en">English</option></select></label>
      {speech.supported
        ? <button type="button" className="back-link" disabled={blocked && !listening} onClick={() => { if (listening) void stop(); else { setObserved(''); setEdited(null); start(); } }} data-testid="button-lab-record">
          {listening ? <><Square size={16} aria-hidden="true" /> {t('lab.stop')}</> : <><Mic size={16} aria-hidden="true" /> {t('lab.start')}</>}</button>
        : <small>{t('lab.unsupported')}</small>}
      {blocked && !listening && <small>{t('lab.blocked')}</small>}
    </div>
    {speech.message && <p className="rec-note" role="status">{t(speech.message)}</p>}
    <label className="field-label">{t('lab.observed')}</label>
    <div className="lab-observed" dir="auto" data-testid="text-lab-observed">{observed || t(listening ? 'lab.listening' : 'lab.nothingYet')}{speech.interim && <i> {speech.interim}</i>}</div>
    <label className="field-label" htmlFor="lab-edited">{t('lab.edited')}</label>
    <textarea id="lab-edited" dir="auto" rows={2} value={edited ?? ''} placeholder={t('lab.editedPlaceholder')} onChange={e => setEdited(e.target.value ? e.target.value : null)} disabled={listening} data-testid="input-lab-edited" />
    {hasTrial ? <div className="lab-stats" data-testid="lab-stats">
      <strong>{t('lab.wer', { rate: stats.wer === null ? t('lab.notAvailable') : number(stats.wer, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</strong>
      <span>{t('lab.scored', { source: t(edited === null ? 'lab.scoredBrowser' : 'lab.scoredEdited') })}</span>
      <span>{t('lab.wordCounts', { intended: stats.referenceWords, observed: stats.observedWords })}</span>
      <span>{t('lab.edits', { substitutions: stats.substitutions, deletions: stats.deletions, insertions: stats.insertions })}</span>
    </div> : <p className="lab-note">{t('lab.empty')}</p>}
    <p className="lab-note">{t('lab.disclaimer')}</p>
    <button type="button" className="back-link" disabled={!hasTrial} onClick={download} data-testid="button-download-trial"><Download size={16} aria-hidden="true" /> {t('lab.download')}</button>
  </details>;
}
