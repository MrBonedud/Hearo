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
import { hasPreviousReportForDraft } from '@/lib/previous-report';
import { revealSection } from '@/lib/reveal-section';
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
import { useFitsViewport } from '@/hooks/use-fits-viewport';
import { LiveWaveform } from '@/components/live-waveform';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getGetStudyAllowanceQueryKey, useGetStudyAllowance, usePrepareStudy } from '@workspace/api-client-react';
import type { UiMessage } from '@/i18n/messages';
import { formatPlural } from '@/i18n/format';
import { plurals, translate, type Language, type PluralKey, type TranslationKey } from '@/i18n/translations';
import { useTranslation } from '@/i18n/useTranslation';

const queryClient = new QueryClient();
type Phase = 'setup' | 'session' | 'review';

function uncheckedMap(map: StudyMap): StudyMap {
  return { ...map, nodes: map.nodes.map(node => ({ ...node, status: 'skipped', evidence: null })) };
}

/** Server text is kept (and localized when known); the key is used when the server sent none. */
function errorMessage(error: unknown): UiMessage {
  const apiError = error as { status?: number; data?: unknown; message?: string };
  const data = apiError?.data as { message?: string; error?: string } | undefined;
  if (apiError?.status === 401 || apiError?.status === 403) return { key: 'errors.unauthorized' };
  const fallback: TranslationKey = apiError?.status === 503 ? 'errors.aiUnavailable' : 'errors.interrupted';
  const text = apiError?.status === 503 ? data?.message || data?.error : data?.message || data?.error || apiError?.message;
  return text ? { raw: text, fallback } : { key: fallback };
}

/** Builds a sentence from several plural parts in whichever language is active when it renders. */
function pluralIn(language: Language, key: PluralKey, count: number) {
  return formatPlural(language, count, plurals[language][key]);
}

/** Keys that would change text; caret movement, selection and copy stay allowed in a read-only transcript. */
function isEditingKey(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) {
  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter') return true;
  if (event.ctrlKey || event.metaKey) return ['v', 'x', 'z', 'y'].includes(event.key.toLowerCase());
  return event.key.length === 1 && !event.altKey;
}

function StatusKey() {
  const { t } = useTranslation();
  return <div className="status-key" aria-label={t('map.keyLabel')}>
    <span><i className="key-dot understood-dot" /> {t('status.understood')}</span>
    <span><i className="key-dot incorrect-dot" /> {t('status.incorrect')}</span>
    <span><i className="key-dot partial-dot" /> {t('status.partial')}</span>
    <span><i className="key-dot uncertain-dot" /> {t('status.uncertain')}</span>
    <span><i className="key-dot skipped-dot" /> {t('status.skipped')}</span>
    <span><i className="key-dot unassessed-dot" /> {t('status.unassessed')}</span>
  </div>;
}

