// All editable copy for the Hearo product film lives here.
// Narration lines must match the generated public/audio/vo_<key>.mp3 files;
// if you change a line, regenerate that file and the composite (see SCRIPT.md).

export const PRODUCT = {
  name: 'Hearo',
  promise: 'Learn by explaining.',
  promise2: 'Master by teaching.',
};

// Unknown facts -- replace before sending.
export const PLACEHOLDERS = {
  recipient: '[Recipient company]',
  sender: '[Your name · Role]',
  contact: '[email@domain · meeting link]',
};

export const SCENE_DURATIONS = {
  open: 7000,
  problem: 14000,
  opportunity: 8500,
  reveal: 9000,
  check: 15000,
  wrong: 13000,
  arabic: 9000,
  report: 8000,
  diff: 11000,
  pilot: 10500,
  close: 8000,
};
export type SceneKey = keyof typeof SCENE_DURATIONS;

// cues = measured sentence starts (s into the vo file, ffmpeg silencedetect).
// Narration, with voice-over start offset (ms into the scene) and measured length (ms).
export const NARRATION: Record<SceneKey, { start: number; len: number; text: string; cues?: number[] }> = {
  open: { start: 900, len: 4360, text: 'What if you could see what someone understands, just by hearing them explain it?' },
  problem: { start: 500, len: 12150, cues: [0, 2.71, 8.32], text: 'Reading a lecture feels like learning. But rereading and highlighting rarely show what a learner actually understands. A wrong idea can sit unnoticed until an exam exposes it.' },
  opportunity: { start: 500, len: 7050, cues: [0, 3.77], text: 'Explaining in your own words is where the gaps surface. The hard part is checking that explanation against the source.' },
  reveal: { start: 500, len: 7370, cues: [0, 1.37, 3.8], text: 'This is Hearo. A learner opens an approved source. Hearo verifies it, and prepares a map of its key concepts.' },
  check: { start: 500, len: 11780, cues: [0, 4.08], text: 'The learner explains, aloud or by typing. Hearo stays silent, checks the meaning against the lecture, and marks the concept supported, citing the exact lines.' },
  wrong: { start: 500, len: 7890, cues: [0, 3.16], text: "When an idea goes wrong, Hearo catches it. The source sits right beside the learner's own words, so the correction is concrete." },
  arabic: { start: 500, len: 4310, text: 'Explanations in Arabic or English are checked against the same English source.' },
  report: { start: 500, len: 4440, text: 'At the end, a report shows coverage and accuracy, ready to download.' },
  diff: { start: 500, len: 7760, cues: [0, 2.81, 5.96], text: 'Every verdict cites its source. AI notes are labeled apart from source text. And Hearo never interrupts.' },
  pilot: { start: 500, len: 7130, cues: [0, 2.93], text: "Hearo is an early, working product. We'd like to propose a focused pilot, with success measures we define together." },
  close: { start: 500, len: 3760, text: 'Hearo. Learn by explaining. Master by teaching.' },
};

// ---------------------------------------------------------------------------
// ON-SCREEN COPY. Every word shown in the film lives below, grouped by scene.
// Rich text = array of segments: a plain string, or { t, b (bold), i (italic),
// color, mono, ar (Arabic font) } for inline emphasis.
// ---------------------------------------------------------------------------
export type Seg = string | { t: string; b?: boolean; i?: boolean; color?: string; mono?: boolean; ar?: boolean };
export type Rich = Seg[];

// Call to action -- EDITABLE ASSUMPTION: the recipient and the real next step are unknown.
export const CTA = "Let's book a 30-minute live demo.";

