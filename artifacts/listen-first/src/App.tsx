import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { useSendDemoMessage } from '@workspace/api-client-react';
import type { DemoBrowserMessage, DemoClaim, DemoConceptState, DemoMessageResponse, DemoTopicPack } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, CircleHelp, Headphones, Play, Square } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { initialStudyState, studyReducer } from '@/lib/study-reducer';
import { demoReplaySentences } from '@/lib/demo-replay';

const queryClient = new QueryClient();
const STORE_KEY = 'hearo-journal-v1';
const REPLAY_DELAY = 1300;

const stateMeta: Record<DemoConceptState, { label: string; color: string }> = {
  grey: { label: 'لم يُغطَّ بعد', color: 'var(--gray)' },
  green: { label: 'صحيح', color: 'var(--green)' },
  red: { label: 'خطأ', color: 'var(--red)' },
  amber: { label: 'غير مؤكَّد', color: 'var(--gold)' },
};
const verdictLabel: Record<DemoClaim['verdict'], string> = { supported: 'مدعوم بالمصدر', contradicts: 'يناقض المصدر', unverified: 'غير مؤكَّد' };

function validStoredResponse(value: unknown): value is DemoMessageResponse {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: Record<string, unknown>, keys: string[]) => keys.every(k => typeof v[k] === 'string');
  const list = (v: unknown, check: (item: unknown) => boolean) => Array.isArray(v) && v.every(check);
  const evidence = (v: unknown) => obj(v) && typeof v.line_id === 'number' && typeof v.quote === 'string';
  const claim = (v: unknown) => obj(v) && typeof v.concept_id === 'string' &&
    ['supported', 'contradicts', 'unverified'].includes(String(v.verdict)) && typeof v.confidence === 'number' &&
    (v.evidence === null || evidence(v.evidence)) && (v.correction === null || typeof v.correction === 'string');
  const report = (v: unknown) => obj(v) &&
    ['score', 'coverage', 'accuracy', 'covered_count', 'must_cover_count', 'correct_count', 'assessed_count']
      .every(k => typeof v[k] === 'number') && typeof v.tomorrow_question === 'string' &&
    list(v.gaps, g => obj(g) && strings(g, ['concept_id', 'label', 'question']) && Object.hasOwn(stateMeta, String(g.state))) &&
    list(v.errors, e => obj(e) && strings(e, ['sentence_id', 'concept_id', 'statement', 'correction']) &&
      evidence(e.evidence) && typeof e.resolved === 'boolean') &&
    list(v.strengths, s => obj(s) && strings(s, ['concept_id', 'label'])) &&
    list(v.self_corrections, s => obj(s) && strings(s, ['concept_id', 'label'])) &&
    list(v.review_questions, q => obj(q) && strings(q, ['concept_id', 'question']));
  if (!obj(value) || typeof value.session_id !== 'string' || !obj(value.topic_pack)) return false;
  const pack = value.topic_pack;
  if (!strings(pack, ['id', 'title_ar', 'title_en']) ||
      !list(pack.concepts, c => obj(c) && strings(c, ['id', 'label_ar', 'label_en', 'gap_question', 'aliases']) &&
        typeof c.must_cover === 'boolean' && typeof c.x === 'number' && typeof c.y === 'number' &&
        list(c.supporting_lines, n => typeof n === 'number') && list(c.dependencies, d => typeof d === 'string')) ||
      !Array.isArray(pack.concepts) || !pack.concepts.length ||
      !list(pack.reference_lines, l => obj(l) && typeof l.line_id === 'number' && typeof l.text === 'string') ||
      !list(pack.misconceptions, m => obj(m) && strings(m, ['concept_id', 'wrong_claim', 'correction']) &&
        typeof m.source_line_id === 'number')) return false;
  return list(value.events, e => {
    if (!obj(e) || e.session_id !== value.session_id) return false;
    switch (e.type) {
      case 'sentence': return strings(e, ['sentence_id', 'text']);
      case 'claim': return typeof e.sentence_id === 'string' && claim(e.claim);
      case 'concept_state': return typeof e.concept_id === 'string' && Object.hasOwn(stateMeta, String(e.state)) &&
        (e.sentence_id === null || typeof e.sentence_id === 'string');
      case 'report': return report(e.report);
      case 'error': return typeof e.message === 'string';
      default: return false;
    }
  });
}
function loadJournal(): { journal: DemoMessageResponse[]; warning: string | null } {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return { journal: [], warning: null };
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(validStoredResponse)) {
      return { journal: [], warning: 'تعذّر استعادة النسخة المحفوظة في هذا التبويب. ابدأ جلسة جديدة.' };
    }
    return { journal: data, warning: null };
  } catch {
    return { journal: [], warning: 'تعذّر قراءة التخزين المؤقت لهذا التبويب. إعادة التحميل قد تفقد الجلسة.' };
  }
}
function saveJournal(journal: DemoMessageResponse[]): string | null {
  try {
    if (journal.length) sessionStorage.setItem(STORE_KEY, JSON.stringify(journal));
    else sessionStorage.removeItem(STORE_KEY);
    return null;
  } catch { return 'تعذّر حفظ آخر تحديث في هذا التبويب. لا تعِد التحميل قبل قراءة التقرير.'; }
}
function arabicError(error: unknown) {
  const e = error as { status?: number; data?: { error?: string } };
  if (typeof e?.data?.error === 'string') return e.data.error;
  if (e?.status === 404 || e?.status === 410) return 'انتهت صلاحية الجلسة على الخادم. ابدأ جلسة جديدة.';
  if (e?.status === 429) return 'الطلبات كثيرة الآن. انتظر قليلًا ثم أعد المحاولة.';
  if (e?.status && e.status >= 500) return 'تعذّر على الخادم معالجة الجملة. جملتك محفوظة، أعد المحاولة.';
  return 'تعذّر الاتصال بالخادم. جملتك ما زالت في الحقل، أعد المحاولة.';
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Header({ onHome, label }: { onHome: () => void; label: string }) {
  return <header className="topbar">
    <button className="brand" onClick={onHome} data-testid="button-home" aria-label="Hearo">
      <span className="brand-mark"><Headphones size={17} strokeWidth={1.8} /></span>
      <span>Hearo</span>
    </button>
    <div className="top-context"><span className="quiet-indicator"><span /> بلا ردود صوتية</span><span className="top-divider" /><span className="step-label">{label}</span></div>
    <button className="help-button" type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-how-it-works"><CircleHelp size={16} /><span>كيف يعمل</span></button>
  </header>;
}

function ConceptMap({ pack, concepts }: { pack: DemoTopicPack; concepts: Record<string, DemoConceptState> }) {
  const xs = pack.concepts.map(c => c.x), ys = pack.concepts.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pos = (c: { x: number; y: number }) => ({
    left: 8 + (maxX === minX ? 0.5 : (c.x - minX) / (maxX - minX)) * 84,
    top: 8 + (maxY === minY ? 0.5 : (c.y - minY) / (maxY - minY)) * 84,
  });
  const byId = new Map(pack.concepts.map(c => [c.id, c]));
  return <div className="h-map-scroll"><div className="h-map" style={{ minHeight: Math.max(480, (new Set(ys).size) * 110) }}>
    <svg className="h-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {pack.concepts.flatMap(c => c.dependencies.map(dep => {
        const from = byId.get(dep); if (!from) return null;
        const a = pos(from), b = pos(c);
        return <line key={`${dep}-${c.id}`} x1={a.left} y1={a.top} x2={b.left} y2={b.top} vectorEffect="non-scaling-stroke" />;
      }))}
    </svg>
    {pack.concepts.map(c => {
      const st = concepts[c.id] ?? 'grey'; const p = pos(c);
      return <div key={c.id} className={`h-node h-node-${st}`} style={{ left: `${p.left}%`, top: `${p.top}%` }} data-state={st} data-testid={`concept-${c.id}`}>
        <i className="key-dot" style={{ background: stateMeta[st].color }} />
        <strong>{c.label_ar}</strong><bdi dir="auto" className="h-en">{c.label_en}</bdi>
        <em>{stateMeta[st].label}{c.must_cover ? '' : ' · إضافي'}</em>
      </div>;
    })}
  </div></div>;
}

