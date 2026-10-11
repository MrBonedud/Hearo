import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { StudyEvaluation, StudyMap } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown,
  Download, Mic, MicOff, RotateCcw, Upload, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConceptMap } from '@/components/concept-map';
import { ErrorBoundary } from '@/components/error-boundary';
import { ApprovedPdfSource, SourcePassages, type SelectedSource } from '@/components/approved-pdf-source';
import { AssessmentEvidence, assessmentKind } from '@/components/assessment-evidence';
import { Hearo } from '@/components/hearo';
import { SideNav, TopBar, type NavKey } from '@/components/app-navigation';
import { FeedbackSoundToggle } from '@/components/feedback-sound-toggle';
import { useFeedbackSounds } from '@/hooks/use-feedback-sounds';
import { useLiveAssessment } from '@/hooks/use-live-assessment';
import { useSpeechTranscription } from '@/hooks/use-speech-transcription';
import { isCheckedPrefix } from '@/lib/assessment-queue';
import { studyReportText } from '@/lib/study-report';
import {
  citationsMatchSource, clearSavedStudies, createSavedStudyId, createSavedStudiesBackup, createSourceIdentity,
  deleteSavedStudy, importSavedStudies, matchesSource, matchesVerifiedSource, MAX_SAVED_STUDY_BACKUP_BYTES,
  MAX_STUDY_LABEL_LENGTH, parseSavedStudiesBackup, readSavedStudies, updateSavedStudyLabel, writeSavedStudy,
  type SavedStudySession, type StudySourceIdentity,
} from '@/lib/study-session-storage';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LandingExperience } from '@/components/landing-experience';
import { OfflineSample } from '@/components/offline-sample';
import { RecordedAudioPanel } from '@/components/recorded-audio-panel';
import { ArabicRehearsalLab } from '@/components/arabic-rehearsal-lab';
import { CheckLatencyNote } from '@/components/check-latency';
import { ReportScoreCard } from '@/components/report-score-card';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { LiveWaveform } from '@/components/live-waveform';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getGetStudyAllowanceQueryKey, useGetStudyAllowance, usePrepareStudy } from '@workspace/api-client-react';

const queryClient = new QueryClient();
type Phase = 'setup' | 'session' | 'review';

function uncheckedMap(map: StudyMap): StudyMap {
  return { ...map, nodes: map.nodes.map(node => ({ ...node, status: 'skipped', evidence: null })) };
}

function errorMessage(error: unknown) {
  const apiError = error as { status?: number; data?: unknown; message?: string };
  const data = apiError?.data as { message?: string; error?: string } | undefined;
  if (apiError?.status === 503) return data?.message || data?.error || 'AI checking is unavailable. Your answer is unchanged. Ask the workspace owner to check the OpenAI or Gemini connection.';
  if (apiError?.status === 401 || apiError?.status === 403) return 'The study service could not authorize this request. Check the API setup and try again.';
  return data?.message || data?.error || apiError?.message || 'Something interrupted the study check. Your notes are still here; please try again.';
}

function StatusKey() {
  return <div className="status-key" aria-label="Concept map status key">
    <span><i className="key-dot understood-dot" /> supported</span>
    <span><i className="key-dot incorrect-dot" /> contradicted</span>
    <span><i className="key-dot partial-dot" /> partial understanding</span>
    <span><i className="key-dot uncertain-dot" /> uncertain</span>
    <span><i className="key-dot skipped-dot" /> not demonstrated</span>
    <span><i className="key-dot unassessed-dot" /> not assessed yet</span>
  </div>;
}