function App() {
  const { t, plural, message, number, dateTime, language } = useTranslation();
  const prepareStudy = usePrepareStudy();
  const [mapPanelRef, mapPanelFits] = useFitsViewport<HTMLElement>();
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
  const [error, setError] = useState<UiMessage | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [savedStudies, setSavedStudies] = useState<SavedStudySession[]>([]);
  const [activeSavedStudyId, setActiveSavedStudyId] = useState<string | null>(null);
  const [activeSavedStudyLabel, setActiveSavedStudyLabel] = useState('');
  const [savedStudyLabelEdits, setSavedStudyLabelEdits] = useState<Record<string, string>>({});
  // Reopening even the same saved study starts a new response-ownership scope.
  const [assessmentSessionKey, setAssessmentSessionKey] = useState(0);
  const [savedStudyLoaded, setSavedStudyLoaded] = useState(false);
  const [sourceIdentity, setSourceIdentity] = useState<StudySourceIdentity | null>(null);
  const [storageMessage, setStorageMessage] = useState<UiMessage | null>(null);
  const [sourceIdentityError, setSourceIdentityError] = useState<UiMessage | null>(null);
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
  // Transcript model: `transcript` is the one editable text and the exact text
  // submitted. Recognised speech and replayed captions are only ever appended
  // to its end, once, and never while the learner can edit (see transcriptLocked).
  const transcriptInputRef = useRef<HTMLTextAreaElement>(null);
  const keptSelection = useRef<{ start: number; end: number; direction: 'forward' | 'backward' | 'none'; scrollTop: number } | null>(null);
  const appendToTranscript = useCallback((text: string, fromSpeech: boolean) => {
    // Appending replaces the textarea value, which would move a caret or
    // selection the learner placed earlier in the text to the very end.
    const input = transcriptInputRef.current;
    if (input && document.activeElement === input && !(input.selectionStart === input.selectionEnd && input.selectionEnd >= input.value.length)) {
      keptSelection.current = { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection ?? 'none', scrollTop: input.scrollTop };
    }
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
  const { supported: supportsSpeech, listening, stopping: speechStopping, interim, message: micMessage, setMessage: setMicMessage,
    start: startListening, stop: stopListening } = speech;
  stopSpeechRef.current = stopListening;
  useLayoutEffect(() => {
    const kept = keptSelection.current;
    keptSelection.current = null;
    const input = transcriptInputRef.current;
    if (!kept || !input || document.activeElement !== input) return;
    input.setSelectionRange(kept.start, kept.end, kept.direction);
    input.scrollTop = kept.scrollTop;
  }, [transcript]);
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

  // Screens swap inside one long document, so the window keeps the previous
  // screen's scroll offset unless it is reset when the screen changes.
  const screen = showLanding ? 'landing' : sampleMode ? 'sample' : phase;
  const shownScreen = useRef(screen);
  const pendingSection = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    const section = pendingSection.current;
    pendingSection.current = null;
    if (section && revealSection(section)) return;
    // Runs after the new screen is in the DOM and before it is painted.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // The control that changed the screen has unmounted; keep focus in the page.
    document.querySelector<HTMLElement>('.app-content h1')?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => {
    const result = readSavedStudies();
    if (result.status === 'valid') setSavedStudies(result.value);
    else if (result.status === 'invalid') setStorageMessage({ key: 'storage.damagedRemoved' });
    else if (result.status === 'unavailable') setStorageMessage({ key: 'storage.readFailed' });
    setSavedStudyLoaded(true);
  }, []);
  useEffect(() => {
    let current = true;
    if (!selectedSource) {
      setSourceIdentity(null);
      setSourceIdentityError(null);
      return;
    }
    setSourceIdentity(null);
    setSourceIdentityError(null);
    void createSourceIdentity(selectedSource.source, selectedSource.pdfSha256).then(identity => {
      if (current) setSourceIdentity(identity);
    }).catch(() => {
      if (current) setSourceIdentityError({ key: 'storage.noFingerprint' });
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
      ...(archive ? { label: t('saved.archivedLabel') } : activeSavedStudyLabel.trim() ? { label: activeSavedStudyLabel.trim().slice(0, MAX_STUDY_LABEL_LENGTH) } : {}),
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
      setStorageMessage(archive ? { key: 'storage.archivedBeforeReplay' } : null);
      return true;
    } catch {
      setStorageMessage({ key: 'storage.saveFailed' });
      return false;
    }
  }, [studyMap, evaluation, checkedTranscript, phase, selectedSource, sourceIdentity, voiceOverflow, previousReport, activeSavedStudyId, activeSavedStudyLabel, t]);
  useLayoutEffect(() => {
    const draft = [transcript, interim.trim()].filter(Boolean).join(' ');
    saveCurrentStudy(draft.slice(0, 12000));
  }, [transcript, interim, saveCurrentStudy]);

  const beginStudy = () => {
    setError(null);
    if (!selectedSource) { setError({ key: 'errors.selectPdfFirst' }); return; }
    prepareStudy.mutate({ data: { topic, referenceText, sourceToken: selectedSource.sourceToken } }, {
      onSuccess: result => { setAssessmentSessionKey(key => key + 1); setActiveSavedStudyId(createSavedStudyId()); setActiveSavedStudyLabel(''); setStudyMap(result); setEvaluation(null); setCheckedTranscript(''); setPreviousReport(undefined); changeTranscript(''); setVoiceOverflow(''); setPhase('session'); },
      onError: issue => setError(errorMessage(issue)),
    });
  };

  const reopenSavedStudy = (savedStudy: SavedStudySession) => {
    if (!selectedSource || !sourceIdentity) return;
    if (!matchesVerifiedSource(savedStudy, sourceIdentity, selectedSource.source)) {
      if (!matchesSource(savedStudy, sourceIdentity)) {
        setStorageMessage({ key: 'storage.differentSource' });
      } else if (!citationsMatchSource(savedStudy, selectedSource.source)) {
        setStorageMessage({ key: 'storage.badCitations' });
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
    setError(null);
    setStorageMessage(null);
  };

  const removeSavedStudy = (id: string) => {
    if (!window.confirm(t('storage.confirmDelete'))) return;
    try {
      setSavedStudies(deleteSavedStudy(id));
      setStorageMessage({ key: 'storage.deleted' });
    } catch {
      setStorageMessage({ key: 'storage.deleteFailed' });
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
      setStorageMessage({ key: label.trim() ? 'storage.labelSaved' : 'storage.labelRemoved' });
    } catch {
      setStorageMessage({ key: 'storage.labelFailed' });
    }
  };

  const removeAllSavedStudies = () => {
    if (!window.confirm(t('storage.confirmClearAll'))) return;
    try {
      clearSavedStudies();
      setSavedStudies([]);
      setStorageMessage({ key: 'storage.clearedAll' });
    } catch {
      setStorageMessage({ key: 'storage.clearFailed' });
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
      const count = savedStudies.length;
      setStorageMessage({ compose: lang => translate(lang, 'storage.exported', { studies: pluralIn(lang, 'savedStudies', count) }) });
    } catch {
      setStorageMessage({ key: 'storage.exportFailed' });
    }
  };

  const importStudyBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_SAVED_STUDY_BACKUP_BYTES) { setStorageMessage({ key: 'storage.backupTooLarge' }); return; }
    try {
      const { studies, rejectedCount } = parseSavedStudiesBackup(await file.text());
      if (studies.length === 0) {
        setStorageMessage(rejectedCount
          ? { compose: lang => translate(lang, 'storage.noValidStudies', { entries: pluralIn(lang, 'invalidEntries', rejectedCount) }) }
          : { key: 'storage.emptyBackup' });
        return;
      }
      const result = importSavedStudies(studies);
      setSavedStudies(result.studies);
      const { addedCount, duplicateCount } = result;
      setStorageMessage({ compose: lang => translate(lang, 'storage.imported', {
        details: [
          pluralIn(lang, 'studiesAdded', addedCount),
          duplicateCount ? pluralIn(lang, 'duplicatesSkipped', duplicateCount) : '',
          rejectedCount ? pluralIn(lang, 'invalidSkipped', rejectedCount) : '',
        ].filter(Boolean).join(translate(lang, 'common.listSeparator')),
      }) });
    } catch (issue) {
      setStorageMessage(issue instanceof Error ? { raw: issue.message, fallback: 'storage.importFailed' } : { key: 'storage.importFailed' });
    }
  };

  // While speech or caption replay can still append, the text is read-only so
  // an append can never move the caret mid-edit or race a keystroke.
  const transcriptLocked = listening || replayActive;
  const lockNoteRef = useRef<HTMLDivElement>(null);
  const nudgeLockNote = () => lockNoteRef.current?.animate(
    [{ boxShadow: '0 0 0 3px var(--color-primary-soft)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900 });
  const pauseToEdit = async () => {
    await stopListening();
    transcriptInputRef.current?.focus();
  };

  // Guards against a second click landing before the disabled state renders.
  const finishingRef = useRef(false);
  const finishStudy = async () => {
    if (!studyMap || !selectedSource || finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    setError(null);
    try {
      await stopListening();
      await recorder.stop();
      const text = transcriptRef.current.trim();
      if (!text) { setError({ key: 'errors.addWordsFirst' }); return; }
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
    finally { finishingRef.current = false; setFinishing(false); }
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
    setError(null); setMicMessage(''); setSelectedSource(null);
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
    const url = URL.createObjectURL(new Blob([studyReportText(report.evaluation, report.transcript, selectedSource.source, report.overflowText, language)], { type: 'text/plain;charset=utf-8' }));
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
    if (screen === 'setup') { revealSection('saved-studies'); return; }
    // Revealed by the screen-change layout effect once the setup screen has rendered.
    pendingSection.current = 'saved-studies';
    openStudy();
  };
  const activeNav: NavKey = showLanding ? 'home' : sampleMode ? 'practice' : 'learn';
  const reportGroups = evaluation?.assessments ? [
    { key: 'supported', title: t('report.supportedTitle'), hint: t('report.supportedHint'), items: evaluation.assessments.filter(item => assessmentKind(item) === 'supported') },
    { key: 'review', title: t('report.reviewTitle'), hint: t('report.reviewHint'), items: evaluation.assessments.filter(item => assessmentKind(item) === 'contradicted') },
    { key: 'partial', title: t('report.partialTitle'), hint: t('report.partialHint'), items: evaluation.assessments.filter(item => assessmentKind(item) === 'partially_understood') },
    { key: 'unclear', title: t('report.unclearTitle'), hint: t('report.unclearHint'), items: evaluation.assessments.filter(item => { const kind = assessmentKind(item); return kind === 'uncertain' || kind === 'not_demonstrated'; }) },
  ].filter(group => group.items.length > 0) : [];

  return <div className="app-frame" data-phase={screen}>
    <TopBar onHome={() => void returnHome()} phase={phase} onLanding={showLanding || sampleMode} showHowItWorks={screen === 'landing' || screen === 'setup'} />
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
          <div className="eyebrow">{t('setup.eyebrow')}</div>
          <h1 tabIndex={-1}>{t('setup.title')} <em>{t('setup.titleEmphasis')}</em></h1>
          <p className="intro-text">{t('setup.intro')}</p>
          <div className="steps-rail" role="list" aria-label={t('steps.label')}>
            <span className="step-current" role="listitem" aria-current="step"><bdi>01</bdi> <i>{t('steps.prepare')}</i></span><b aria-hidden="true" /><span role="listitem"><bdi>02</bdi> <i>{t('steps.explain')}</i></span><b aria-hidden="true" /><span role="listitem"><bdi>03</bdi> <i>{t('steps.reflect')}</i></span>
          </div>
        </div>
      </div>
      <div className="setup-card enter-delay">
        <div className="card-kicker"><span>{t('setup.cardKicker')}</span><span className="mono">{t('setup.stepOf', { current: '01', total: '03' })}</span></div>
        <ApprovedPdfSource selected={selectedSource} onChange={setSelectedSource} disabled={prepareStudy.isPending} />
        {savedStudyLoaded && <section className="saved-study saved-study-history" id="saved-studies" tabIndex={-1} aria-label={t('saved.regionLabel')}>
          <div className="saved-study-history-heading">
            <div><strong>{t('saved.title')}</strong><p>{t('saved.subtitle')}</p></div>
            <div className="saved-study-tools">
              <input ref={backupFileInput} className="saved-study-file-input" type="file" accept=".json,application/json" onChange={event => void importStudyBackup(event)} aria-label={t('saved.chooseBackup')} data-testid="input-import-study-backup" />
              <button className="saved-study-backup-button" type="button" onClick={() => backupFileInput.current?.click()} data-testid="button-import-study-backup"><Upload size={16} aria-hidden="true" /> {t('saved.import')}</button>
              <button className="saved-study-backup-button" type="button" onClick={exportStudyBackup} disabled={savedStudies.length === 0} data-testid="button-export-study-backup"><Download size={16} aria-hidden="true" /> {t('saved.export')}</button>
              {savedStudies.length > 0 && <button className="saved-study-delete" type="button" onClick={removeAllSavedStudies} data-testid="button-clear-saved-studies">{t('saved.clearAll')}</button>}
            </div>
          </div>
          <p className="saved-study-hint">{t('saved.backupHint')}</p>
          {savedStudies.length === 0
            ? <div className="empty-state"><Hearo pose="wave" size={140} /><p className="saved-study-hint">{t('saved.empty')}</p></div>
            : <ul className="saved-study-list">{savedStudies.map(savedStudy => {
              const sourceMatches = Boolean(selectedSource && sourceIdentity && matchesSource(savedStudy, sourceIdentity));
              const citationsAreValid = Boolean(selectedSource && citationsMatchSource(savedStudy, selectedSource.source));
              return <li className="saved-study-item" key={savedStudy.id} data-testid={`saved-study-${savedStudy.id}`}>
                <div className="saved-study-item-copy">
                  <strong dir="auto">{savedStudy.label || savedStudy.source.title}</strong>
                  {savedStudy.label && <span className="saved-study-source-title" dir="auto">{savedStudy.source.title}</span>}
                  <span>{t(savedStudy.evaluation ? 'saved.report' : 'saved.draft')} · <time dateTime={new Date(savedStudy.savedAt).toISOString()}>{dateTime(savedStudy.savedAt)}</time></span>
                  <p dir="auto">{savedStudy.transcript.trim() || t('saved.noText')}</p>
                </div>
                <form className="saved-study-label-form" onSubmit={event => saveStudyLabel(savedStudy.id, event)}>
                  <label htmlFor={`saved-study-label-${savedStudy.id}`}>{t('saved.labelField')}</label>
                  <input
                    id={`saved-study-label-${savedStudy.id}`}
                    type="text"
                    dir="auto"
                    maxLength={MAX_STUDY_LABEL_LENGTH}
                    value={savedStudyLabelEdits[savedStudy.id] ?? savedStudy.label ?? ''}
                    onChange={event => setSavedStudyLabelEdits(previous => ({ ...previous, [savedStudy.id]: event.target.value }))}
                    placeholder={t('saved.labelPlaceholder')}
                    data-testid={`input-saved-study-label-${savedStudy.id}`}
                  />
                  <button className="upload-button" type="submit" data-testid={`button-save-study-label-${savedStudy.id}`}>{t('saved.saveLabel')}</button>
                </form>
                {sourceMatches && citationsAreValid
                  ? <button className="upload-button" type="button" onClick={() => reopenSavedStudy(savedStudy)} data-testid={`button-reopen-saved-study-${savedStudy.id}`}>
                      {t(savedStudy.evaluation ? 'saved.reopenReport' : 'saved.resumeDraft')}
                    </button>
                  : selectedSource && sourceIdentity && sourceMatches
                    ? <p className="saved-study-warning" role="status">{t('saved.badCitations')}</p>
                    : selectedSource && sourceIdentity
                      ? <p className="saved-study-warning" role="status">{t('saved.verifySame')}</p>
                      : <p className="saved-study-hint">{t('saved.chooseSame')}</p>}
                <button className="saved-study-delete" type="button" onClick={() => removeSavedStudy(savedStudy.id)} data-testid={`button-delete-saved-study-${savedStudy.id}`}>{t('saved.delete')}</button>
              </li>;
            })}</ul>}
        </section>}
        {sourceIdentityError && <p className="saved-study-warning" role="status">{message(sourceIdentityError)}</p>}
        {storageMessage && <p className="saved-study-status" role="status" dir="auto" data-testid="status-storage">{message(storageMessage)}</p>}
        {error && <div className="inline-error" role="alert" data-testid="status-setup-error"><span aria-hidden="true">!</span><span dir="auto">{message(error)}</span><button type="button" onClick={() => setError(null)} aria-label={t('common.dismissMessage')}><X size={16} aria-hidden="true" /></button></div>}
        <label className="live-toggle"><input type="checkbox" checked={liveEnabled} onChange={event => setLiveEnabled(event.target.checked)} data-testid="toggle-live-setup" /><span>{t('setup.liveToggle')}</span></label>
        <button className="primary-button start-button" type="button" onClick={beginStudy} disabled={prepareStudy.isPending || !selectedSource} data-testid="button-prepare">
          {prepareStudy.isPending ? <><span className="button-loader" /> {t('setup.opening')}</> : <>{t('setup.start')} <ArrowRight size={16} aria-hidden="true" /></>}
        </button>
        <p className="privacy-line"><span className="privacy-dot" aria-hidden="true" /> {t('setup.privacy')}</p>
      </div>
      <div className="how-strip" id="how-it-works" tabIndex={-1} role="region" aria-label={t('nav.howItWorks')}>
        <div className="how-title"><span className="mono">{t('setup.promiseKicker')}</span><p>{t('setup.promise')}</p></div>
        <div className="how-item"><span className="how-number">01</span><span>{t('setup.how1')}</span></div>
        <div className="how-item"><span className="how-number">02</span><span>{t('setup.how2')}</span></div>
        <div className="how-item"><span className="how-number">03</span><span>{t('setup.how3')}</span></div>
      </div>
    </section>}

    {phase === 'session' && studyMap && <section className="workspace-page enter">
      <div className="session-head">
        <div><button className="back-link" onClick={resetStudy} type="button" data-testid="button-back-setup"><ArrowLeft size={16} aria-hidden="true" /> {t('session.changeSource')}</button>
          <h1 className="session-source" tabIndex={-1} data-testid="text-session-source"><span>{t('session.sourceLabel')}</span> <bdi>{selectedSource?.source.title ?? studyMap.topic}</bdi></h1>
        </div>
        <div className="session-status"><span className={`session-status-dot ${listening ? 'active' : ''}`} aria-hidden="true" />{t(listening ? 'session.listening' : 'session.ready')}</div>
      </div>
      <div className="workspace-grid">
        <section className="explain-panel panel">
          <div className="explain-intro">
            <div className="explain-intro-copy">
              <div className="panel-heading"><div><h2>{t('session.heading')}</h2></div><span className="silence-tag"><span aria-hidden="true" /> {t('session.silentTag')}</span></div>
              <p className="panel-hint">{t('session.hint')}</p>
            </div>
            <div className={`hearo-stage ${listening && !finishing ? 'is-recording' : ''}`} data-testid="hearo-session-pose">
              {finishing ? <Hearo pose="thinking" size={100} className="hearo-loading" />
                : listening ? <Hearo pose="mic" size={120} className="hearo-recording" />
                  : live.busy ? <Hearo pose="thinking" size={100} className="hearo-loading" />
                    : <Hearo pose="wave" size={120} />}
            </div>
          </div>
          <label className="live-toggle"><input type="checkbox" checked={liveEnabled} disabled={finishing} onChange={event => setLiveEnabled(event.target.checked)} data-testid="toggle-live-session" /><span>{t('session.liveToggle')}</span></label><FeedbackSoundToggle enabled={sounds.enabled} onToggle={sounds.toggle} supported={sounds.supported} />
          <div className={allowance && (!allowance.available || allowance.remainingChecks <= Math.max(1, Math.ceil(allowance.dailyLimit * 0.1))) ? 'saved-study-warning' : 'saved-study-status'} role="status" aria-live="polite" data-testid="status-check-allowance">
            {allowance ? <>
              <p>{t('allowance.remaining')} <strong dir="ltr">{allowance.remainingChecks} / {allowance.dailyLimit}</strong></p>
              <div className="progress-track" aria-hidden="true"><span className="progress-fill" style={{ width: `${allowance.dailyLimit > 0 ? Math.min(100, Math.max(0, allowance.remainingChecks / allowance.dailyLimit * 100)) : 0}%` }} /></div>
              <p>{t('allowance.resetsAt')} <time dateTime={allowance.resetAt}>{dateTime(allowance.resetAt, { timeZone: 'UTC' })} UTC</time></p>
              {!allowance.available ? <p>{t(allowance.blockedBy === 'overall' ? 'allowance.overall' : 'allowance.none')} {t('allowance.paused')}</p>
                : allowance.remainingChecks <= Math.max(1, Math.ceil(allowance.dailyLimit * 0.1))
                  ? <p>{t('allowance.few')}</p> : null}
              <p>{t('allowance.shared')}</p>
            </> : <p>{t(allowanceQuery.isError ? 'allowance.unavailable' : 'allowance.loading')}</p>}
          </div>
          {sourceIdentityError && <p className="saved-study-warning" role="status">{message(sourceIdentityError)}</p>}
          {storageMessage && <p className="saved-study-status" role="status" dir="auto" data-testid="status-storage">{message(storageMessage)}</p>}
          {selectedSource && !selectedSource.source.aiAvailable && <p className="ai-unavailable" role="status">{t('session.aiUnavailable')}</p>}
          {supportsSpeech && <div className="mic-row">
            <label className="speech-language">{t('speech.language')}<select value={speech.language} disabled={listening || finishing} onChange={event => speech.setLanguage(event.target.value)} data-testid="select-speech-language"><option value="ar-SA" lang="ar">العربية</option><option value="en-US" lang="en">English</option></select></label>
            <button className={`mic-button ${listening ? 'mic-active' : ''}`} type="button" disabled={finishing || labBusy || replayActive || speechStopping} onClick={listening ? () => void stopListening() : startListening} data-testid="button-microphone">
              {speechStopping ? <><span className="button-loader" /> {t('session.stopping')}</>
                : listening ? <><span className="recording-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span> {t('session.pause')}</>
                  : <><Mic size={16} aria-hidden="true" /> {t(transcript.trim() ? 'session.resume' : 'session.speak')}</>}
            </button>
            {listening && <span className="listening-caption"><i className="pulse-dot" aria-hidden="true" /> {t('session.micActive')}</span>}
            <LiveWaveform active={listening} />
          </div>}
          {!supportsSpeech && <p className="mic-notice" role="status">{t('session.noSpeech')}</p>}
          {micMessage && <div className="mic-notice" role="status" data-testid="status-mic-message"><MicOff size={16} aria-hidden="true" />{t(micMessage)}<button onClick={() => setMicMessage('')} type="button" aria-label={t('common.dismissMessage')}><X size={16} aria-hidden="true" /></button></div>}
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
          <label className="field-label transcript-label" htmlFor="transcript-input">{t(supportsSpeech ? 'session.transcriptLabel' : 'session.explanationLabel')}{replayCaptions > 0 && <em> · {t('session.replayIncluded', { captions: plural('captions', replayCaptions) })}</em>}</label>
          {transcriptLocked && <div ref={lockNoteRef} className="transcript-lock" id="transcript-lock-note" role="status" data-testid="status-transcript-locked">
            <span>{t(replayActive ? 'session.lockReplay' : speechStopping ? 'session.lockStopping' : 'session.lockRecording')}</span>
            {listening && !speechStopping && <button type="button" className="secondary-button" onClick={() => void pauseToEdit()} data-testid="button-pause-to-edit">{t('session.pauseToEdit')}</button>}
          </div>}
          <div className="transcript-wrap">
            <textarea ref={transcriptInputRef} id="transcript-input" dir="auto" className={transcriptLocked ? 'is-locked' : undefined}
              readOnly={finishing || transcriptLocked} aria-describedby={transcriptLocked ? 'transcript-lock-note' : undefined}
              onKeyDown={event => { if (transcriptLocked && isEditingKey(event)) nudgeLockNote(); }}
              value={transcript} onChange={event => changeTranscript(event.target.value.slice(0, 12000))} maxLength={12000} placeholder={t('session.placeholder')} data-testid="input-transcript" />
            {interim && <div className="interim-line" dir="auto" data-testid="text-interim"><span className="pulse-dot" aria-hidden="true" /><span className="interim-tag">{t('session.interimTag')}</span>{interim}</div>}
            {!transcript && !interim && <div className="writing-prompt" aria-hidden="true"><span>{t('session.tryThis')}</span>{t('session.prompt')}</div>}
          </div>
          <div className="transcript-meta"><span>{plural('words', transcriptWords)}</span><span>{t('session.characters', { count: transcript.length, max: 12000 })}</span></div>
          {voiceOverflow && <div className="inline-error" role="alert">{t('session.overflow')} <bdi>{voiceOverflow}</bdi></div>}
          <div className="live-claims">
            <div className="live-claims-head"><span className="mini-eye" aria-hidden="true" /><span>{t('session.claimsTitle')}</span><small>{t('session.claimsHint')}</small></div>
            {claims.length ? <ul>{claims.map((claim, index) => <li key={`${index}-${claim.slice(0, 16)}`} data-testid={`claim-${index}`} dir="auto">{claim}</li>)}</ul> : <p className="claims-empty">{t('session.claimsEmpty')}</p>}
          </div>
          {hasCheckedPrefix && evaluation?.assessments && checkedTranscript !== transcript.trim() && <p className="panel-hint" data-testid="text-checked-scope">{t('session.checkedScope')}</p>}
          {hasCheckedPrefix && evaluation?.assessments && selectedSource && <AssessmentEvidence assessments={evaluation.assessments.filter(item => item.verdict !== 'not_demonstrated')} source={selectedSource.source} fileUrl={selectedSource.fileUrl} map={studyMap} onPractice={() => document.getElementById('transcript-input')?.focus()} />}
          {error && <div className="inline-error" role="alert" data-testid="status-session-error"><span aria-hidden="true">!</span><span dir="auto">{message(error)}</span><button type="button" onClick={() => setError(null)} aria-label={t('common.dismissMessage')}><X size={16} aria-hidden="true" /></button></div>}
          <button type="button" className="primary-button finish-button" onClick={() => void finishStudy()} disabled={finishing} data-testid="button-finish">
            {finishing ? <><span className="button-loader" /> {t('session.finishing')}</> : <>{t('session.finish')} <ArrowRight size={16} aria-hidden="true" /></>}
          </button>
          <p className="finish-note">{t('session.finishNote')}</p>
        </section>
        <aside ref={mapPanelRef} className={`map-panel panel ${mapPanelFits ? 'fits-viewport' : ''}`} data-testid="panel-study-map">
          <div className="panel-heading"><div><h2>{t('map.heading')}</h2></div></div>
          <StatusKey />
          <div className="live-check-status" role="status" data-testid="status-live-check">
            {live.busy ? <><span className="button-loader" /> {t('live.checking')}</> : allowance?.available === false ? t('live.dailyLimit') : !liveEnabled ? t('live.off') : live.error ? t('live.errorPaused') : checkedTranscript === transcript.trim() && evaluation ? t('live.checked') : hasCheckedPrefix ? t('live.partial', { words: plural('words', checkedTranscript.split(/\s+/).length) }) : t('live.waiting')}
          </div>
          <CheckLatencyNote latency={live.latency} />
          {Boolean(live.error) && liveEnabled && <div className="live-check-error" role="alert"><p dir="auto">{message(errorMessage(live.error))}</p><button type="button" className="back-link" disabled={live.busy || finishing} onClick={() => { if (assessmentInput) void live.check(assessmentInput, true).catch(() => undefined); }} data-testid="button-retry-live">{t('live.retry')}</button></div>}
          {previousReport && hasPreviousReportForDraft(previousReport, transcript) && <div className="live-check-error" data-testid="status-previous-report">
            <p>{t('report.previousNote')}</p>
            <button type="button" className="back-link" onClick={() => downloadReport(true)} data-testid="button-download-previous-report">{t('report.downloadPrevious')}</button>
          </div>}
           <ConceptMap map={visibleMap!} assessments={hasCheckedPrefix ? evaluation?.assessments : undefined} assessed={hasCheckedPrefix && Boolean(evaluation)} />
          {selectedSource && <SourcePassages source={selectedSource.source} fileUrl={selectedSource.fileUrl} />}
           <div className="map-foot"><span className="map-foot-mark" aria-hidden="true"><BookOpen size={16} /></span><span>{t('map.foot')}</span></div>
        </aside>
      </div>
    </section>}

    {phase === 'review' && evaluation && studyMap && overall && <section className="review-page enter">
      <header className="review-top report-card">
        <div className="review-top-bar">
          <button className="back-link" onClick={() => setPhase('session')} type="button" data-testid="button-back-review"><ArrowLeft size={16} aria-hidden="true" /> {t('review.back')}</button>
          <button className="primary-button report-download" type="button" onClick={() => downloadReport()} data-testid="button-download-report"><Download size={16} aria-hidden="true" /> {t('review.download')}</button>
        </div>
        <div className="review-hero">
          <Hearo pose="thumbsup" size={160} className="hearo-success" />
          <div>
            <div className="eyebrow">{t('review.eyebrow')}</div>
            <h1 className="review-title" tabIndex={-1}>{t('review.title')} <em>{t('review.titleEmphasis')}</em></h1>
            <p className="review-description">{t('review.descriptionLead')} <strong><bdi>{studyMap.topic}</bdi></strong>{t('review.descriptionTail')}</p>
            <p className="review-meta"><span>{t('review.wordsExplained', { words: plural('words', transcriptWords) })}</span><span>{plural('concepts', studyMap.nodes.length)}</span></p>
          </div>
        </div>
        {voiceOverflow && <p className="saved-study-warning" role="status">{t('review.overflowNote', { max: 12000 })} <bdi>{voiceOverflow}</bdi></p>}
      </header>
      <section className="review-summary report-card" aria-labelledby="report-summary-heading">
        <div className="summary-intro"><span className="report-section-label">{t('review.summaryLabel')}</span><h2 id="report-summary-heading">{t('review.summaryHeading')}</h2></div>
        <ReportScoreCard evaluation={evaluation} />
        <CheckLatencyNote latency={live.latency} />
        <div className="summary-stats">
          <div className="summary-stat"><span className="stat-dot understood-dot" aria-hidden="true" /><strong>{number(overall.understood)}</strong><span>{t('review.understood')}</span></div>
          <div className="summary-stat"><span className="stat-dot incorrect-dot" aria-hidden="true" /><strong>{number(overall.revisit)}</strong><span>{t('review.revisit')}</span></div>
          <div className="summary-stat"><span className="stat-dot skipped-dot" aria-hidden="true" /><strong>{number(overall.skipped)}</strong><span>{t('review.notShown')}</span></div>
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
              <span className="feedback-status-icon" aria-hidden="true">{item.status === 'understood' ? <Check size={16} /> : <RotateCcw size={16} />}</span>
              <span className="feedback-quote" dir="auto"><bdi>{item.statement}</bdi></span><ChevronDown size={16} aria-hidden="true" className={`feedback-chevron ${feedbackOpen === `${index}` ? 'open' : ''}`} />
            </button>
            <div className="feedback-explanation"><p dir="auto">{item.explanation}</p></div>
          </article>)}
        </div> : <div className="feedback-empty report-card"><Hearo pose="thinking" size={140} /><div><strong>{t('review.emptyTitle')}</strong><p>{t('review.emptyBody')}</p></div></div>}
      </div>
      <details className="transcript-review report-card" open>
        <summary className="transcript-review-head"><span className="report-section-label">{t('review.transcriptLabel')}</span><span>{plural('words', transcriptWords)}</span></summary>
        <p dir="auto">{transcript}</p>
      </details>
      {error && <div className="inline-error review-error" role="alert" data-testid="status-review-error"><span aria-hidden="true">!</span><span dir="auto">{message(error)}</span><button type="button" onClick={() => setError(null)} aria-label={t('common.dismissMessage')}><X size={16} aria-hidden="true" /></button></div>}
      {storageMessage && <p className="saved-study-status" role="status" dir="auto" data-testid="status-storage">{message(storageMessage)}</p>}
      <div className="review-actions"><p>{t('review.closing')}</p><button className="secondary-button" type="button" onClick={resetStudy} data-testid="button-new-session">{t('review.newSession')} <ArrowRight size={16} aria-hidden="true" /></button></div>
    </section>}
    </div>
    <footer className="site-footer"><span>{t('footer.brand')}</span><span>{t('footer.note')}</span></footer>
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
