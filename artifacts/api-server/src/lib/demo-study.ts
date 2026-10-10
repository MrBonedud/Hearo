import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SendDemoMessageResponse,
  type DemoBrowserMessage,
  type DemoClaim,
  type DemoConceptState,
  type DemoEvent,
  type DemoFinalSentence,
  type DemoMessageResponse,
  type DemoReport,
  type DemoReportInput,
  type DemoTopicPack,
  type DemoVerifyInput,
  type DemoVerifyResult,
} from "@workspace/api-zod";

// The managed server runs from its artifact directory; tests can run from the repository root.
// Both locations load the SAME shared source, never a replacement or synthesized topic.
const packPaths = [
  resolve(process.cwd(), "shared/topic-packs/system-design.json"),
  resolve(process.cwd(), "../../shared/topic-packs/system-design.json"),
];
const packPath = packPaths.find(existsSync);
if (!packPath) throw new Error("The approved shared system-design topic pack is missing.");
const rawPack: unknown = JSON.parse(readFileSync(packPath, "utf8"));
export const demoTopicPack: DemoTopicPack = SendDemoMessageResponse.shape.topic_pack.parse(rawPack);

// Catch broken authored citations at startup rather than delivering a misleading demo.
const lineIds = new Set(demoTopicPack.reference_lines.map(line => line.line_id));
const conceptIds = new Set(demoTopicPack.concepts.map(concept => concept.id));
if (lineIds.size !== demoTopicPack.reference_lines.length || conceptIds.size !== demoTopicPack.concepts.length) {
  throw new Error("The approved topic pack has duplicate line or concept identifiers.");
}
for (const concept of demoTopicPack.concepts) {
  if (!concept.supporting_lines.every(id => lineIds.has(id)) ||
      !concept.dependencies.every(id => conceptIds.has(id))) {
    throw new Error("The approved topic pack contains a broken concept reference.");
  }
}
for (const misconception of demoTopicPack.misconceptions) {
  const source = demoTopicPack.reference_lines.find(line => line.line_id === misconception.source_line_id);
  if (!conceptIds.has(misconception.concept_id) || !source || !source.text.includes(misconception.correction)) {
    throw new Error("An authored misconception correction does not match its cited source.");
  }
}

export class DemoStudyError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 429, message: string) {
    super(message);
  }
}