function StateKey() {
  return <div className="status-key" aria-label="دليل الألوان">
    {(Object.keys(stateMeta) as DemoConceptState[]).map(k => <span key={k}><i className="key-dot" style={{ background: stateMeta[k].color }} /> {stateMeta[k].label}</span>)}
  </div>;
}

function App() {
  const send = useSendDemoMessage();
  const sendRef = useRef(send.mutateAsync);
  sendRef.current = send.mutateAsync;
  const [stored] = useState(loadJournal);
  const journalRef = useRef<DemoMessageResponse[]>(stored.journal);
  const [storageWarning, setStorageWarning] = useState(stored.warning);
  const [state, dispatch] = useReducer(studyReducer, journalRef.current, (journal: DemoMessageResponse[]) =>
    journal.reduce((s, response) => studyReducer(s, { type: 'response', response }), initialStudyState));
  const stateRef = useRef(state);
  stateRef.current = state;
  const lockRef = useRef(false);
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  const stopReplayRef = useRef(false);
  const counterRef = useRef(0);
  const [busy, setBusy] = useState<null | 'start' | 'text' | 'stop'>(null);
  const [replaying, setReplaying] = useState(false);
  const [retry, setRetry] = useState<{ id: string; text: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const form = useForm<{ sentence: string }>({ defaultValues: { sentence: '' } });

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; stopReplayRef.current = true; }; }, []);
  useEffect(() => {
    if (state.report) document.getElementById('session-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state.report]);

  const post = async (message: DemoBrowserMessage, kind: 'start' | 'text' | 'stop'): Promise<boolean> => {
    if (lockRef.current) return false;
    lockRef.current = true; setBusy(kind);
    const gen = genRef.current;
    try {
      const response = await sendRef.current({ data: message });
      if (!mountedRef.current || gen !== genRef.current) return false;
      // Store the pack once, not once per sentence; a full demo remains below browser storage quotas.
      journalRef.current = [{
        ...response, events: [...journalRef.current.flatMap(item => item.events), ...response.events],
      }];
      setStorageWarning(saveJournal(journalRef.current));
      dispatch({ type: 'response', response });
      return true;
    } catch (error) {
      if (mountedRef.current && gen === genRef.current) dispatch({ type: 'error', message: arabicError(error) });
      return false;
    } finally {
      lockRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const sendFinal = async (text: string, fixedId?: string): Promise<boolean> => {
    const sessionId = stateRef.current.sessionId;
    if (!sessionId) return false;
    const id = fixedId ?? (retry && retry.text === text ? retry.id : `typed-${Date.now().toString(36)}-${++counterRef.current}`);
    const gen = genRef.current;
    const ok = await post({ type: 'text', session_id: sessionId, sentence_id: id, text }, 'text');
    if (gen !== genRef.current || !mountedRef.current) return false;
    setRetry(ok ? null : { id, text });
    if (!ok) form.setValue('sentence', text, { shouldDirty: true });
    return ok;
  };

  const start = () => { if (!lockRef.current) void post({ type: 'start', topic_id: 'system-design' }, 'start'); };
  const submit = async (values: { sentence: string }) => {
    const text = values.sentence.trim();
    if (!text || lockRef.current || replaying) return;
    if (await sendFinal(text)) form.reset({ sentence: '' });
  };
  const endSession = () => {
    const sid = state.sessionId;
    if (sid && !lockRef.current && !replaying) void post({ type: 'stop', session_id: sid }, 'stop');
  };
  const reset = () => {
    if (lockRef.current) return;
    genRef.current++; stopReplayRef.current = true;
    journalRef.current = []; setStorageWarning(saveJournal([]));
    dispatch({ type: 'reset' }); setRetry(null); setOpen({}); setReplaying(false); form.reset({ sentence: '' });
  };
  const replay = async () => {
    const pack = stateRef.current.pack;
    if (!pack || lockRef.current || replaying) return;
    let items;
    try { items = demoReplaySentences(pack); } catch (e) { dispatch({ type: 'error', message: e instanceof Error ? e.message : 'تعذّر تجهيز التسجيل.' }); return; }
    const gen = genRef.current;
    const replayId = `replay-${Date.now().toString(36)}-${++counterRef.current}`;
    stopReplayRef.current = false; setReplaying(true);
    for (let i = 0; i < items.length; i++) {
      if (stopReplayRef.current || gen !== genRef.current) break;
      const ok = await sendFinal(items[i].text, `${replayId}-${i + 1}`);
      if (!ok || stopReplayRef.current || gen !== genRef.current) break;
      await sleep(REPLAY_DELAY);
    }
    if (mountedRef.current && gen === genRef.current) setReplaying(false);
  };
  const stopReplay = () => { stopReplayRef.current = true; };
  const fillExample = (text: string) => { form.setValue('sentence', text, { shouldDirty: true }); document.getElementById('sentence-input')?.focus(); };

  const { pack, report } = state;
  const phase = !state.sessionId || !pack ? 'setup' : report ? 'report' : 'explaining';
  const disabled = busy !== null || replaying;
  const errorBox = state.error && <div className="inline-error" role="alert" data-testid="status-error"><span>!</span>{state.error}
    <button type="button" onClick={() => dispatch({ type: 'error', message: null })} aria-label="إغلاق">×</button></div>;
  const lineText = (id: number) => pack?.reference_lines.find(l => l.line_id === id)?.text ?? '';
  const conceptLabel = (id: string) => pack?.concepts.find(c => c.id === id)?.label_ar ?? id;

  const notice = <p className="h-notice" data-testid="text-demo-notice">مطابقة مؤلَّفة مسبقًا لهذا العرض التجريبي، وليست تحقّقًا عامًّا بالذكاء الاصطناعي. إعادة الصياغة الحرة لا يمكن الحكم عليها بشكل موثوق، لذا استخدم جمل المصدر أو الأمثلة أدناه.</p>;
  const storage = <><p className="h-storage" data-testid="text-storage-note">تُحفظ الجلسة مؤقتًا في هذا التبويب، وعلى الخادم حتى ساعة من عدم النشاط أو إعادة تشغيله. تُمسح نسخة التبويب بالضغط على «جلسة جديدة».</p>
    {storageWarning && <p className="h-retry" role="alert" data-testid="status-storage-warning">{storageWarning}</p>}</>;

  return <main className="app-shell grain" dir="rtl" lang="ar">
    <Header onHome={reset} label={phase === 'setup' ? '01 / تجهيز' : phase === 'explaining' ? '02 / شرح' : '03 / تقرير'} />

    {phase === 'setup' && <section className="setup-page enter">
      <div className="intro-copy">
        <div className="eyebrow"><span className="eyebrow-rule" /> مساحة للشرح بصوتك أنت</div>
        <h1 className="serif">اشرح ما<br /><em>فهمته.</em></h1>
        <p className="intro-text">Hearo يصغي بصمت. اشرح أي موضوع بكلماتك، واكتشف ما أتقنته، وما أخطأت فيه، وما فاتك، بالرجوع إلى مادتك المرجعية.</p>
        <div className="intro-note"><span className="note-mark">“</span><p>الشرح هو طريقة الدراسة.<br />والإنصات هو الهدف.</p></div>
      </div>
      <div className="setup-card enter-delay">
        <div className="card-kicker"><span>عرض تجريبي مؤلَّف</span><span className="mono">01—03</span></div>
        <h2 className="serif h-card-title">أساسيات تصميم الأنظمة</h2>
        <p className="panel-hint">موضوع واحد جاهز مع مرجع ومفاهيم وتصحيحات كتبها المؤلّف مسبقًا. لا رفع ملفات ولا ميكروفون.</p>
        {notice}
        {errorBox}
        <button className="primary-button start-button" type="button" onClick={start} disabled={disabled} data-testid="start-demo">
          {busy === 'start' ? <><span className="button-loader" /> نجهّز الجلسة…</> : <>ابدأ العرض التجريبي <ArrowLeft size={16} /></>}
        </button>
        {storage}
      </div>
      <div className="how-strip" id="how-it-works">
        <div className="how-title"><span className="mono">وعد صغير</span><p>لن نقاطع<br />سلسلة أفكارك.</p></div>
        <div className="how-item"><span className="how-number">01</span><span>تبدأ جلسة من مرجع مؤلَّف يأتي من الخادم.</span></div>
        <div className="how-item"><span className="how-number">02</span><span>تكتب جملة نهائية، فتتلوّن المفاهيم: رمادي، أخضر، أحمر، كهرماني.</span></div>
        <div className="how-item"><span className="how-number">03</span><span>تنهي الجلسة فيظهر تقرير بالفجوات والأخطاء وسؤال الغد.</span></div>
      </div>
    </section>}

    {phase !== 'setup' && pack && <section className="workspace-page enter">
      <div className="session-head">
        <div>
          <div className="eyebrow session-eyebrow"><span className="eyebrow-rule" /> {phase === 'report' ? 'تقرير الجلسة' : 'جلسة الشرح'}</div>
          <h1 className="serif workspace-title">{pack.title_ar} <bdi dir="auto" className="h-en">{pack.title_en}</bdi></h1>
          <p className="workspace-subtitle">لا شيء يتحدث إليك. افتح الدليل متى شئت.</p>
        </div>
        <button type="button" className="back-link" onClick={reset} disabled={busy !== null} data-testid="new-session"><ArrowRight size={14} /> جلسة جديدة</button>
      </div>
      {notice}{storage}
      <div className="workspace-grid">
        <section className="explain-panel panel">
          <div className="panel-heading"><div><span className="panel-index">01</span><h2>جُملك</h2></div><span className="silence-tag"><span /> صامت</span></div>

          {phase === 'explaining' && <>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="h-form">
                <FormField control={form.control} name="sentence" rules={{ validate: v => v.trim().length > 0 || 'اكتب جملة قبل الإرسال.', maxLength: { value: 2000, message: 'الحد الأقصى ٢٠٠٠ حرف.' } }}
                  render={({ field }) => <FormItem>
                    <label className="field-label" htmlFor="sentence-input">اكتب جملة واحدة نهائية</label>
                    <FormControl><textarea {...field} id="sentence-input" dir="auto" rows={3} maxLength={2000} disabled={disabled} className="h-textarea" placeholder={pack.reference_lines[0]?.text} data-testid="input-sentence" /></FormControl>
                    <FormMessage />
                  </FormItem>} />
                <div className="h-actions">
                  <button type="submit" className="primary-button" disabled={disabled} data-testid="send-sentence">
                    {busy === 'text' && !replaying ? <><span className="button-loader" /> نفحص الجملة…</> : retry ? 'أعد إرسال الجملة نفسها' : 'أرسل الجملة'}
                  </button>
                  {!replaying
                    ? <button type="button" className="h-ghost" onClick={replay} disabled={disabled} data-testid="replay-demo"><Play size={14} /> تشغيل التسجيل التجريبي</button>
                    : <button type="button" className="h-ghost" onClick={stopReplay} data-testid="stop-replay"><Square size={14} /> إيقاف التسجيل</button>}
                </div>
              </form>
            </Form>
            {retry && !replaying && <p className="h-retry" role="status" data-testid="text-retry">الجملة السابقة لم تؤكَّد. إعادة الإرسال تستخدم المعرّف نفسه فلا تتكرر الادعاءات.</p>}
            {replaying && <p className="h-retry" role="status" data-testid="text-replaying">تسجيل تجريبي مسجَّل مسبقًا، وليس صوتك. تُرسل الجمل واحدة تلو الأخرى، ويمكنك الإيقاف دون فقدان ما أُرسل.</p>}
            <div className="h-examples">
              <h3>أمثلة من المرجع</h3>
              <p className="panel-hint">اضغط لتعبئة الحقل ثم أرسل.</p>
              <div className="h-example-group"><span className="mono">جمل المصدر المدعومة</span>
                {pack.reference_lines.map(l => <button key={l.line_id} type="button" className="h-example" onClick={() => fillExample(l.text)} disabled={disabled} data-testid={`example-line-${l.line_id}`}>{l.text}</button>)}</div>
              <div className="h-example-group"><span className="mono">أخطاء شائعة (تظهر حمراء)</span>
                {pack.misconceptions.map(m => <button key={m.concept_id} type="button" className="h-example h-example-wrong" onClick={() => fillExample(m.wrong_claim)} disabled={disabled} data-testid={`example-wrong-${m.concept_id}`}><small>{conceptLabel(m.concept_id)}</small>{m.wrong_claim}</button>)}</div>
              <div className="h-example-group"><span className="mono">تصحيح ذاتي (أحمر إلى أخضر)</span>
                {pack.misconceptions.map(m => <button key={m.concept_id} type="button" className="h-example h-example-fix" onClick={() => fillExample(m.correction)} disabled={disabled} data-testid={`example-correction-${m.concept_id}`}><small>{conceptLabel(m.concept_id)}</small>{m.correction}</button>)}</div>
            </div>
          </>}

          {errorBox}

          <div className="live-claims">
            <div className="live-claims-head"><span className="mini-eye" /><span>ما قلته ({state.sentences.length})</span></div>
            {state.sentences.length === 0 && <p className="claims-empty">ستظهر جملك هنا مع أدلتها.</p>}
            <ol className="h-sentences" data-testid="list-sentences">
              {state.sentences.map((s, i) => <li key={s.id} className="h-sentence" data-testid={`sentence-${s.id}`}>
                <p dir="auto"><span className="mono">{String(i + 1).padStart(2, '0')}</span> {s.text}</p>
                {s.claims.length === 0 && <small className="claims-empty">لا ادعاءات مطابقة لهذا العرض.</small>}
                {s.claims.map(c => {
                  const key = `${s.id}-${c.concept_id}`; const isOpen = !!open[key];
                  const tone = c.verdict === 'supported' ? 'green' : c.verdict === 'contradicts' ? 'red' : 'amber';
                  return <div key={key} className={`h-claim h-claim-${tone}`}>
                    <button type="button" aria-expanded={isOpen} aria-controls={`panel-${key}`} onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} data-testid={`evidence-${s.id}-${c.concept_id}`}>
                      <i className="key-dot" style={{ background: stateMeta[tone].color }} />
                      <span>{conceptLabel(c.concept_id)} <em>{verdictLabel[c.verdict]}</em></span>
                      <ChevronDown size={15} className={`feedback-chevron ${isOpen ? 'open' : ''}`} />
                    </button>
                    {isOpen && <div className="h-evidence" id={`panel-${key}`}>
                      {c.evidence ? <>
                        <span className="mono">سطر المصدر {c.evidence.line_id}</span>
                        <p className="h-source" dir="auto" data-testid={`source-line-${c.evidence.line_id}`}>{lineText(c.evidence.line_id)}</p>
                        <span className="mono">الاقتباس</span>
                        <blockquote dir="auto">{c.evidence.quote}</blockquote>
                      </> : <p className="claims-empty">لا يوجد دليل من المصدر لهذه الجملة.</p>}
                      {c.correction && <><span className="mono">التصحيح</span><p className="h-correction" dir="auto">{c.correction}</p></>}
                    </div>}
                  </div>;
                })}
              </li>)}
            </ol>
          </div>

          {phase === 'explaining' && <button type="button" className="primary-button finish-button" onClick={endSession} disabled={disabled || state.sentences.length === 0} data-testid="end-session">
            {busy === 'stop' ? <><span className="button-loader" /> نعدّ التقرير…</> : <>أنهِ الجلسة واعرض التقرير <ArrowLeft size={16} /></>}
          </button>}
        </section>

        <aside className="map-panel panel">
          <div className="panel-heading"><div><span className="panel-index">02</span><h2>خريطة المفاهيم</h2></div><span className="node-count mono">{pack.concepts.length}</span></div>
          <StateKey />
          <ConceptMap pack={pack} concepts={state.concepts} />
          <div className="map-foot"><span className="map-foot-mark"><BookOpen size={14} /></span><span>الخطوط تصل كل مفهوم بما يعتمد عليه.</span></div>
        </aside>
      </div>

      {report && <section className="h-report" id="session-report" data-testid="session-report" aria-labelledby="report-title">
        <div className="eyebrow"><span className="eyebrow-rule" /> نتيجة مطابقة مؤلَّفة</div>
        <h2 className="serif" id="report-title">تقرير الجلسة</h2>
        <div className="h-score-row">
          <div className="h-score"><strong className="serif" data-testid="score">{report.score}</strong><span>الدرجة من ١٠٠ = التغطية × الدقة</span></div>
          <div className="h-stat" data-testid="coverage"><strong><bdi>{pct(report.coverage)}</bdi></strong><span>التغطية: {report.covered_count} من {report.must_cover_count} مفهومًا أساسيًّا</span></div>
          <div className="h-stat" data-testid="accuracy"><strong><bdi>{pct(report.accuracy)}</bdi></strong><span>الدقة: {report.correct_count} صحيحة من {report.assessed_count} مقيَّمة</span></div>
        </div>
        <div className="h-report-grid">
          <div><h3>الفجوات ({report.gaps.length})</h3>{report.gaps.length ? <ul>{report.gaps.map(g => <li key={g.concept_id}><b>{g.label}</b> <em>{stateMeta[g.state].label}</em><p>{g.question}</p></li>)}</ul> : <p className="claims-empty">لا فجوات.</p>}</div>
          <div><h3>الأخطاء ({report.errors.length})</h3>{report.errors.length ? <ul>{report.errors.map(e => <li key={`${e.sentence_id}-${e.concept_id}`}><b dir="auto">{e.statement}</b> <em>{e.resolved ? 'صُحِّح لاحقًا' : 'لم يُصحَّح'}</em>
            <p dir="auto">التصحيح: {e.correction}</p><p dir="auto" className="h-quote">سطر {e.evidence.line_id}: {lineText(e.evidence.line_id)} «{e.evidence.quote}»</p></li>)}</ul> : <p className="claims-empty">لا أخطاء.</p>}</div>
          <div><h3>نقاط القوة ({report.strengths.length})</h3>{report.strengths.length ? <ul>{report.strengths.map(s => <li key={s.concept_id}>{s.label}</li>)}</ul> : <p className="claims-empty">لا شيء بعد.</p>}</div>
          <div><h3>تصحيحات ذاتية ({report.self_corrections.length})</h3>{report.self_corrections.length ? <ul>{report.self_corrections.map(s => <li key={s.concept_id}>{s.label}</li>)}</ul> : <p className="claims-empty">لا شيء بعد.</p>}</div>
          <div><h3>أسئلة المراجعة ({report.review_questions.length})</h3>{report.review_questions.length ? <ul>{report.review_questions.map(q => <li key={q.concept_id}><b>{conceptLabel(q.concept_id)}</b><p>{q.question}</p></li>)}</ul> : <p className="claims-empty">لا أسئلة.</p>}</div>
        </div>
        <div className="h-tomorrow"><span className="mono">سؤال الغد</span><p className="serif" dir="auto" data-testid="text-tomorrow">{report.tomorrow_question}</p></div>
      </section>}
    </section>}
    <footer className="site-footer"><span>HEARO <i>·</i> مساحة للدراسة</span><span>هادئ بالتصميم.</span></footer>
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
