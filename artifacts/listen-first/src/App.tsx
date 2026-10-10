import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrepareStudy } from '@workspace/api-client-react';
import type { StudyEvaluation, StudyMap } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, CircleHelp,
  Headphones, Mic, MicOff, RotateCcw, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ErrorBoundary } from '@/components/error-boundary';
import { ApprovedPdfSource, SourcePassages, type SelectedSource } from '@/components/approved-pdf-source';
import { AssessmentEvidence } from '@/components/assessment-evidence';
import { useLiveAssessment } from '@/hooks/use-live-assessment';
import { useSpeechTranscription } from '@/hooks/use-speech-transcription';
import { isCheckedPrefix } from '@/lib/assessment-queue';
import { studyReportText } from '@/lib/study-report';
import {
  citationsMatchSource, clearSavedStudies, createSavedStudyId, createSourceIdentity,
  deleteSavedStudy, matchesSource, readSavedStudies, writeSavedStudy,
  type SavedStudySession, type StudySourceIdentity,
} from '@/lib/study-session-storage';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LandingExperience } from '@/components/landing-experience';
import { OfflineSample } from '@/components/offline-sample';
import { LiveWaveform } from '@/components/live-waveform';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
type Phase = 'setup' | 'session' | 'review';

function uncheckedMap(map: StudyMap): StudyMap {
  return { ...map, nodes: map.nodes.map(node => ({ ...node, status: 'skipped', evidence: null })) };
}

const statusMeta = {
  understood: { label: 'Supported', color: 'var(--green)', tint: 'var(--green-pale)' },
  incorrect: { label: 'Contradicted', color: 'var(--red)', tint: 'var(--red-pale)' },
  partial: { label: 'Partially understood', color: 'var(--gold)', tint: 'var(--gray-pale)' },
  skipped: { label: 'Not demonstrated', color: 'var(--gray)', tint: 'var(--gray-pale)' },
  unassessed: { label: 'Not assessed yet', color: '#cbc6da', tint: 'var(--gray-pale)' },
} as const;

function errorMessage(error: unknown) {
  const apiError = error as { status?: number; data?: unknown; message?: string };
  const data = apiError?.data as { message?: string; error?: string } | undefined;
  if (apiError?.status === 503) return data?.message || data?.error || 'AI checking is unavailable. Your answer is unchanged. Ask the workspace owner to check the OpenAI or Gemini connection.';
  if (apiError?.status === 401 || apiError?.status === 403) return 'The study service could not authorize this request. Check the API setup and try again.';
  return data?.message || data?.error || apiError?.message || 'Something interrupted the study check. Your notes are still here; please try again.';
}

function Header({ onHome, phase }: { onHome: () => void; phase: Phase }) {
  return <header className="topbar">
    <button className="brand" onClick={onHome} data-testid="button-home" aria-label="Hearo home">
      <span className="brand-mark"><Headphones size={17} strokeWidth={1.8} /></span>
      <span>Hearo</span>
    </button>
    <div className="top-context">
      <span className="quiet-indicator"><span /> no voice responses</span>
      <span className="top-divider" />
      <span className="step-label">{phase === 'setup' ? '01 / prepare' : phase === 'session' ? '02 / explain' : '03 / reflect'}</span>
    </div>
    <button className="help-button" type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-how-it-works">
      <CircleHelp size={16} /><span>How it works</span>
    </button>
  </header>;
}

function StatusKey() {
  return <div className="status-key" aria-label="Concept map status key">
    <span><i className="key-dot understood-dot" /> understood</span>
    <span><i className="key-dot incorrect-dot" /> revisit</span>
    <span><i className="key-dot partial-dot" /> partial / unverified</span>
    <span><i className="key-dot skipped-dot" /> not mentioned</span>
  </div>;
}