export const COPY = {
  open: { eyebrow: 'Listen-first learning' },
  problem: {
    eyebrow: '01 · The problem',
    headline1: 'Reading feels like',
    headline2: 'learning.',
    habits: ['Rereading.', 'Highlighting.'],
    noteLabel: "A learner's note",
    note: { before: '“Caching also speeds up writes', marked: 'automatically', after: ', so writes never need to be sent to the DBMS.”' },
    noteVerdict: "Sounds right. Isn't. And nobody notices — until an exam does.",
  },
  opportunity: {
    eyebrow: '02 · The opportunity',
    line1: 'Explain it.',
    line2: 'Check it.',
    body: 'Gaps surface when you explain. The hard part is checking that explanation against the source.',
  },
  reveal: {
    eyebrow: '03 · Meet Hearo',
    title: 'Open a source.',
    notes: [
      ['The approved lecture PDF is ', { t: 'verified', b: true }, ' by fingerprint.'],
      ['Hearo prepares a ', { t: 'concept map', b: true }, ' — six ideas, none assessed yet.'],
    ] as Rich[],
    disclosure: 'REAL CAPTURE · NORMAL SPEED',
  },
  check: {
    eyebrow: '04 · Explain',
    title: 'Explain it your way.',
    notes: [
      ['Speak or type. Hearo ', { t: 'stays silent', b: true }, ' and checks when you pause.'],
      ['“Scale out vs. scale up” turns ', { t: 'Supported', b: true, color: '#059669' }, '.'],
      ['Citations: lecture lines ', { t: 'S04-01…03', mono: true }, ', slide 4.'],
    ] as Rich[],
    disclosure: 'REAL CAPTURE · TYPING AT 3× · ~7 S PAUSE-AND-CHECK WAIT CUT · LIVE AI CHECK',
  },
  wrong: {
    eyebrow: '05 · Catch',
    title: "Wrong ideas don't slip by.",
    notes: [
      ['A confident but wrong sentence about caching.'],
      ['“Caching and consistency” turns ', { t: 'Contradicted', b: true, color: 'var(--red)' }, '.'],
      [{ t: 'Source', b: true }, ' next to ', { t: 'You', b: true }, " — the exact lecture line beside the learner's words."],
    ] as Rich[],
    disclosure: 'REAL CAPTURE · TYPING AT 2× · ~26 S WAIT FOR A SLOW AI RESPONSE CUT',
  },
  arabic: {
    eyebrow: '06 · Two languages',
    title: 'Arabic or English.',
    notes: [
      ['Full right-to-left Arabic interface.'],
      [{ t: 'موازنة الأحمال', ar: true }, ' — load balancing turns ', { t: 'Supported', b: true, color: '#059669' }, '.'],
      ['Checked against the same English lecture.'],
    ] as Rich[],
    disclosure: 'REAL CAPTURE · TYPING AT 3× · ~14 S PAUSE-AND-CHECK WAIT CUT · RESULT AT 1.4×',
  },
  report: {
    eyebrow: '07 · Reflect',
    title: 'A report, not a grade.',
    notes: [
      ['Coverage ', { t: '2/6', b: true }, ' · accuracy ', { t: '1/2', b: true }, ' — from this demo session.'],
      ['Download as a plain-text report.'],
    ] as Rich[],
    disclosure: 'REAL CAPTURE · 1.3× · SCORE IS A LOCAL RUBRIC, NOT AN ACADEMIC GRADE',
  },
  diff: {
    eyebrow: "08 · What's different",
    principles: [
      { k: 'Cites its source', d: 'Every verdict links the exact lecture line and slide.' },
      { k: 'Keeps AI apart', d: '“AI assessment · not source text” — the note never poses as a quote.' },
      { k: 'Never interrupts', d: 'Silent mode. Hearo checks quietly and never speaks back.' },
    ],
    stillsLabel: 'STILLS FROM THE RUNNING APP',
  },
  pilot: {
    eyebrow: '09 · Proposed next step',
    headline1: 'A focused',
    headline2: 'pilot.',
    // {recipient} is replaced with PLACEHOLDERS.recipient
    body: 'With {recipient}: one course, real learners, success measures agreed up front.',
    status: 'EARLY WORKING PRODUCT · NO OUTCOME STUDIES OR CUSTOMERS YET',
    measuresLabel: 'Measures to define together',
    measures: [
      ['Coverage', 'Concepts a learner demonstrates per session'],
      ['Accuracy', 'Share of checked claims the source supports'],
      ['Reliability', 'Successful checks ÷ attempts, and check time'],
      ['Learner view', 'Short feedback from participating learners'],
    ] as [string, string][],
  },
};