/** Formatting-only normalization: never remove negations or assume arbitrary paraphrases agree. */
function normalize(text: string): string {
  return text.normalize("NFC").toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[.!?،؛:؟"'“”()[\]]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function authoredText(text: string): string {
  return normalize(text).replace(/^(?:تصحيح|أصحح كلامي|انتظر في الواقع)\s+/u, "");
}

export function validateDemoClaim(claim: DemoClaim): DemoClaim {
  const concept = demoTopicPack.concepts.find(item => item.id === claim.concept_id);
  if (!concept) throw new DemoStudyError(400, "المفهوم غير موجود في المادة المعتمدة.");
  const line = demoTopicPack.reference_lines.find(item => item.line_id === claim.evidence?.line_id);
  const grounded = line && claim.evidence?.quote && line.text.includes(claim.evidence.quote) &&
    concept.supporting_lines.includes(line.line_id);
  if (claim.verdict === "unverified" || claim.confidence < 0.8 || !grounded) {
    return { ...claim, verdict: "unverified", evidence: null, correction: null };
  }
  if (claim.verdict === "contradicts" && (!claim.correction || !line.text.includes(claim.correction))) {
    return { ...claim, verdict: "unverified", evidence: null, correction: null };
  }
  return claim;
}

function stateFor(claim: DemoClaim): DemoConceptState {
  return claim.verdict === "supported" ? "green" : claim.verdict === "contradicts" ? "red" : "amber";
}

function ensureTopic(id: string): void {
  if (id !== demoTopicPack.id) throw new DemoStudyError(400, "اختر موضوع تصميم الأنظمة المعتمد.");
}

/** Explicit demo matcher, not an AI verifier. Only whole authored sentences receive firm verdicts. */
export function verifyDemoSentence(input: DemoVerifyInput): DemoVerifyResult {
  ensureTopic(input.topic_id);
  if (!input.sentence.trim()) throw new DemoStudyError(400, "اكتب جملة قبل إرسالها.");
  const text = authoredText(input.sentence);
  const misconception = demoTopicPack.misconceptions.find(item => normalize(item.wrong_claim) === text);
  if (misconception) {
    const source = demoTopicPack.reference_lines.find(line => line.line_id === misconception.source_line_id)!;
    return {
      sentence_id: input.sentence_id,
      claims: [validateDemoClaim({
        concept_id: misconception.concept_id, verdict: "contradicts", confidence: 1,
        evidence: { line_id: source.line_id, quote: source.text }, correction: misconception.correction,
      })],
    };
  }
  const source = demoTopicPack.reference_lines.find(line => normalize(line.text) === text);
  if (source) {
    return {
      sentence_id: input.sentence_id,
      claims: demoTopicPack.concepts.filter(concept => concept.supporting_lines.includes(source.line_id))
        .map(concept => validateDemoClaim({
          concept_id: concept.id, verdict: "supported", confidence: 1,
          evidence: { line_id: source.line_id, quote: source.text }, correction: null,
        })),
    };
  }
  // Filler, off-topic sentences, and a few explicit opinion templates never invent claims.
  const claims: DemoClaim[] = [];
  for (const concept of demoTopicPack.concepts) {
    const aliases = concept.aliases.split(/[،,]/).map(normalize).filter(Boolean);
    if (aliases.some(alias => text === `${alias} موضوع ممتع` || text === `${alias} ممتع` ||
        text === `${alias} مثير للاهتمام`)) continue;
    if (aliases.some(alias => ` ${text} `.includes(` ${alias} `))) {
      claims.push({ concept_id: concept.id, verdict: "unverified", confidence: 0, evidence: null, correction: null });
    }
  }
  return { sentence_id: input.sentence_id, claims };
}

type SentenceRecord = DemoFinalSentence & { claims: DemoClaim[] };
type DemoSession = {
  id: string;
  sentences: SentenceRecord[];
  states: Record<string, DemoConceptState>;
  selfCorrections: Set<string>;
  closed: boolean;
  touchedAt: number;
};
const sessions = new Map<string, DemoSession>();
const sessionTtlMs = 60 * 60 * 1000;
const maxSessions = 200;
const maxSentences = 500;

function emptySession(id = randomUUID()): DemoSession {
  return {
    id, sentences: [], states: Object.fromEntries(demoTopicPack.concepts.map(concept => [concept.id, "grey"])),
    selfCorrections: new Set(), closed: false, touchedAt: Date.now(),
  };
}

function finalSentence(session: DemoSession, sentence: DemoFinalSentence): DemoEvent[] {
  const result = verifyDemoSentence({
    topic_id: "system-design", sentence_id: sentence.sentence_id, sentence: sentence.sentence,
    previous_sentences: session.sentences.slice(-3).map(previous => previous.sentence),
  });
  const events: DemoEvent[] = [{
    type: "sentence", session_id: session.id, sentence_id: sentence.sentence_id, text: sentence.sentence,
  }];
  for (const claim of result.claims) {
    const next = stateFor(claim);
    if (session.states[claim.concept_id] === "red" && next === "green") {
      session.selfCorrections.add(claim.concept_id);
    }
    session.states[claim.concept_id] = next;
    events.push(
      { type: "claim", session_id: session.id, sentence_id: sentence.sentence_id, claim },
      { type: "concept_state", session_id: session.id, sentence_id: sentence.sentence_id, concept_id: claim.concept_id, state: next },
    );
  }
  session.sentences.push({ ...sentence, claims: result.claims });
  return events;
}

function reportFor(session: DemoSession): DemoReport {
  const required = demoTopicPack.concepts.filter(concept => concept.must_cover);
  // A verified correct OR wrong explanation is covered; accuracy distinguishes them.
  // Unverified mentions do not inflate either metric. All counts use latest concept verdicts.
  const covered = required.filter(concept => ["green", "red"].includes(session.states[concept.id]));
  const assessed = demoTopicPack.concepts.filter(concept => ["green", "red"].includes(session.states[concept.id]));
  const correct = assessed.filter(concept => session.states[concept.id] === "green");
  const coverage = required.length ? covered.length / required.length : 0;
  const accuracy = assessed.length ? correct.length / assessed.length : 0;
  const gaps = required.filter(concept => session.states[concept.id] !== "green").map(concept => ({
    concept_id: concept.id, label: concept.label_ar, state: session.states[concept.id], question: concept.gap_question,
  }));
  const errors = session.sentences.flatMap(sentence => sentence.claims.filter(claim =>
    claim.verdict === "contradicts" && claim.evidence && claim.correction).map(claim => ({
      sentence_id: sentence.sentence_id, concept_id: claim.concept_id, statement: sentence.sentence,
      correction: claim.correction!, evidence: claim.evidence!, resolved: session.states[claim.concept_id] === "green",
    })));
  const describe = (id: string) => ({
    concept_id: id, label: demoTopicPack.concepts.find(concept => concept.id === id)!.label_ar,
  });
  return {
    score: Math.round(coverage * accuracy * 10000) / 100,
    coverage, accuracy, covered_count: covered.length, must_cover_count: required.length,
    correct_count: correct.length, assessed_count: assessed.length,
    gaps, errors, strengths: correct.map(concept => describe(concept.id)),
    self_corrections: [...session.selfCorrections].map(describe),
    review_questions: demoTopicPack.concepts.map(concept => ({ concept_id: concept.id, question: concept.gap_question })),
    tomorrow_question: (gaps.find(gap => gap.state === "red") ?? gaps[0])?.question ??
      demoTopicPack.concepts[0].gap_question,
  };
}

/** /report is computed from sentences, never from browser-provided verdicts or scores. */
export function reportDemoSession(input: DemoReportInput): DemoReport {
  ensureTopic(input.topic_id);
  const session = emptySession();
  const ids = new Set<string>();
  for (const sentence of input.sentences) {
    if (ids.has(sentence.sentence_id)) throw new DemoStudyError(400, "معرّفات الجمل في التقرير يجب أن تكون مختلفة.");
    ids.add(sentence.sentence_id);
    finalSentence(session, sentence);
  }
  return reportFor(session);
}

/** Transport adapter: start/text/stop use the same verifier and report functions as /verify and /report. */
export function handleDemoMessage(message: DemoBrowserMessage): DemoMessageResponse {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.touchedAt > sessionTtlMs) sessions.delete(id);
  }
  if (message.type === "start") {
    ensureTopic(message.topic_id);
    if (sessions.size >= maxSessions) throw new DemoStudyError(429, "بلغ العرض حد الجلسات المؤقتة. حاول لاحقًا.");
    const session = emptySession();
    sessions.set(session.id, session);
    return {
      session_id: session.id, topic_pack: demoTopicPack,
      events: demoTopicPack.concepts.map(concept => ({
        type: "concept_state", session_id: session.id, sentence_id: null, concept_id: concept.id, state: "grey",
      })),
    };
  }
  const session = sessions.get(message.session_id);
  if (!session) throw new DemoStudyError(404, "انتهت صلاحية الجلسة المؤقتة أو أُعيد تشغيل الخدمة. ابدأ جلسة جديدة.");
  session.touchedAt = now;
  if (message.type === "stop") {
    session.closed = true;
    return {
      session_id: session.id, topic_pack: demoTopicPack,
      events: [{ type: "report", session_id: session.id, report: reportFor(session) }],
    };
  }
  const previous = session.sentences.find(sentence => sentence.sentence_id === message.sentence_id);
  if (previous) {
    if (previous.sentence !== message.text) throw new DemoStudyError(409, "لا يمكن تغيير نص جملة تم إرسالها بالمعرّف نفسه.");
    // Do not replay stale concept_state events: a retry must not undo a later self-correction.
    return {
      session_id: session.id, topic_pack: demoTopicPack,
      events: [
        { type: "sentence", session_id: session.id, sentence_id: previous.sentence_id, text: previous.sentence },
        ...previous.claims.map((claim): DemoEvent => ({
          type: "claim", session_id: session.id, sentence_id: previous.sentence_id, claim,
        })),
        ...demoTopicPack.concepts.map((concept): DemoEvent => ({
          type: "concept_state", session_id: session.id,
          sentence_id: [...session.sentences].reverse().find(sentence =>
            sentence.claims.some(claim => claim.concept_id === concept.id))?.sentence_id ?? null,
          concept_id: concept.id, state: session.states[concept.id],
        })),
      ],
    };
  }
  if (session.closed) throw new DemoStudyError(409, "انتهت هذه الجلسة. ابدأ جلسة جديدة للشرح.");
  if (session.sentences.length >= maxSentences) throw new DemoStudyError(429, "بلغت الجلسة حد الجمل. أنهِ الجلسة لقراءة التقرير.");
  return {
    session_id: session.id, topic_pack: demoTopicPack,
    events: finalSentence(session, { sentence_id: message.sentence_id, sentence: message.text }),
  };
}