function App() {
  const prepareStudy = usePrepareStudy();
  const [phase, setPhase] = useState<Phase>('setup');
  const [showLanding, setShowLanding] = useState(true);
  const [sampleMode, setSampleMode] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const topic = selectedSource?.source.title || '';
  const referenceText = selectedSource?.source.referenceText || '';
  const [studyMap, setStudyMap] = useState<StudyMap | null>(null);
  const [evaluation, setEvaluation] = useState<StudyEvaluation | null>(null);
  const [checkedTranscript, setCheckedTranscript] = useState('');
  const [previousReport, setPreviousReport] = useState<SavedStudySession['previousReport']>();
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [voiceOverflow, setVoiceOverflow] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [savedStudies, setSavedStudies] = useState<SavedStudySession[]>([]);
  const [activeSavedStudyId, setActiveSavedStudyId] = useState<string | null>(null);
  const [activeSavedStudyLabel, setActiveSavedStudyLabel] = useState('');
  const [savedStudyLabelEdits, setSavedStudyLabelEdits] = useState<Record<string, string>>({});
  // Reopening even the same saved study starts a new response-ownership scope.
  const [assessmentSessionKey, setAssessmentSessionKey] = useState(0);
  const [savedStudyLoaded, setSavedStudyLoaded] = useState(false);
  const [sourceIdentity, setSourceIdentity] = useState<StudySourceIdentity | null>(null);
  const [storageMessage, setStorageMessage] = useState('');
  const [sourceIdentityError, setSourceIdentityError] = useState('');
  const backupFileInput = useRef<HTMLInputElement>(null);
  const allowanceQuery = useGetStudyAllowance({
    query: {
      queryKey: getGetStudyAllowanceQueryKey(),
      enabled: phase === 'session',
      staleTime: 0,
      refetchInterval: phase === 'session' ? 30_000 : false,
      refetchOnWindowFocus: true,
      retry: false,
    },
  });
  // Failed reads must not display an old balance as if it were current.
  const allowance = allowanceQuery.isError ? undefined : allowanceQuery.data;
  const transcriptRef = useRef('');
  const changeTranscript = useCallback((text: string) => {
    transcriptRef.current = text;
    setTranscript(text);
  }, []);
  const [labBusy, setLabBusy] = useState(false);
  const [replayCaptions, setReplayCaptions] = useState(0);
  const [replayActive, setReplayActive] = useState(false);
  const recorder = useAudioRecorder();
  const recorderNoteRef = useRef(recorder.noteCaption);
  recorderNoteRef.current = recorder.noteCaption;
  const stopSpeechRef = useRef<() => Promise<void>>(async () => undefined);
  const appendToTranscript = useCallback((text: string, fromSpeech: boolean) => {
    const next = [transcriptRef.current.trimEnd(), text].filter(Boolean).join(' ');
    changeTranscript(next.slice(0, 12000));
    if (next.length > 12000) {
      setVoiceOverflow(previous => `${previous} ${next.slice(12000)}`.trim());
      if (fromSpeech) setTimeout(() => void stopSpeechRef.current(), 0);
    }
  }, [changeTranscript]);
  const speech = useSpeechTranscription((text, isFinal) => {
    if (isFinal) recorderNoteRef.current(text);
    appendToTranscript(text, true);
  });
  const { supported: supportsSpeech, listening, interim, message: micMessage, setMessage: setMicMessage,
    start: startListening, stop: stopListening } = speech;
  stopSpeechRef.current = stopListening;
  const assessmentInput = studyMap && selectedSource ? {
    topic: studyMap.topic, referenceText, transcript: transcript.trim(),
    sourceToken: selectedSource.sourceToken, nodes: studyMap.nodes, edges: studyMap.edges,
  } : null;
  const sounds = useFeedbackSounds(assessmentSessionKey);
  const live = useLiveAssessment({
    input: assessmentInput,
    sessionKey: assessmentSessionKey,
    enabled: phase === 'session' && liveEnabled && !finishing && Boolean(selectedSource?.source.aiAvailable),
    paused: allowance?.available !== true,
    onSettled: () => { void allowanceQuery.refetch(); },
    onResult: (result, checked) => {
      sounds.announce(result.assessments ?? []);
      setEvaluation(result);
      setCheckedTranscript(checked);
      setPreviousReport({ transcript: checked, evaluation: result });
      setStudyMap({ topic: result.topic, nodes: result.nodes, edges: result.edges });
    },
  });
  const hasCheckedPrefix = isCheckedPrefix(checkedTranscript, transcript.trim());
  const visibleMap = studyMap && !hasCheckedPrefix ? uncheckedMap(studyMap) : studyMap;
  const transcriptWords = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const claims = useMemo(() => (transcript + (interim ? ` ${interim}` : '')).split(/(?<=[.!?])\s+/).filter(Boolean).slice(-5), [transcript, interim]);

  useEffect(() => {
    const result = readSavedStudies();
    if (result.status === 'valid') setSavedStudies(result.value);
    else if (result.status === 'invalid') setStorageMessage('A damaged or unsupported saved session was removed from this browser. Your current study is unaffected.');
    else if (result.status === 'unavailable') setStorageMessage('This browser could not read saved study data. Your current answer will stay on screen, but may not survive a reload.');
    setSavedStudyLoaded(true);
  }, []);
  useEffect(() => {
    let current = true;
    if (!selectedSource) {
      setSourceIdentity(null);
      setSourceIdentityError('');
      return;
    }
    setSourceIdentity(null);
    setSourceIdentityError('');
    void createSourceIdentity(selectedSource.source, selectedSource.pdfSha256).then(identity => {
      if (current) setSourceIdentity(identity);
    }).catch(() => {
      if (current) setSourceIdentityError('This browser cannot create a secure source fingerprint, so saved progress cannot be reopened safely.');
    });
    return () => { current = false; };
  }, [selectedSource]);
  useEffect(() => {
    const url = selectedSource?.fileUrl;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [selectedSource?.fileUrl]);
  const saveCurrentStudy = useCallback((text: string, archive = false): boolean => {
    if (!studyMap || !selectedSource || !sourceIdentity
      || sourceIdentity.id !== selectedSource.source.id
      || sourceIdentity.pdfSha256 !== selectedSource.pdfSha256) return false;
    // A prior/prefix result must never be saved as the report for edited text.
    const currentEvaluation = checkedTranscript === text.trim() ? evaluation : null;
    const citedPassageIds = currentEvaluation?.assessments
      ? [...new Set(currentEvaluation.assessments.flatMap(item => item.sourceLineIds))]
      : [];
    const saved: SavedStudySession = {
      id: archive ? createSavedStudyId() : activeSavedStudyId ?? createSavedStudyId(),
      version: 1,
      savedAt: Date.now(),
      ...(archive ? { label: 'Archived draft before caption replay' } : activeSavedStudyLabel.trim() ? { label: activeSavedStudyLabel.trim().slice(0, MAX_STUDY_LABEL_LENGTH) } : {}),
      source: sourceIdentity,
      map: currentEvaluation ? studyMap : uncheckedMap(studyMap),
      transcript: text,
      evaluation: currentEvaluation,
      phase: phase === 'review' && currentEvaluation ? 'review' : 'session',
      citedPassageIds,
      overflowText: voiceOverflow,
      previousReport,
    };
    try {
      setSavedStudies(writeSavedStudy(saved));
      if (!activeSavedStudyId && !archive) setActiveSavedStudyId(saved.id);
      setStorageMessage(archive ? 'Your previous draft was saved as an archived study before replay.' : '');
      return true;
    } catch {
      setStorageMessage('This browser could not save your progress. Your answer remains on screen; copy it before leaving or reloading.');
      return false;
    }
  }, [studyMap, evaluation, checkedTranscript, phase, selectedSource, sourceIdentity, voiceOverflow, previousReport, activeSavedStudyId, activeSavedStudyLabel]);
  useLayoutEffect(() => {
    const draft = [transcript, interim.trim()].filter(Boolean).join(' ');
    saveCurrentStudy(draft.slice(0, 12000));
  }, [transcript, interim, saveCurrentStudy]);

  const beginStudy = () => {
    setError('');
    if (!selectedSource) { setError('اختر ملف PDF المعتمد أولًا. Select and verify the approved PDF first.'); return; }
    prepareStudy.mutate({ data: { topic, referenceText, sourceToken: selectedSource.sourceToken } }, {
      onSuccess: result => { setAssessmentSessionKey(key => key + 1); setActiveSavedStudyId(createSavedStudyId()); setActiveSavedStudyLabel(''); setStudyMap(result); setEvaluation(null); setCheckedTranscript(''); setPreviousReport(undefined); changeTranscript(''); setVoiceOverflow(''); setPhase('session'); },
      onError: issue => setError(errorMessage(issue)),
    });
  };

  const reopenSavedStudy = (savedStudy: SavedStudySession) => {
    if (!selectedSource || !sourceIdentity) return;
    if (!matchesVerifiedSource(savedStudy, sourceIdentity, selectedSource.source)) {
      if (!matchesSource(savedStudy, sourceIdentity)) {
        setStorageMessage('This saved explanation belongs to a different PDF or source version. It was not opened or attached to this source.');
      } else if (!citationsMatchSource(savedStudy, selectedSource.source)) {
        setStorageMessage('This saved report cites passages that are not in the verified source. It was not opened.');
      }
      return;
    }
    setAssessmentSessionKey(key => key + 1);
    setStudyMap(savedStudy.map);
    changeTranscript(savedStudy.transcript);
    setEvaluation(savedStudy.evaluation);
    setPreviousReport(savedStudy.previousReport ?? (savedStudy.evaluation ? {
      transcript: savedStudy.transcript, evaluation: savedStudy.evaluation, overflowText: savedStudy.overflowText,
    } : undefined));
    setCheckedTranscript(savedStudy.evaluation ? savedStudy.transcript.trim() : '');
    setVoiceOverflow(savedStudy.overflowText ?? '');
    setPhase(savedStudy.phase);
    setActiveSavedStudyId(savedStudy.id);
    setActiveSavedStudyLabel(savedStudy.label ?? '');
    setError('');
    setStorageMessage('');
  };

  const removeSavedStudy = (id: string) => {
    if (!window.confirm('Delete this saved explanation and report from this browser? This cannot be undone.')) return;
    try {
      setSavedStudies(deleteSavedStudy(id));
      setStorageMessage('Saved study deleted from this browser.');
    } catch {
      setStorageMessage('The browser could not delete the saved study. Try clearing this site’s browser data.');
    }
  };

  const saveStudyLabel = (id: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = savedStudyLabelEdits[id] ?? savedStudies.find(study => study.id === id)?.label ?? '';
    try {
      const next = updateSavedStudyLabel(id, label);
      setSavedStudies(next);
      setSavedStudyLabelEdits(previous => ({ ...previous, [id]: label.trim() }));
      if (activeSavedStudyId === id) setActiveSavedStudyLabel(label.trim());
      setStorageMessage(label.trim() ? 'Study label saved.' : 'Study label removed.');
    } catch {
      setStorageMessage('The browser could not save this study label. Try again.');
    }
  };

  const removeAllSavedStudies = () => {
    if (!window.confirm('Delete all saved explanations and reports from this browser? This cannot be undone.')) return;
    try {
      clearSavedStudies();
      setSavedStudies([]);
      setStorageMessage('All saved studies deleted from this browser.');
    } catch {
      setStorageMessage('The browser could not clear saved studies. Try clearing this site’s browser data.');
    }
  };

  const exportStudyBackup = () => {
    try {
      const backup = createSavedStudiesBackup(savedStudies);
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `hearo-study-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStorageMessage(`Exported ${savedStudies.length} saved ${savedStudies.length === 1 ? 'study' : 'studies'}. Keep the backup file private.`);
    } catch {
      setStorageMessage('The saved studies could not be exported. Your browser data has not changed.');
    }
  };

  const importStudyBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_SAVED_STUDY_BACKUP_BYTES) throw new Error('This backup file is larger than 10 MB.');
      const { studies, rejectedCount } = parseSavedStudiesBackup(await file.text());
      if (studies.length === 0) {
        setStorageMessage(rejectedCount
          ? `No valid studies were found. ${rejectedCount} invalid ${rejectedCount === 1 ? 'entry was' : 'entries were'} skipped.`
          : 'This backup contains no saved studies.');
        return;
      }
      const result = importSavedStudies(studies);
      setSavedStudies(result.studies);
      const details = [
        `${result.addedCount} ${result.addedCount === 1 ? 'study added' : 'studies added'}`,
        result.duplicateCount ? `${result.duplicateCount} duplicate ${result.duplicateCount === 1 ? 'skipped' : 'entries skipped'}` : '',
        rejectedCount ? `${rejectedCount} invalid ${rejectedCount === 1 ? 'entry' : 'entries'} skipped` : '',
      ].filter(Boolean).join('; ');
      setStorageMessage(`${details}. Choose and verify the same PDF before reopening imported studies.`);
    } catch (issue) {
      setStorageMessage(issue instanceof Error ? issue.message : 'The backup could not be imported. Your saved studies are unchanged.');
    }
  };

  const finishStudy = async () => {
    if (!studyMap || !selectedSource) return;
    setFinishing(true);
    setError('');
    try {
      await stopListening();
      await recorder.stop();
      const text = transcriptRef.current.trim();
      if (!text) { setError('أضف شرحًا أولًا. Add a few words before opening your report.'); return; }
      const result = await live.check({
        topic: studyMap.topic, referenceText, transcript: text, sourceToken: selectedSource.sourceToken,
        nodes: studyMap.nodes, edges: studyMap.edges,
      }, false, 'final');
      sounds.announce(result.assessments ?? []);
      setEvaluation(result);
      setCheckedTranscript(text);
      setPreviousReport({ transcript: text, evaluation: result, overflowText: voiceOverflow });
      setStudyMap({ topic: result.topic, nodes: result.nodes, edges: result.edges });
      setPhase('review');
    } catch (issue) { setError(errorMessage(issue)); }
    finally { setFinishing(false); }
  };

  const resetStudy = async () => {
    if (finishing || prepareStudy.isPending) return;
    await stopListening();
    await recorder.stop();
    recorder.clearTake();
    setReplayCaptions(0);
    saveCurrentStudy(transcriptRef.current);
    setAssessmentSessionKey(key => key + 1);
    setActiveSavedStudyId(null);
    setPhase('setup'); setEvaluation(null); setCheckedTranscript(''); setPreviousReport(undefined); setStudyMap(null); changeTranscript('');
    setError(''); setMicMessage(''); setSelectedSource(null);
  };

  const returnHome = async () => {
    await resetStudy();
    setSampleMode(false);
    setShowLanding(true);
  };

  const downloadReport = (prior = false) => {
    if (!selectedSource) return;
    const report = prior ? previousReport : evaluation ? { evaluation, transcript, overflowText: voiceOverflow } : undefined;
    if (!report) return;
    const url = URL.createObjectURL(new Blob([studyReportText(report.evaluation, report.transcript, selectedSource.source, report.overflowText)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'hearo-session-report.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const overall = evaluation ? {
    understood: evaluation.nodes.filter(node => node.status === 'understood').length,
    revisit: evaluation.nodes.filter(node => node.status === 'incorrect').length,
    skipped: evaluation.nodes.filter(node => node.status === 'skipped').length,
  } : null;

  // Navigation only reuses the existing landing, sample and study entry points.
  const openStudy = () => { setSampleMode(false); setShowLanding(false); };
  const openSample = () => { setSampleMode(true); setShowLanding(false); };
  const openSavedStudies = () => {
    openStudy();
    window.setTimeout(() => document.getElementById('saved-studies')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const activeNav: NavKey = showLanding ? 'home' : sampleMode ? 'practice' : 'learn';
  const reportGroups = evaluation?.assessments ? [
    { key: 'supported', title: 'Supported · مدعوم بالمصدر', hint: 'Ideas your explanation demonstrated, backed by the source.', items: evaluation.assessments.filter(item => assessmentKind(item) === 'supported') },
    { key: 'review', title: 'Review · راجع هذه النقاط', hint: 'Ideas the source contradicts. Compare your words with the cited lines, then try again.', items: evaluation.assessments.filter(item => assessmentKind(item) === 'contradicted') },
    { key: 'partial', title: 'Partial · نحتاج شرحًا أوضح', hint: 'Partly explained. Partial understanding is not counted as mastery.', items: evaluation.assessments.filter(item => assessmentKind(item) === 'partially_understood') },
    { key: 'unclear', title: 'Not yet clear · غير واضح بعد', hint: 'Uncertain checks and ideas not demonstrated in this explanation.', items: evaluation.assessments.filter(item => { const kind = assessmentKind(item); return kind === 'uncertain' || kind === 'not_demonstrated'; }) },
  ].filter(group => group.items.length > 0) : [];

  return <div className="app-frame" data-phase={showLanding ? 'landing' : sampleMode ? 'sample' : phase}>
    <TopBar onHome={() => void returnHome()} phase={phase} onLanding={showLanding || sampleMode} />
    <SideNav active={activeNav} studyOpen={phase !== 'setup'} onHome={() => void returnHome()} onLearn={openStudy} onPractice={openSample} onSaved={openSavedStudies} />
    <main className="app-main">
    <div className="app-content">
    {showLanding && <LandingExperience
      onLive={() => { setSampleMode(false); setShowLanding(false); }}
      onSample={() => { setSampleMode(true); setShowLanding(false); }}
    />}
    {sampleMode && !showLanding && <OfflineSample onExit={() => { setSampleMode(false); setShowLanding(true); }} />}
    {phase === 'setup' && !showLanding && !sampleMode && <section className="setup-page enter">
      <div className="intro-copy welcome-card">
        <Hearo pose="wave" size={160} className="welcome-hearo" />
        <div className="welcome-copy">
          <div className="eyebrow">Welcome · أهلًا بك</div>
          <h1>Say what you <em>understand.</em></h1>
          <p className="intro-text" dir="auto">اشرح أفكارك بصوتك وبكلماتك. Hearo يصغي بصمت ويتحقق منها مقابل المرجع، دون أن يقاطعك. For this demo, read the approved English slides and explain in Arabic or English.</p>
          <div className="intro-note"><p>Talking it through is the study method. Being heard is the whole point.</p></div>
          <div className="steps-rail" aria-label="Three steps">
            <span className="step-current">01 <i>Prepare</i></span><b /><span>02 <i>Explain</i></span><b /><span>03 <i>Reflect</i></span>
          </div>
        </div>
      </div>
      <div className="setup-card enter-delay">
        <div className="card-kicker"><span>Open your source</span><span className="mono">Step 01 of 03</span></div>
        <ApprovedPdfSource selected={selectedSource} onChange={setSelectedSource} disabled={prepareStudy.isPending} />
        {savedStudyLoaded && <section className="saved-study saved-study-history" id="saved-studies" aria-label="Saved studies">
          <div className="saved-study-history-heading">
            <div><strong>Your saved studies</strong><p>Drafts and reports stay in this browser. Verify the matching PDF before reopening.</p></div>
            <div className="saved-study-tools">
              <input ref={backupFileInput} className="saved-study-file-input" type="file" accept=".json,application/json" onChange={event => void importStudyBackup(event)} aria-label="Choose a Hearo backup file" data-testid="input-import-study-backup" />
              <button className="saved-study-backup-button" type="button" onClick={() => backupFileInput.current?.click()} data-testid="button-import-study-backup"><Upload size={14} /> Import</button>
              <button className="saved-study-backup-button" type="button" onClick={exportStudyBackup} disabled={savedStudies.length === 0} data-testid="button-export-study-backup"><Download size={14} /> Export</button>
              {savedStudies.length > 0 && <button className="saved-study-delete" type="button" onClick={removeAllSavedStudies} data-testid="button-clear-saved-studies">Clear all</button>}
            </div>
          </div>
          <p className="saved-study-hint">Backups include your drafts and reports, but never PDF files or verification tokens. Keep exported files private.</p>
          {savedStudies.length === 0
            ? <div className="empty-state"><Hearo pose="wave" size={140} /><p className="saved-study-hint">Your explanations and reports will appear here as you work.</p></div>
            : <ul className="saved-study-list">{savedStudies.map(savedStudy => {
              const sourceMatches = Boolean(selectedSource && sourceIdentity && matchesSource(savedStudy, sourceIdentity));
              const citationsAreValid = Boolean(selectedSource && citationsMatchSource(savedStudy, selectedSource.source));
              return <li className="saved-study-item" key={savedStudy.id} data-testid={`saved-study-${savedStudy.id}`}>
                <div className="saved-study-item-copy">
                  <strong>{savedStudy.label || savedStudy.source.title}</strong>
                  {savedStudy.label && <span className="saved-study-source-title">{savedStudy.source.title}</span>}
                  <span>{savedStudy.evaluation ? 'Assessment report' : 'Draft'} · {new Date(savedStudy.savedAt).toLocaleString()}</span>
                  <p dir="auto">{savedStudy.transcript.trim() || 'No explanation text yet.'}</p>
                </div>
                <form className="saved-study-label-form" onSubmit={event => saveStudyLabel(savedStudy.id, event)}>
                  <label htmlFor={`saved-study-label-${savedStudy.id}`}>Study label</label>
                  <input
                    id={`saved-study-label-${savedStudy.id}`}
                    type="text"
                    maxLength={MAX_STUDY_LABEL_LENGTH}
                    value={savedStudyLabelEdits[savedStudy.id] ?? savedStudy.label ?? ''}
                    onChange={event => setSavedStudyLabelEdits(previous => ({ ...previous, [savedStudy.id]: event.target.value }))}
                    placeholder="Add a label"
                    data-testid={`input-saved-study-label-${savedStudy.id}`}
                  />
                  <button className="upload-button" type="submit" data-testid={`button-save-study-label-${savedStudy.id}`}>Save label</button>
                </form>
                {sourceMatches && citationsAreValid
                  ? <button className="upload-button" type="button" onClick={() => reopenSavedStudy(savedStudy)} data-testid={`button-reopen-saved-study-${savedStudy.id}`}>
                      {savedStudy.evaluation ? 'Reopen report' : 'Resume draft'}
                    </button>
                  : selectedSource && sourceIdentity && sourceMatches
                    ? <p className="saved-study-warning" role="status">This saved study cites passages that are not in this verified source. It was not opened.</p>
                    : selectedSource && sourceIdentity
                      ? <p className="saved-study-warning" role="status">Verify the same PDF and source version to reopen this study.</p>
                      : <p className="saved-study-hint">Choose and verify the same approved PDF to reopen.</p>}
                <button className="saved-study-delete" type="button" onClick={() => removeSavedStudy(savedStudy.id)} data-testid={`button-delete-saved-study-${savedStudy.id}`}>Delete</button>
              </li>;
            })}</ul>}
        </section>}
        {sourceIdentityError && <p className="saved-study-warning" role="status">{sourceIdentityError}</p>}
        {storageMessage && <p className="saved-study-status" role="status" data-testid="status-storage">{storageMessage}</p>}
        {error && <div className="inline-error" role="alert" data-testid="status-setup-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
        <label className="live-toggle"><input type="checkbox" checked={liveEnabled} onChange={event => setLiveEnabled(event.target.checked)} data-testid="toggle-live-setup" /><span>تحقق مباشر وصامت · Live AI checks while I explain</span></label>
        <button className="primary-button start-button" type="button" onClick={beginStudy} disabled={prepareStudy.isPending || !selectedSource} data-testid="button-prepare">
          {prepareStudy.isPending ? <><span className="button-loader" /> Opening the study workspace…</> : <>ابدأ الشرح · Start explaining <ArrowRight size={16} /></>}
        </button>
        <p className="privacy-line"><span className="privacy-dot" /> With live checks enabled, your text and selected source passages go to OpenAI first, with Gemini used if OpenAI fails. Checks happen automatically after a pause. You can turn live checks off and request only a final review. Your browser’s speech service handles microphone audio and may process it remotely; Hearo does not store audio, PDF bytes, or verification tokens. Drafts and reports are saved in this browser, not in an account. Anyone using this browser profile may see them; exported backups also contain your explanations and reports, so keep them private. Delete individual saved studies or clear all here, or clear this site’s browser data.</p>
      </div>
      <div className="how-strip" id="how-it-works">
        <div className="how-title"><span className="mono">A SMALL PROMISE</span><p>We won’t interrupt<br />your train of thought.</p></div>
        <div className="how-item"><span className="how-number">01</span><span>Open the approved English slides. This demo works only with the one approved PDF, verified before you start.</span></div>
        <div className="how-item"><span className="how-number">02</span><span>Speak or type in Arabic or English. Hearo checks meaning silently as you pause, without speaking back.</span></div>
        <div className="how-item"><span className="how-number">03</span><span>Watch the concept map update, inspect cited evidence, and finish with a saved, downloadable report.</span></div>
      </div>
    </section>}

    {phase === 'session' && studyMap && <section className="workspace-page enter">
      <div className="session-head">
        <div><button className="back-link" onClick={resetStudy} type="button" data-testid="button-back-setup"><ArrowLeft size={14} /> Change source</button>
          <h1 className="session-source" data-testid="text-session-source"><span>المصدر · Source</span> <bdi>{selectedSource?.source.title ?? studyMap.topic}</bdi></h1>
        </div>
        <div className="session-status"><span className={`session-status-dot ${listening ? 'active' : ''}`} />{listening ? 'Listening' : 'Ready when you are'}</div>
      </div>
      <div className="workspace-grid">
        <section className="explain-panel panel">
          <div className="explain-intro">
            <div className="explain-intro-copy">
              <div className="panel-heading"><div><h2>Explain it your way</h2></div><span className="silence-tag"><span /> SILENT MODE</span></div>
              <p className="panel-hint" dir="auto">اشرح بالعربية أو الإنجليزية. Speak or type in your own words. Live checking updates the map after pauses; Hearo never speaks back.</p>
            </div>
            <div className={`hearo-stage ${listening && !finishing ? 'is-recording' : ''}`} data-testid="hearo-session-pose">
              {finishing ? <Hearo pose="thinking" size={100} className="hearo-loading" />
                : listening ? <Hearo pose="mic" size={120} className="hearo-recording" />
                  : live.busy ? <Hearo pose="thinking" size={100} className="hearo-loading" />
                    : <Hearo pose="wave" size={120} />}
            </div>
          </div>
          <label className="live-toggle"><input type="checkbox" checked={liveEnabled} disabled={finishing} onChange={event => setLiveEnabled(event.target.checked)} data-testid="toggle-live-session" /><span>التحقق المباشر · Live checking</span></label><FeedbackSoundToggle enabled={sounds.enabled} onToggle={sounds.toggle} supported={sounds.supported} />
          <div className={allowance && (!allowance.available || allowance.remainingChecks <= Math.max(1, Math.ceil(allowance.dailyLimit * 0.1))) ? 'saved-study-warning' : 'saved-study-status'} role="status" aria-live="polite" data-testid="status-check-allowance">
            {allowance ? <>
              <p>التحققات المتبقية · Checks remaining in this browser: <strong>{allowance.remainingChecks} / {allowance.dailyLimit}</strong>.</p>
              <div className="progress-track" aria-hidden="true"><span className="progress-fill" style={{ width: `${allowance.dailyLimit > 0 ? Math.min(100, Math.max(0, allowance.remainingChecks / allowance.dailyLimit * 100)) : 0}%` }} /></div>
              <p>يتجدد الرصيد · Resets at <time dateTime={allowance.resetAt}>{new Date(allowance.resetAt).toISOString().replace('T', ' ').replace('.000Z', '')} UTC</time>.</p>
              {!allowance.available ? <p>{allowance.blockedBy === 'overall'
                ? 'بلغت الخدمة حدها اليومي · The shared service has reached its daily limit, even if this browser has checks left.'
                : 'انتهى رصيد التحقق اليومي · No checks remain today.'} Automatic checks are paused. You can keep editing and download your last report.</p>
                : allowance.remainingChecks <= Math.max(1, Math.ceil(allowance.dailyLimit * 0.1))
                  ? <p>الرصيد أوشك على النفاد · Few checks remain. Pause live checking to save a check for your final report.</p> : null}
              <p>Live and final checks use the same allowance. Failed AI attempts also count. Shared service availability may change.</p>
            </> : <p>{allowanceQuery.isError
              ? 'تعذر عرض الرصيد · Allowance is unavailable; automatic checks are paused. You can still request a final check, edit, and download your last report.'
              : 'جارٍ تحميل الرصيد · Loading checking allowance…'}</p>}
          </div>
          {sourceIdentityError && <p className="saved-study-warning" role="status">{sourceIdentityError}</p>}
          {storageMessage && <p className="saved-study-status" role="status" data-testid="status-storage">{storageMessage}</p>}
          {selectedSource && !selectedSource.source.aiAvailable && <p className="ai-unavailable" role="status">AI checking is not connected yet. You can still read and draft; your answer will not receive a simulated verdict.</p>}
          {supportsSpeech && <div className="mic-row">
            <label className="speech-language">لغة الصوت<select value={speech.language} disabled={listening || finishing} onChange={event => speech.setLanguage(event.target.value)} data-testid="select-speech-language"><option value="ar-SA">العربية</option><option value="en-US">English</option></select></label>
            <button className={`mic-button ${listening ? 'mic-active' : ''}`} type="button" disabled={finishing || labBusy || replayActive} onClick={listening ? () => void stopListening() : startListening} data-testid="button-microphone">
              {listening ? <><span className="recording-wave"><i /><i /><i /><i /><i /></span> Pause listening</> : <><Mic size={17} /> Start explaining aloud</>}
            </button>
            {listening && <span className="listening-caption"><i className="pulse-dot" /> Microphone active · Hearo does not store audio</span>}
            <LiveWaveform active={listening} />
          </div>}
          {!supportsSpeech && <p className="mic-notice" role="status">التفريغ الصوتي غير متاح في هذا المتصفح. يمكنك الكتابة أو استخدام Chrome. Speech transcription is unavailable here; typed explanations receive the same checks.</p>}
          {micMessage && <div className="mic-notice" role="status" data-testid="status-mic-message"><MicOff size={15} />{micMessage}<button onClick={() => setMicMessage('')} type="button" aria-label="Dismiss message"><X size={14} /></button></div>}
          <RecordedAudioPanel recorder={recorder} language={speech.language} busy={finishing || labBusy} hasDraft={Boolean(transcript.trim())}
            onCaption={text => { appendToTranscript(text, false); setReplayCaptions(count => count + 1); }}
            onReplayingChange={setReplayActive}
            onBeforeReplay={async replace => {
              await stopListening();
              await recorder.stop();
              if (replace && transcriptRef.current.trim()) {
                const draft = [transcriptRef.current, voiceOverflow].filter(Boolean).join(' ');
                if (!saveCurrentStudy(draft.slice(0, 12000), true)) return false;
                changeTranscript(''); setVoiceOverflow('');
              }
              setReplayCaptions(0);
              return true;
            }} />
          <ArabicRehearsalLab blocked={listening || recorder.recording || finishing} onBusyChange={setLabBusy} />
          <label className="field-label transcript-label" htmlFor="transcript-input">{supportsSpeech ? 'Your running transcript' : 'Your explanation'}{replayCaptions > 0 && <em> · includes {replayCaptions} captured captions from a recording, not fresh speech recognition</em>}</label>
          <div className="transcript-wrap">
            <textarea id="transcript-input" dir="auto" readOnly={finishing} value={transcript} onChange={event => changeTranscript(event.target.value.slice(0, 12000))} maxLength={12000} placeholder="اشرح الفكرة بأسلوبك… / Explain the idea in your own words…" data-testid="input-transcript" />
            {interim && <div className="interim-line"><span className="pulse-dot" />{interim}</div>}
            {!transcript && !interim && <div className="writing-prompt"><span>TRY THIS</span>“The main idea is… because…”</div>}
          </div>
          <div className="transcript-meta"><span>{transcriptWords} words</span><span>{transcript.length.toLocaleString()} / 12,000 characters</span></div>
          {voiceOverflow && <div className="inline-error" role="alert">وصلت إلى حد النص. انسخ الكلمات الزائدة قبل المغادرة. Character limit reached; copy these extra words before leaving: <bdi>{voiceOverflow}</bdi></div>}
          <div className="live-claims">
            <div className="live-claims-head"><span className="mini-eye" /><span>WHAT YOU’VE SAID</span><small>Claims appear as you explain</small></div>
            {claims.length ? <ul>{claims.map((claim, index) => <li key={`${index}-${claim.slice(0, 16)}`} data-testid={`claim-${index}`}><bdi>{claim}</bdi></li>)}</ul> : <p className="claims-empty">Your ideas will gather here, just as you said them.</p>}
          </div>
          {hasCheckedPrefix && evaluation?.assessments && checkedTranscript !== transcript.trim() && <p className="panel-hint" data-testid="text-checked-scope">هذه البطاقات تغطي الجزء الذي تم التحقق منه فقط · These cards cover only the checked text; newer words await a check.</p>}
          {hasCheckedPrefix && evaluation?.assessments && selectedSource && <AssessmentEvidence assessments={evaluation.assessments.filter(item => item.verdict !== 'not_demonstrated')} source={selectedSource.source} fileUrl={selectedSource.fileUrl} map={studyMap} onPractice={() => document.getElementById('transcript-input')?.focus()} />}
          {error && <div className="inline-error" role="alert" data-testid="status-session-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
          <button type="button" className="primary-button finish-button" onClick={() => void finishStudy()} disabled={finishing} data-testid="button-finish">
            {finishing ? <><span className="button-loader" /> Completing your final check…</> : <>إنهاء الجلسة وعرض التقرير · Finish &amp; report <ArrowRight size={16} /></>}
          </button>
          <p className="finish-note">Keep explaining while live checks run. Requests are spaced at least eight seconds apart. The final report checks your complete explanation, including the last spoken words. Your draft is saved locally; the PDF and authorization token are not saved.</p>
        </section>
        <aside className="map-panel panel">
          <div className="panel-heading"><div><h2>خريطة المفاهيم · Concept map</h2></div></div>
          <StatusKey />
          <div className="live-check-status" role="status" data-testid="status-live-check">
            {live.busy ? <><span className="button-loader" /> جارٍ التحقق بصمت · Checking silently…</> : allowance?.available === false ? 'تم بلوغ الحد اليومي · Live checks paused until the UTC reset' : !liveEnabled ? 'التحقق المباشر متوقف · Live checks paused' : live.error ? 'تعذر التحقق؛ تم إيقاف الطلبات التلقائية · Checks paused after an error; retry when ready' : checkedTranscript === transcript.trim() && evaluation ? 'تم التحقق من شرحك الحالي · Current explanation checked' : hasCheckedPrefix ? `تم التحقق من ${checkedTranscript.split(/\s+/).length} كلمة؛ الباقي قيد الانتظار · More words awaiting a check` : 'بانتظار شرحك · Waiting for your explanation'}
          </div>
          <CheckLatencyNote latency={live.latency} />
          {Boolean(live.error) && liveEnabled && <div className="live-check-error" role="alert"><p>{errorMessage(live.error)}</p><button type="button" className="back-link" disabled={live.busy || finishing} onClick={() => { if (assessmentInput) void live.check(assessmentInput, true).catch(() => undefined); }} data-testid="button-retry-live">إعادة المحاولة · Retry check</button></div>}
          {previousReport && <div className="live-check-error">
            <p>التقرير السابق يخص الشرح الذي تم التحقق منه فقط، وليس المسودة الحالية. Your previous report covers only its checked explanation, not the current draft.</p>
            <button type="button" className="back-link" onClick={() => downloadReport(true)} data-testid="button-download-previous-report">تنزيل التقرير السابق · Download previous report</button>
          </div>}
           <ConceptMap map={visibleMap!} assessments={hasCheckedPrefix ? evaluation?.assessments : undefined} assessed={hasCheckedPrefix && Boolean(evaluation)} />
          {selectedSource && <SourcePassages source={selectedSource.source} fileUrl={selectedSource.fileUrl} />}
           <div className="map-foot"><span className="map-foot-mark"><BookOpen size={14} /></span><span>Green: supported · Yellow: partial understanding · Red: contradicted · Grey: uncertain, not demonstrated or not assessed yet. Earlier checks cover only the words already checked.</span></div>
        </aside>
      </div>
    </section>}

    {phase === 'review' && evaluation && studyMap && overall && <section className="review-page enter">
      <header className="review-top report-card">
        <div className="review-top-bar">
          <button className="back-link" onClick={() => setPhase('session')} type="button" data-testid="button-back-review"><ArrowLeft size={14} /> Back to my explanation</button>
          <button className="primary-button report-download" type="button" onClick={() => downloadReport()} data-testid="button-download-report"><Download size={15} /> تنزيل التقرير · Download report</button>
        </div>
        <div className="review-hero">
          <Hearo pose="thumbsup" size={160} className="hearo-success" />
          <div>
            <div className="eyebrow">Session reflection · تأمّل الجلسة</div>
            <h1 className="review-title">You made it <em>yours.</em></h1>
            <p className="review-description">Here’s what your explanation showed about <strong>{studyMap.topic}</strong>. A map to guide your next pass, not a grade.</p>
            <p className="review-meta"><span>{transcriptWords} words explained</span><span>{studyMap.nodes.length} concepts in the map</span></p>
          </div>
        </div>
        {voiceOverflow && <p className="saved-study-warning" role="status">This report checks only the first 12,000 characters. Extra spoken words are preserved in the download as unassessed text: <bdi>{voiceOverflow}</bdi></p>}
      </header>
      <section className="review-summary report-card" aria-labelledby="report-summary-heading">
        <div className="summary-intro"><span className="report-section-label">Summary · الملخص</span><h2 id="report-summary-heading">Understanding has its own shape.</h2></div>
        <ReportScoreCard evaluation={evaluation} />
        <CheckLatencyNote latency={live.latency} />
        <div className="summary-stats">
          <div className="summary-stat"><span className="stat-dot understood-dot" /><strong>{overall.understood}</strong><span>understood</span></div>
          <div className="summary-stat"><span className="stat-dot incorrect-dot" /><strong>{overall.revisit}</strong><span>to revisit</span></div>
          <div className="summary-stat"><span className="stat-dot skipped-dot" /><strong>{overall.skipped}</strong><span>not fully demonstrated</span></div>
        </div>
        <StatusKey />
        <div className="review-map"><ConceptMap map={studyMap} assessments={evaluation.assessments} assessed /></div>
      </section>
      <div className="reflection-section">
        {evaluation.assessments && selectedSource && reportGroups.length ? reportGroups.map(group => <div className={`report-card report-group report-group-${group.key}`} key={group.key}>
          <AssessmentEvidence heading={group.title} hint={group.hint} assessments={group.items} source={selectedSource.source} fileUrl={selectedSource.fileUrl} map={studyMap} onPractice={() => setPhase('session')} />
        </div>) : !(evaluation.assessments && selectedSource) && evaluation.feedback.length ? <div className="feedback-list report-card">
          {evaluation.feedback.map((item, index) => <article key={`${item.statement}-${index}`} className={`feedback-item feedback-${item.status}`} data-testid={`feedback-${index}`}>
            <button className="feedback-toggle" type="button" onClick={() => setFeedbackOpen(feedbackOpen === `${index}` ? null : `${index}`)} aria-expanded={feedbackOpen === `${index}`} data-testid={`button-feedback-${index}`}>
              <span className="feedback-status-icon">{item.status === 'understood' ? <Check size={15} /> : <RotateCcw size={15} />}</span>
              <span className="feedback-quote">“{item.statement}”</span><ChevronDown size={16} className={`feedback-chevron ${feedbackOpen === `${index}` ? 'open' : ''}`} />
            </button>
            <div className="feedback-explanation"><p>{item.explanation}</p></div>
          </article>)}
        </div> : <div className="feedback-empty report-card"><Hearo pose="thinking" size={140} /><div><strong>A thoughtful first pass.</strong><p>There weren’t specific claims to annotate. Use the map as a prompt for another round.</p></div></div>}
      </div>
      <details className="transcript-review report-card" open>
        <summary className="transcript-review-head"><span className="report-section-label">Transcript · كلماتك كما هي</span><span>{transcriptWords} words</span></summary>
        <p dir="auto">{transcript}</p>
      </details>
      {error && <div className="inline-error review-error" role="alert" data-testid="status-review-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
      {storageMessage && <p className="saved-study-status" role="status" data-testid="status-storage">{storageMessage}</p>}
      <div className="review-actions"><p>Good learning leaves room for a second telling.</p><button className="primary-button" type="button" onClick={resetStudy} data-testid="button-new-session">Start a new session <ArrowRight size={16} /></button></div>
    </section>}
    </div>
    <footer className="site-footer"><span>Hearo · Listen-first learning</span><span>English source · Arabic or English answers</span></footer>
    </main>
  </div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={App} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Root() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default Root;
