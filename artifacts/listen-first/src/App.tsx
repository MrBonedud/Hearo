import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEvaluateStudy, usePrepareStudy } from '@workspace/api-client-react';
import type { StudyEdge, StudyEvaluation, StudyMap } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, CircleHelp,
  FileText, Headphones, Mic, MicOff, RotateCcw, Upload, X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
type Phase = 'setup' | 'session' | 'review';
type SpeechRecognitionResult = { transcript: string };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<ArrayLike<SpeechRecognitionResult>> };
type SpeechRecognitionLike = {
  continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const statusMeta = {
  understood: { label: 'Understood', color: 'var(--green)', tint: 'var(--green-pale)' },
  incorrect: { label: 'Needs another look', color: 'var(--red)', tint: 'var(--red-pale)' },
  skipped: { label: 'Not covered yet', color: 'var(--gray)', tint: 'var(--gray-pale)' },
} as const;

function errorMessage(error: unknown) {
  const apiError = error as { status?: number; data?: unknown; message?: string };
  if (apiError?.status === 503) return 'The study checker is not configured yet. Ask your workspace owner to add the missing OPENAI_API_KEY, then try again.';
  if (apiError?.status === 401 || apiError?.status === 403) return 'The study service could not authorize this request. Check the API setup and try again.';
  const data = apiError?.data as { message?: string; error?: string } | undefined;
  return data?.message || data?.error || apiError?.message || 'Something interrupted the study check. Your notes are still here; please try again.';
}

function Header({ onHome, phase }: { onHome: () => void; phase: Phase }) {
  return <header className="topbar">
    <button className="brand" onClick={onHome} data-testid="button-home" aria-label="Listen First home">
      <span className="brand-mark"><Headphones size={17} strokeWidth={1.8} /></span>
      <span>listen<span className="brand-light">first</span></span>
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
    <span><i className="key-dot skipped-dot" /> not covered</span>
  </div>;
}

function ConceptMap({ map, compact = false }: { map: StudyMap; compact?: boolean }) {
  if (!map.nodes.length) return <div className="empty-map"><span className="empty-map-icon"><BookOpen size={20} /></span><p>Your concept map will take shape here.</p></div>;
  const edgesByTarget = new Map<string, StudyEdge[]>();
  map.edges.forEach(edge => edgesByTarget.set(edge.to, [...(edgesByTarget.get(edge.to) || []), edge]));
  return <div className={`concept-list ${compact ? 'concept-list-compact' : ''}`}>
    {map.nodes.map((node, index) => <article key={node.id} className={`concept-row status-${node.status}`} data-testid={`concept-${node.id}`}>
      <div className="concept-index">{String(index + 1).padStart(2, '0')}</div>
      <div className="concept-body">
        {index > 0 && edgesByTarget.get(node.id)?.[0] && <span className="edge-label">{edgesByTarget.get(node.id)?.[0].label}</span>}
        <h3>{node.label}</h3>
        {!compact && <p>{node.description}</p>}
        {node.evidence && !compact && <div className="evidence-line"><span>REFERENCE</span>{node.evidence}</div>}
      </div>
      <span className="concept-status" title={statusMeta[node.status].label}><i className={`key-dot ${node.status}-dot`} /></span>
    </article>)}
  </div>;
}

function App() {
  const prepareStudy = usePrepareStudy();
  const evaluateStudy = useEvaluateStudy();
  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [studyMap, setStudyMap] = useState<StudyMap | null>(null);
  const [evaluation, setEvaluation] = useState<StudyEvaluation | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [micMessage, setMicMessage] = useState('');
  const [error, setError] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supportsSpeech = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const speechWindow = window as SpeechWindow;
    return Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
  }, []);
  const wordCount = referenceText.trim() ? referenceText.trim().split(/\s+/).length : 0;
  const transcriptWords = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const claims = useMemo(() => (transcript + (interim ? ` ${interim}` : '')).split(/(?<=[.!?])\s+/).filter(Boolean).slice(-5), [transcript, interim]);

  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  const handleFile = async (file?: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'md'].includes(extension || '')) {
      setError('Choose a .txt or .md file so the reference stays easy to read.');
      return;
    }
    try {
      const text = await file.text();
      setReferenceText(text.slice(0, 30000));
      setSourceName(file.name);
      setError('');
    } catch {
      setError('That file could not be opened. You can paste the reference text instead.');
    }
  };

  const beginStudy = () => {
    setError('');
    if (!topic.trim()) { setError('Give this study session a topic first.'); return; }
    if (referenceText.trim().length < 80) { setError('Add at least 80 characters of reference material so claims can be checked against something reliable.'); return; }
    if (referenceText.length > 30000) { setError('Your reference is longer than 30,000 characters. Trim it a little and try again.'); return; }
    prepareStudy.mutate({ data: { topic: topic.trim(), referenceText: referenceText.trim() } }, {
      onSuccess: result => { setStudyMap(result); setEvaluation(null); setTranscript(''); setInterim(''); setPhase('session'); },
      onError: issue => setError(errorMessage(issue)),
    });
  };

  const startListening = async () => {
    setMicMessage('');
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setMicMessage('Microphone transcription is not available in this browser. Type your explanation in the notes area instead.'); return; }
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';
      recognition.onresult = event => {
        let finalText = '';
        let current = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result?.[0]) {
            if ((result as ArrayLike<SpeechRecognitionResult> & { isFinal?: boolean }).isFinal) finalText += result[0].transcript;
            else current += result[0].transcript;
          }
        }
        if (finalText) setTranscript(previous => `${previous}${previous && !/\s$/.test(previous) ? ' ' : ''}${finalText.trim()}`);
        setInterim(current);
      };
      recognition.onerror = event => {
        setListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setMicMessage('Microphone permission was not granted. Allow microphone access in your browser settings, or type your explanation below.');
        else if (event.error === 'audio-capture') setMicMessage('No microphone was found. You can continue by typing your explanation below.');
        else if (event.error !== 'aborted') setMicMessage('The microphone paused unexpectedly. Try again, or keep going with typed notes.');
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      setMicMessage('The microphone could not start. Check browser permissions, or type your explanation below.');
    }
  };

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); setInterim(''); };

  const finishStudy = () => {
    if (!studyMap) return;
    if (transcript.trim().length < 1) { setError('Add a few words to your explanation before asking for a review.'); return; }
    stopListening();
    setError('');
    evaluateStudy.mutate({ data: {
      topic: studyMap.topic, referenceText, transcript: transcript.trim(),
      nodes: studyMap.nodes, edges: studyMap.edges,
    } }, {
      onSuccess: result => { setEvaluation(result); setStudyMap({ topic: result.topic, nodes: result.nodes, edges: result.edges }); setPhase('review'); },
      onError: issue => setError(errorMessage(issue)),
    });
  };

  const resetStudy = () => {
    stopListening();
    setPhase('setup'); setEvaluation(null); setStudyMap(null); setTranscript(''); setInterim('');
    setError(''); setMicMessage('');
  };

  const overall = evaluation ? {
    understood: evaluation.nodes.filter(node => node.status === 'understood').length,
    revisit: evaluation.nodes.filter(node => node.status === 'incorrect').length,
    skipped: evaluation.nodes.filter(node => node.status === 'skipped').length,
  } : null;

  return <main className="app-shell grain">
    <Header onHome={resetStudy} phase={phase} />
    {phase === 'setup' && <section className="setup-page enter">
      <div className="intro-copy">
        <div className="eyebrow"><span className="eyebrow-rule" /> A quieter way to study</div>
        <h1 className="serif">Say what you<br /><em>understand.</em></h1>
        <p className="intro-text">Explain it in your own words. Listen First stays quiet, checks your ideas against the source, and shows you what’s sticking.</p>
        <div className="intro-note"><span className="note-mark">“</span><p>Talking it through is the study method.<br />Being heard is the whole point.</p></div>
        <div className="steps-rail" aria-label="Three steps">
          <span className="step-current">01 <i>Prepare</i></span><b /><span>02 <i>Explain</i></span><b /><span>03 <i>Reflect</i></span>
        </div>
      </div>
      <div className="setup-card enter-delay">
        <div className="card-kicker"><span>LET’S SET THE TABLE</span><span className="mono">01—03</span></div>
        <label className="field-label" htmlFor="topic-input">What are you learning?</label>
        <input id="topic-input" className="text-input topic-input" value={topic} onChange={event => setTopic(event.target.value)} placeholder="e.g. How photosynthesis works" maxLength={120} data-testid="input-topic" />
        <div className="label-row"><label className="field-label" htmlFor="reference-input">Your reference material</label><span className="optional-note">private to this session</span></div>
        <div className={`reference-box ${referenceText ? 'has-text' : ''}`}>
          <textarea id="reference-input" value={referenceText} onChange={event => { setReferenceText(event.target.value); if (sourceName) setSourceName(''); }} placeholder="Paste your notes, textbook passage, or a summary you trust…" maxLength={30000} data-testid="input-reference" />
          <div className="reference-footer">
            <span className="source-indicator">{sourceName ? <><FileText size={13} /> {sourceName}</> : <>{wordCount} words <span>·</span> 80 minimum</>}</span>
            <button type="button" className="upload-button" onClick={() => fileRef.current?.click()} data-testid="button-upload-reference"><Upload size={14} /> Upload .txt / .md</button>
            <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="visually-hidden" onChange={event => handleFile(event.target.files?.[0])} data-testid="input-file" />
          </div>
        </div>
        {error && <div className="inline-error" role="alert" data-testid="status-setup-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
        <button className="primary-button start-button" type="button" onClick={beginStudy} disabled={prepareStudy.isPending} data-testid="button-prepare">
          {prepareStudy.isPending ? <><span className="button-loader" /> Making a map from your material…</> : <>Build my concept map <ArrowRight size={16} /></>}
        </button>
        <p className="privacy-line"><span className="privacy-dot" /> Your source and transcript stay in this session, not an account.</p>
      </div>
      <div className="how-strip" id="how-it-works">
        <div className="how-title"><span className="mono">A SMALL PROMISE</span><p>We won’t interrupt<br />your train of thought.</p></div>
        <div className="how-item"><span className="how-number">01</span><span>Bring a source you trust. We’ll shape it into a map of the key ideas.</span></div>
        <div className="how-item"><span className="how-number">02</span><span>Explain aloud or type. No voice, hints, or interruptions from us.</span></div>
        <div className="how-item"><span className="how-number">03</span><span>When you’re done, see which ideas held and which need another pass.</span></div>
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
          <p className="panel-hint">{supportsSpeech ? 'Use your voice, or write it out. The checker waits until you finish.' : 'Microphone transcription isn’t supported here. Type your explanation below.'}</p>
          {supportsSpeech && <div className="mic-row">
            <button className={`mic-button ${listening ? 'mic-active' : ''}`} type="button" onClick={listening ? stopListening : startListening} data-testid="button-microphone">
              {listening ? <><span className="recording-wave"><i /><i /><i /><i /><i /></span> Pause listening</> : <><Mic size={17} /> Start explaining aloud</>}
            </button>
            {listening && <span className="listening-caption"><i className="pulse-dot" /> Listening only — no audio is saved</span>}
          </div>}
          {micMessage && <div className="mic-notice" role="status" data-testid="status-mic-message"><MicOff size={15} />{micMessage}<button onClick={() => setMicMessage('')} type="button" aria-label="Dismiss message"><X size={14} /></button></div>}
          <label className="field-label transcript-label" htmlFor="transcript-input">{supportsSpeech ? 'Your running transcript' : 'Your explanation'}</label>
          <div className="transcript-wrap">
            <textarea id="transcript-input" value={transcript} onChange={event => setTranscript(event.target.value.slice(0, 12000))} maxLength={12000} placeholder="Start with the main idea. What is it, and how does it connect to the next thing?" data-testid="input-transcript" />
            {interim && <div className="interim-line"><span className="pulse-dot" />{interim}</div>}
            {!transcript && !interim && <div className="writing-prompt"><span>TRY THIS</span>“The main idea is… because…”</div>}
          </div>
          <div className="transcript-meta"><span>{transcriptWords} words</span><span>{transcript.length.toLocaleString()} / 12,000 characters</span></div>
          <div className="live-claims">
            <div className="live-claims-head"><span className="mini-eye" /><span>WHAT YOU’VE SAID</span><small>Claims appear as you explain</small></div>
            {claims.length ? <ul>{claims.map((claim, index) => <li key={`${index}-${claim.slice(0, 16)}`} data-testid={`claim-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{claim}</li>)}</ul> : <p className="claims-empty">Your ideas will gather here, just as you said them.</p>}
          </div>
          {error && <div className="inline-error" role="alert" data-testid="status-session-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
          <button type="button" className="primary-button finish-button" onClick={finishStudy} disabled={evaluateStudy.isPending} data-testid="button-finish">
            {evaluateStudy.isPending ? <><span className="button-loader" /> Reading your explanation…</> : <>I’m ready to review <ArrowRight size={16} /></>}
          </button>
          <p className="finish-note">The check happens only when you choose to finish.</p>
        </section>
        <aside className="map-panel panel">
          <div className="panel-heading"><div><span className="panel-index">02</span><h2>Your concept map</h2></div><span className="node-count mono">{studyMap.nodes.length} IDEAS</span></div>
          <p className="panel-hint map-hint">A quiet outline of the material you brought.</p>
          <StatusKey />
          <ConceptMap map={studyMap} />
          <div className="map-foot"><span className="map-foot-mark"><BookOpen size={14} /></span><span>Nothing is scored until your review.</span></div>
        </aside>
      </div>
    </section>}

    {phase === 'review' && evaluation && studyMap && overall && <section className="review-page enter">
      <div className="review-top">
        <button className="back-link" onClick={() => setPhase('session')} type="button" data-testid="button-back-review"><ArrowLeft size={14} /> Back to my explanation</button>
        <div className="eyebrow"><span className="eyebrow-rule" /> SESSION REFLECTION</div>
        <h1 className="serif review-title">You made it <em>yours.</em></h1>
        <p className="review-description">Here’s what your explanation showed about <strong>{studyMap.topic}</strong>. A map to guide your next pass, not a grade.</p>
      </div>
      <div className="review-summary">
        <div className="summary-intro"><span className="mono">YOUR MAP, UPDATED</span><h2 className="serif">Understanding<br />has its own shape.</h2><StatusKey /></div>
        <div className="summary-stats">
          <div className="summary-stat"><span className="stat-dot understood-dot" /><strong>{overall.understood}</strong><span>understood</span></div>
          <div className="summary-stat"><span className="stat-dot incorrect-dot" /><strong>{overall.revisit}</strong><span>to revisit</span></div>
          <div className="summary-stat"><span className="stat-dot skipped-dot" /><strong>{overall.skipped}</strong><span>not covered</span></div>
        </div>
        <div className="review-map"><ConceptMap map={studyMap} /></div>
      </div>
      <div className="reflection-section">
        <div className="reflection-heading"><div><span className="mono">A CLOSER LISTEN</span><h2 className="serif">Notes on your explanation</h2></div><span>{evaluation.feedback.length} {evaluation.feedback.length === 1 ? 'observation' : 'observations'}</span></div>
        {evaluation.feedback.length ? <div className="feedback-list">
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
        <p>{transcript}</p>
      </section>
      {error && <div className="inline-error review-error" role="alert" data-testid="status-review-error"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss message"><X size={14} /></button></div>}
      <div className="review-actions"><p>Good learning leaves room for a second telling.</p><button className="primary-button" type="button" onClick={resetStudy} data-testid="button-new-session">Study something else <ArrowRight size={16} /></button></div>
    </section>}
    <footer className="site-footer"><span>LISTEN FIRST <i>·</i> A STUDY SPACE</span><span>Quiet by design.</span></footer>
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