function ConceptMap({ map, compact = false, assessments, assessed = Boolean(assessments) }: {
  map: StudyMap; compact?: boolean; assessments?: StudyEvaluation['assessments']; assessed?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const markerId = `concept-arrow-${useId().replace(/:/g, '')}`;
  const graphRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const [paths, setPaths] = useState<Array<{ key: string; d: string; label: string; x: number; y: number }>>([]);
  const validEdges = useMemo(() => {
    const nodeIds = new Set(map.nodes.map(node => node.id));
    return map.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  }, [map.nodes, map.edges]);
  const selectedNode = map.nodes.find(node => node.id === selectedId) ?? null;
  const statusFor = (nodeId: string, nodeStatus: StudyMap['nodes'][number]['status']) => {
    const verdict = assessments?.find(item => item.conceptId === nodeId)?.verdict;
    if (verdict === 'supported') return 'understood';
    if (verdict === 'contradicted') return 'incorrect';
    if (verdict === 'partially_understood') return 'partial';
    if (verdict === 'not_demonstrated') return 'skipped';
    return nodeStatus === 'skipped' ? assessed ? 'skipped' : 'unassessed' : nodeStatus;
  };
  const statusClass = (status: keyof typeof statusMeta) => status === 'understood' ? 'understood-dot'
    : status === 'incorrect' ? 'incorrect-dot'
      : status === 'partial' ? 'partial-dot'
        : status === 'skipped' ? 'skipped-dot' : 'unassessed-dot';

  useLayoutEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const update = () => {
      const bounds = graph.getBoundingClientRect();
      const width = bounds.width;
      const height = bounds.height;
      setGraphSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      const next = validEdges.flatMap((edge, index) => {
        const from = nodeRefs.current[edge.from];
        const to = nodeRefs.current[edge.to];
        if (!from || !to) return [];
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const ax = a.left + a.width / 2 - bounds.left;
        const ay = a.top + a.height / 2 - bounds.top;
        const bx = b.left + b.width / 2 - bounds.left;
        const by = b.top + b.height / 2 - bounds.top;
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / length;
        const uy = dy / length;
        const boundaryPoint = (x: number, y: number, rect: DOMRect, vx: number, vy: number) => {
          const tx = Math.abs(vx) < .001 ? Infinity : (rect.width / 2 - 8) / Math.abs(vx);
          const ty = Math.abs(vy) < .001 ? Infinity : (rect.height / 2 - 8) / Math.abs(vy);
          const distance = Math.min(tx, ty);
          return { x: x + vx * distance, y: y + vy * distance };
        };
        const start = boundaryPoint(ax, ay, a, ux, uy);
        const end = boundaryPoint(bx, by, b, -ux, -uy);
        const curve = (index % 2 ? 1 : -1) * Math.min(28, length * .08);
        const cx = (start.x + end.x) / 2 - uy * curve;
        const cy = (start.y + end.y) / 2 + ux * curve;
        return [{
          key: `${edge.from}-${edge.to}-${index}`,
          d: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
          label: edge.label,
          x: .25 * start.x + .5 * cx + .25 * end.x,
          y: .25 * start.y + .5 * cy + .25 * end.y - 7,
        }];
      });
      setPaths(previous => previous.length === next.length && previous.every((path, index) => path.d === next[index].d && path.label === next[index].label)
        ? previous : next);
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(graph);
    Object.values(nodeRefs.current).forEach(node => { if (node) observer?.observe(node); });
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [map.nodes, validEdges]);

  if (!map.nodes.length) return <div className="empty-map"><span className="empty-map-icon"><BookOpen size={20} /></span><p>Your concept map will take shape here.</p></div>;

  return <section className={`concept-map ${compact ? 'concept-map-compact' : ''}`} aria-label="Interactive concept map">
    <div className={`concept-map-canvas ${validEdges.length ? 'has-edges' : 'no-edges'}`} ref={graphRef} data-testid="concept-map-graph">
      {graphSize.width > 0 && graphSize.height > 0 && validEdges.length > 0 && <svg className="concept-map-links" viewBox={`0 0 ${graphSize.width} ${graphSize.height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
        {paths.map((path, index) => <g key={path.key}>
          <motion.path d={path.d} markerEnd={`url(#${markerId})`} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .7, delay: reducedMotion ? 0 : index * .09 }} />
          {path.label && <text x={path.x} y={path.y} textAnchor="middle">{path.label}</text>}
        </g>)}
      </svg>}
      <div className="concept-map-nodes">
        {map.nodes.map((node, index) => {
          const visualStatus = statusFor(node.id, node.status) as keyof typeof statusMeta;
          const selected = selectedId === node.id;
          return <motion.button
            key={node.id}
            ref={element => { nodeRefs.current[node.id] = element; }}
            className={`concept-node status-${visualStatus} ${selected ? 'is-selected' : ''}`}
            type="button"
            aria-expanded={selected}
            aria-controls={`${markerId}-details`}
            aria-label={`${node.label}. ${statusMeta[visualStatus].label}. Open concept details.`}
            onClick={() => setSelectedId(selected ? null : node.id)}
            data-testid={`concept-${node.id}`}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 9, scale: reducedMotion ? 1 : .985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: reducedMotion ? 0 : .36, delay: reducedMotion ? 0 : index * .055 }}>
            <span className="concept-node-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="concept-node-copy"><strong>{node.label}</strong><small>{statusMeta[visualStatus].label}</small></span>
            <i className={`concept-node-dot ${statusClass(visualStatus)}`} aria-hidden="true" />
          </motion.button>;
        })}
      </div>
      {validEdges.length > 0 && <ul className="visually-hidden" aria-label="Directed concept relationships">
        {validEdges.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}>
          {map.nodes.find(node => node.id === edge.from)?.label} — {edge.label} → {map.nodes.find(node => node.id === edge.to)?.label}
        </li>)}
      </ul>}
    </div>
    {validEdges.length > 0 && <div className="concept-edge-list" aria-label="Concept map connections">
      <strong>Connections</strong>
      <ul>{validEdges.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}>
        <span>{map.nodes.find(node => node.id === edge.from)?.label}</span><i>{edge.label}</i><span>{map.nodes.find(node => node.id === edge.to)?.label}</span>
      </li>)}</ul>
    </div>}
    <div className="concept-details-slot" id={`${markerId}-details`} aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait" initial={false}>
        {selectedNode ? <motion.article key={selectedNode.id} className="concept-detail-card"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -5 }}
          transition={{ duration: reducedMotion ? 0 : .22 }} data-testid={`concept-details-${selectedNode.id}`}>
          <div className="concept-detail-heading"><h3>{selectedNode.label}</h3><button type="button" onClick={() => setSelectedId(null)} aria-label={`Close ${selectedNode.label} details`} data-testid={`button-close-concept-${selectedNode.id}`}>Close</button></div>
          <p dir="auto">{selectedNode.description}</p>
          <div className="concept-detail-evidence"><span>Evidence · exact provided text</span><p dir="auto">{selectedNode.evidence || 'No evidence attached to this concept yet.'}</p></div>
        </motion.article> : <div className="concept-detail-prompt">Select a concept to open its description and evidence.</div>}
      </AnimatePresence>
    </div>
  </section>;
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
  const [savedStudyLoaded, setSavedStudyLoaded] = useState(false);
  const [sourceIdentity, setSourceIdentity] = useState<StudySourceIdentity | null>(null);
  const [storageMessage, setStorageMessage] = useState('');
  const [sourceIdentityError, setSourceIdentityError] = useState('');
  const transcriptRef = useRef('');
  const changeTranscript = useCallback((text: string) => {
    transcriptRef.current = text;
    setTranscript(text);
  }, []);
  const speech = useSpeechTranscription(text => {
    const next = [transcriptRef.current.trimEnd(), text].filter(Boolean).join(' ');
    changeTranscript(next.slice(0, 12000));
    if (next.length > 12000) {
      setVoiceOverflow(previous => `${previous} ${next.slice(12000)}`.trim());
      setTimeout(() => void speech.stop(), 0);
    }
  });
  const { supported: supportsSpeech, listening, interim, message: micMessage, setMessage: setMicMessage,
    start: startListening, stop: stopListening } = speech;
  const assessmentInput = studyMap && selectedSource ? {
    topic: studyMap.topic, referenceText, transcript: transcript.trim(),
    sourceToken: selectedSource.sourceToken, nodes: studyMap.nodes, edges: studyMap.edges,
  } : null;
  const live = useLiveAssessment({
    input: assessmentInput,
    enabled: phase === 'session' && liveEnabled && !finishing && Boolean(selectedSource?.source.aiAvailable),
    onResult: (result, checked) => {
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
  const saveCurrentStudy = useCallback((text: string) => {
    if (!studyMap || !selectedSource || !sourceIdentity
      || sourceIdentity.id !== selectedSource.source.id
      || sourceIdentity.pdfSha256 !== selectedSource.pdfSha256) return;
    // A prior/prefix result must never be saved as the report for edited text.
    const currentEvaluation = checkedTranscript === text.trim() ? evaluation : null;
    const citedPassageIds = currentEvaluation?.assessments
      ? [...new Set(currentEvaluation.assessments.flatMap(item => item.sourceLineIds))]
      : [];
    const saved: SavedStudySession = {
      id: activeSavedStudyId ?? createSavedStudyId(),
      version: 1,
      savedAt: Date.now(),
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
      if (!activeSavedStudyId) setActiveSavedStudyId(saved.id);
      setStorageMessage('');
    } catch {
      setStorageMessage('This browser could not save your progress. Your answer remains on screen; copy it before leaving or reloading.');
    }
  }, [studyMap, evaluation, checkedTranscript, phase, selectedSource, sourceIdentity, voiceOverflow, previousReport, activeSavedStudyId]);
  useLayoutEffect(() => {
    const draft = [transcript, interim.trim()].filter(Boolean).join(' ');
    saveCurrentStudy(draft.slice(0, 12000));
  }, [transcript, interim, saveCurrentStudy]);

  const beginStudy = () => {
    setError('');
    if (!selectedSource) { setError('اختر ملف PDF المعتمد أولًا. Select and verify the approved PDF first.'); return; }
    prepareStudy.mutate({ data: { topic, referenceText, sourceToken: selectedSource.sourceToken } }, {
      onSuccess: result => { setActiveSavedStudyId(createSavedStudyId()); setStudyMap(result); setEvaluation(null); setCheckedTranscript(''); setPreviousReport(undefined); changeTranscript(''); setVoiceOverflow(''); setPhase('session'); },
      onError: issue => setError(errorMessage(issue)),
    });
  };

  const reopenSavedStudy = (savedStudy: SavedStudySession) => {
    if (!selectedSource || !sourceIdentity) return;
    if (!matchesSource(savedStudy, sourceIdentity)) {
      setStorageMessage('This saved explanation belongs to a different PDF or source version. It was not opened or attached to this source.');
      return;
    }
    if (!citationsMatchSource(savedStudy, selectedSource.source)) {
      setStorageMessage('This saved report cites passages that are not in the verified source. It was not opened.');
      return;
    }
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

  const finishStudy = async () => {
    if (!studyMap || !selectedSource) return;
    setFinishing(true);
    setError('');
    try {
      await stopListening();
      const text = transcriptRef.current.trim();
      if (!text) { setError('أضف شرحًا أولًا. Add a few words before opening your report.'); return; }
      const result = await live.check({
        topic: studyMap.topic, referenceText, transcript: text, sourceToken: selectedSource.sourceToken,
        nodes: studyMap.nodes, edges: studyMap.edges,
      });
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
    saveCurrentStudy(transcriptRef.current);
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

  return <main className="app-shell grain">
    <Header onHome={() => void returnHome()} phase={phase} />
    {showLanding && <LandingExperience
      onLive={() => { setSampleMode(false); setShowLanding(false); }}
      onSample={() => { setSampleMode(true); setShowLanding(false); }}
    />}
    {sampleMode && !showLanding && <OfflineSample onExit={() => { setSampleMode(false); setShowLanding(true); }} />}
    {phase === 'setup' && !showLanding && !sampleMode && <section className="setup-page enter">
      <div className="intro-copy">
        <div className="eyebrow"><span className="eyebrow-rule" /> A quieter way to study</div>
        <h1 className="serif">Say what you<br /><em>understand.</em></h1>
        <p className="intro-text" dir="auto">اشرح أفكارك بصوتك وبكلماتك. Hearo يصغي بصمت ويتحقق منها مقابل المرجع، دون أن يقاطعك. For this demo, read the approved English slides and explain in Arabic or English.</p>
        <div className="intro-note"><span className="note-mark">“</span><p>Talking it through is the study method.<br />Being heard is the whole point.</p></div>
        <div className="steps-rail" aria-label="Three steps">
          <span className="step-current">01 <i>Prepare</i></span><b /><span>02 <i>Explain</i></span><b /><span>03 <i>Reflect</i></span>
        </div>
      </div>
      <div className="setup-card enter-delay">
        <div className="card-kicker"><span>LET’S SET THE TABLE</span><span className="mono">01—03</span></div>
        <ApprovedPdfSource selected={selectedSource} onChange={setSelectedSource} disabled={prepareStudy.isPending} />
        {savedStudyLoaded && <section className="saved-study saved-study-history" aria-label="Saved studies">
          <div className="saved-study-history-heading">
            <div><strong>Your saved studies</strong><p>Drafts and reports stay in this browser. Verify the matching PDF before reopening.</p></div>
            {savedStudies.length > 0 && <button className="saved-study-delete" type="button" onClick={removeAllSavedStudies} data-testid="button-clear-saved-studies">Clear all</button>}
          </div>
          {savedStudies.length === 0
            ? <p className="saved-study-hint">Your explanations and reports will appear here as you work.</p>
            : <ul className="saved-study-list">{savedStudies.map(savedStudy => {
              const sourceMatches = Boolean(selectedSource && sourceIdentity && matchesSource(savedStudy, sourceIdentity));
              const citationsAreValid = Boolean(selectedSource && citationsMatchSource(savedStudy, selectedSource.source));
              return <li className="saved-study-item" key={savedStudy.id} data-testid={`saved-study-${savedStudy.id}`}>
                <div className="saved-study-item-copy">
                  <strong>{savedStudy.source.title}</strong>
                  <span>{savedStudy.evaluation ? 'Assessment report' : 'Draft'} · {new Date(savedStudy.savedAt).toLocaleString()}</span>
                  <p dir="auto">{savedStudy.transcript.trim() || 'No explanation text yet.'}</p>
                </div>
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
        <p className="privacy-line"><span className="privacy-dot" /> With live checks enabled, your text and selected source passages go to OpenAI first, with Gemini used if OpenAI fails. Checks happen automatically after a pause. You can turn live checks off and request only a final review. Your browser’s speech service handles microphone audio and may process it remotely; Hearo does not store audio, PDF bytes, or verification tokens. Drafts and reports are saved in this browser, not in an account. Anyone using this browser profile may see them; delete individual saved studies or clear all here, or clear this site’s browser data.</p>
      </div>
      <div className="how-strip" id="how-it-works">
        <div className="how-title"><span className="mono">A SMALL PROMISE</span><p>We won’t interrupt<br />your train of thought.</p></div>
        <div className="how-item"><span className="how-number">01</span><span>Open the approved English slides. The source passages and learning objectives are fixed for this demo.</span></div>
        <div className="how-item"><span className="how-number">02</span><span>Speak or type in Arabic or English. Hearo checks meaning silently as you pause, without speaking back.</span></div>
        <div className="how-item"><span className="how-number">03</span><span>Watch the concept map update, inspect cited evidence, and finish with a saved, downloadable report.</span></div>
      </div>
    </section>}

    {phase === 'session' && studyMap && <section className="workspace-page enter">
      <div className="session-head">
        <div><button className="back-link" onClick={resetStudy} type="button" data-testid="button-back-setup"><ArrowLeft size={14} /> Change source</button>
          <div className="eyebrow session-eyebrow"><span className="eyebrow-rule" /> YOUR STUDY SESSION</div>
          <h1 className="serif workspace-title">{studyMap.topic}</h1>
          <p className="workspace-subtitle">Take your time. Nothing will speak back.</p>
        </div>
        <div className="session-status"><span className={`session-status-dot ${listening ? 'active' : ''}`} />{listening ? 'Listening' : 'Ready when you are'}</div>
      </div>
      <div className="workspace-grid">
        <section className="explain-panel panel">
          <div className="panel-heading"><div><span className="panel-index">01</span><h2>Explain it your way</h2></div><span className="silence-tag"><span /> SILENT MODE</span></div>
          <p className="panel-hint" dir="auto">اشرح بالعربية أو الإنجليزية. Speak or type in your own words. Live checking updates the map after pauses; Hearo never speaks back.</p>
          <label className="live-toggle"><input type="checkbox" checked={liveEnabled} disabled={finishing} onChange={event => setLiveEnabled(event.target.checked)} data-testid="toggle-live-session" /><span>التحقق المباشر · Live checking</span></label>
          {sourceIdentityError && <p className="saved-study-warning" role="status">{sourceIdentityError}</p>}
          {storageMessage && <p className="saved-study-status" role="status" data-testid="status-storage">{storageMessage}</p>}
          {selectedSource && !selectedSource.source.aiAvailable && <p className="ai-unavailable" role="status">AI checking is not connected yet. You can still read and draft; your answer will not receive a simulated verdict.</p>}
          {supportsSpeech && <div className="mic-row">
            <label className="speech-language">لغة الصوت<select value={speech.language} disabled={listening || finishing} onChange={event => speech.setLanguage(event.target.value)} data-testid="select-speech-language"><option value="ar-SA">العربية</option><option value="en-US">English</option></select></label>
            <button className={`mic-button ${listening ? 'mic-active' : ''}`} type="button" disabled={finishing} onClick={listening ? () => void stopListening() : startListening} data-testid="button-microphone">
              {listening ? <><span className="recording-wave"><i /><i /><i /><i /><i /></span> Pause listening</> : <><Mic size={17} /> Start explaining aloud</>}
            </button>
            {listening && <span className="listening-caption"><i className="pulse-dot" /> Microphone active · Hearo does not store audio</span>}
            <LiveWaveform active={listening} />
          </div>}
          {!supportsSpeech && <p className="mic-notice" role="status">التفريغ الصوتي غير متاح في هذا المتصفح. يمكنك الكتابة أو استخدام Chrome. Speech transcription is unavailable here; typed explanations receive the same checks.</p>}
          {micMessage && <div className="mic-notice" role="status" data-testid="status-mic-message"><MicOff size={15} />{micMessage}<button onClick={() => setMicMessage('')} type="button" aria-label="Dismiss message"><X size={14} /></button></div>}
          <label className="field-label transcript-label" htmlFor="transcript-input">{supportsSpeech ? 'Your running transcript' : 'Your explanation'}</label>
          <div className="transcript-wrap">
            <textarea id="transcript-input" dir="auto" readOnly={finishing} value={transcript} onChange={event => changeTranscript(event.target.value.slice(0, 12000))} maxLength={12000} placeholder="اشرح الفكرة بأسلوبك… / Explain the idea in your own words…" data-testid="input-transcript" />
            {interim && <div className="interim-line"><span className="pulse-dot" />{interim}</div>}
            {!transcript && !interim && <div className="writing-prompt"><span>TRY THIS</span>“The main idea is… because…”</div>}
          </div>
          <div className="transcript-meta"><span>{transcriptWords} words</span><span>{transcript.length.toLocaleString()} / 12,000 characters</span></div>
          {voiceOverflow && <div className="inline-error" role="alert">وصلت إلى حد النص. انسخ الكلمات الزائدة قبل المغادرة. Character limit reached; copy these extra words before leaving: <bdi>{voiceOverflow}</bdi></div>}
          <div className="live-claims">
            <div className="live-claims-head"><span className="mini-eye" /><span>WHAT YOU’VE SAID</span><small>Claims appear as you explain</small></div>
            {claims.length ? <ul>{claims.map((claim, index) => <li key={`${index}-${claim.slice(0, 16)}`} data-testid={`claim-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><bdi>{claim}</bdi></li>)}</ul> : <p className="claims-empty">Your ideas will gather here, just as you said them.</p>}
          </div>
          {error && <div className="inline-error" role="alert" data-testid="status-session-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
          <button type="button" className="primary-button finish-button" onClick={() => void finishStudy()} disabled={finishing} data-testid="button-finish">
            {finishing ? <><span className="button-loader" /> Completing your final check…</> : <>إنهاء الجلسة وعرض التقرير · Finish &amp; report <ArrowRight size={16} /></>}
          </button>
          <p className="finish-note">Keep explaining while live checks run. Requests are spaced at least eight seconds apart. The final report checks your complete explanation, including the last spoken words. Your draft is saved locally; the PDF and authorization token are not saved.</p>
        </section>
        <aside className="map-panel panel">
          <div className="panel-heading"><div><span className="panel-index">02</span><h2>Your concept map</h2></div><span className="node-count mono">{studyMap.nodes.length} IDEAS</span></div>
          <p className="panel-hint map-hint">Hearo-authored learning objectives grounded in selected passages from slides 4–10.</p>
          <StatusKey />
          <div className="live-check-status" role="status" data-testid="status-live-check">
            {live.busy ? <><span className="button-loader" /> جارٍ التحقق بصمت · Checking silently…</> : !liveEnabled ? 'التحقق المباشر متوقف · Live checks paused' : live.error ? 'تعذر التحقق؛ تم إيقاف الطلبات التلقائية · Checks paused after an error; retry when ready' : checkedTranscript === transcript.trim() && evaluation ? 'تم التحقق من شرحك الحالي · Current explanation checked' : hasCheckedPrefix ? `تم التحقق من ${checkedTranscript.split(/\s+/).length} كلمة؛ الباقي قيد الانتظار · More words awaiting a check` : 'بانتظار شرحك · Waiting for your explanation'}
          </div>
          {Boolean(live.error) && liveEnabled && <div className="live-check-error" role="alert"><p>{errorMessage(live.error)}</p><button type="button" className="back-link" disabled={live.busy || finishing} onClick={() => { if (assessmentInput) void live.check(assessmentInput, true).catch(() => undefined); }} data-testid="button-retry-live">إعادة المحاولة · Retry check</button></div>}
          {previousReport && <div className="live-check-error">
            <p>التقرير السابق يخص الشرح الذي تم التحقق منه فقط، وليس المسودة الحالية. Your previous report covers only its checked explanation, not the current draft.</p>
            <button type="button" className="back-link" onClick={() => downloadReport(true)} data-testid="button-download-previous-report">تنزيل التقرير السابق · Download previous report</button>
          </div>}
           <ConceptMap map={visibleMap!} assessments={hasCheckedPrefix ? evaluation?.assessments : undefined} assessed={hasCheckedPrefix && Boolean(evaluation)} />
          {hasCheckedPrefix && evaluation?.assessments && selectedSource && <AssessmentEvidence assessments={evaluation.assessments.filter(item => item.verdict !== 'not_demonstrated')} source={selectedSource.source} fileUrl={selectedSource.fileUrl} map={studyMap} onPractice={() => document.getElementById('transcript-input')?.focus()} />}
          {selectedSource && <SourcePassages source={selectedSource.source} fileUrl={selectedSource.fileUrl} />}
           <div className="map-foot"><span className="map-foot-mark"><BookOpen size={14} /></span><span>Green: supported · Red: contradicted · Amber: partial or unverified · Grey: not mentioned. Earlier checks cover only the words already checked.</span></div>
        </aside>
      </div>
    </section>}

    {phase === 'review' && evaluation && studyMap && overall && <section className="review-page enter">
      <div className="review-top">
        <button className="back-link" onClick={() => setPhase('session')} type="button" data-testid="button-back-review"><ArrowLeft size={14} /> Back to my explanation</button>
        <div className="eyebrow"><span className="eyebrow-rule" /> SESSION REFLECTION</div>
        <h1 className="serif review-title">You made it <em>yours.</em></h1>
        <p className="review-description">Here’s what your explanation showed about <strong>{studyMap.topic}</strong>. A map to guide your next pass, not a grade.</p>
        {voiceOverflow && <p className="saved-study-warning" role="status">This report checks only the first 12,000 characters. Extra spoken words are preserved in the download as unassessed text: <bdi>{voiceOverflow}</bdi></p>}
        <button className="upload-button" type="button" onClick={() => downloadReport()} data-testid="button-download-report">تنزيل التقرير · Download report</button>
      </div>
      <div className="review-summary">
        <div className="summary-intro"><span className="mono">YOUR MAP, UPDATED</span><h2 className="serif">Understanding<br />has its own shape.</h2><StatusKey /></div>
        <div className="summary-stats">
          <div className="summary-stat"><span className="stat-dot understood-dot" /><strong>{overall.understood}</strong><span>understood</span></div>
          <div className="summary-stat"><span className="stat-dot incorrect-dot" /><strong>{overall.revisit}</strong><span>to revisit</span></div>
            <div className="summary-stat"><span className="stat-dot skipped-dot" /><strong>{overall.skipped}</strong><span>not fully demonstrated</span></div>
        </div>
         <div className="review-map"><ConceptMap map={studyMap} assessments={evaluation.assessments} assessed /></div>
      </div>
      <div className="reflection-section">
        {evaluation.assessments && selectedSource ? <AssessmentEvidence assessments={evaluation.assessments} source={selectedSource.source} fileUrl={selectedSource.fileUrl} map={studyMap} onPractice={() => setPhase('session')} /> : evaluation.feedback.length ? <div className="feedback-list">
          {evaluation.feedback.map((item, index) => <article key={`${item.statement}-${index}`} className={`feedback-item feedback-${item.status}`} data-testid={`feedback-${index}`}>
            <button className="feedback-toggle" type="button" onClick={() => setFeedbackOpen(feedbackOpen === `${index}` ? null : `${index}`)} aria-expanded={feedbackOpen === `${index}`} data-testid={`button-feedback-${index}`}>
              <span className="feedback-status-icon">{item.status === 'understood' ? <Check size={15} /> : <RotateCcw size={15} />}</span>
              <span className="feedback-quote">“{item.statement}”</span><ChevronDown size={16} className={`feedback-chevron ${feedbackOpen === `${index}` ? 'open' : ''}`} />
            </button>
            <div className="feedback-explanation"><p>{item.explanation}</p></div>
          </article>)}
        </div> : <div className="feedback-empty"><CheckCircle2 size={19} /><div><strong>A thoughtful first pass.</strong><p>There weren’t specific claims to annotate. Use the map as a prompt for another round.</p></div></div>}
      </div>
      <section className="transcript-review">
        <div className="transcript-review-head"><span className="mono">YOUR WORDS, UNCHANGED</span><span>{transcriptWords} words</span></div>
        <p dir="auto">{transcript}</p>
      </section>
      {error && <div className="inline-error review-error" role="alert" data-testid="status-review-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
      {storageMessage && <p className="saved-study-status" role="status" data-testid="status-storage">{storageMessage}</p>}
      <div className="review-actions"><p>Good learning leaves room for a second telling.</p><button className="primary-button" type="button" onClick={resetStudy} data-testid="button-new-session">Start a new session <ArrowRight size={16} /></button></div>
    </section>}
    <footer className="site-footer"><span>HEARO <i>·</i> A STUDY SPACE</span><span>English source · Arabic or English answers</span></footer>
  </main>;
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
