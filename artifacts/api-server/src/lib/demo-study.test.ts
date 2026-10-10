import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ReportDemoSessionResponse, SendDemoMessageBody, SendDemoMessageResponse, VerifyDemoSentenceBody,
  VerifyDemoSentenceResponse, type DemoClaim, type DemoEvent, type DemoReport, type DemoMessageResponse,
} from "@workspace/api-zod";
import {
  DemoStudyError, demoTopicPack as pack, handleDemoMessage, reportDemoSession, validateDemoClaim, verifyDemoSentence,
} from "./demo-study";

const source = (id: number) => pack.reference_lines.find(line => line.line_id === id)!.text;
const verify = (sentence: string, sentence_id = "sentence-1") => VerifyDemoSentenceResponse.parse(
  verifyDemoSentence({ topic_id: "system-design", sentence_id, sentence, previous_sentences: [] }),
);
const start = () => SendDemoMessageResponse.parse(handleDemoMessage({ type: "start", topic_id: "system-design" }));
const send = (session_id: string, text: string, sentence_id: string) =>
  SendDemoMessageResponse.parse(handleDemoMessage({ type: "text", session_id, sentence_id, text }));
const stop = (session_id: string): DemoReport => {
  const response = handleDemoMessage({ type: "stop", session_id });
  const event = response.events.find(event => event.type === "report");
  assert.ok(event?.type === "report");
  return ReportDemoSessionResponse.parse(event.report);
};
function states(response: DemoMessageResponse) {
  return response.events.filter(event => event.type === "concept_state");
}

test("start derives every grey concept from the shared topic pack", () => {
  const response = start();
  assert.deepEqual(response.topic_pack, pack);
  assert.equal(states(response).length, pack.concepts.length);
  assert.deepEqual(states(response).map(event => event.concept_id), pack.concepts.map(concept => concept.id));
  assert.ok(states(response).every(event => event.state === "grey" && event.sentence_id === null));
});

test("each exact source line receives supported claims only for its authored concepts", () => {
  for (const line of pack.reference_lines) {
    const result = verify(line.text);
    const expected = pack.concepts.filter(concept => concept.supporting_lines.includes(line.line_id));
    assert.deepEqual(result.claims.map(claim => claim.concept_id), expected.map(concept => concept.id));
    assert.ok(result.claims.every(claim => claim.verdict === "supported" &&
      claim.evidence?.line_id === line.line_id && claim.evidence.quote === line.text));
  }
});

test("both authored misconceptions become red and cite exactly lines 6 and 9", () => {
  const session = start();
  for (const [index, misconception] of pack.misconceptions.entries()) {
    const sentence_id = `misconception-${index}`;
    const response = send(session.session_id, misconception.wrong_claim, sentence_id);
    const claim = response.events.find(event => event.type === "claim");
    assert.ok(claim?.type === "claim");
    assert.equal(claim.sentence_id, sentence_id);
    assert.equal(claim.claim.verdict, "contradicts");
    assert.equal(claim.claim.concept_id, misconception.concept_id);
    assert.deepEqual(claim.claim.evidence, {
      line_id: misconception.source_line_id, quote: source(misconception.source_line_id),
    });
    assert.equal(claim.claim.correction, misconception.correction);
    assert.ok(states(response).some(event => event.state === "red" && event.concept_id === misconception.concept_id));
  }
  assert.deepEqual(stop(session.session_id).errors.map(error => error.evidence.line_id), [6, 9]);
});

test("formatting differences are accepted but negations and arbitrary paraphrases are never asserted", () => {
  assert.equal(verify(`  ${source(1).replace(/ّ/g, "")}  `).claims[0].verdict, "supported");
  for (const text of [
    `لا ${source(4)}`,
    `${pack.misconceptions[0].wrong_claim} هذا خطأ`,
    "التخزين المؤقت سريع",
    "Cache is always up to date",
  ]) {
    const result = verify(text);
    assert.ok(result.claims.every(claim => claim.verdict === "unverified" && claim.evidence === null));
  }
});

test("off-topic, filler and explicit opinions do not invent claims", () => {
  for (const text of ["أمم", "حسنًا", "أحب كرة القدم", "التخزين المؤقت موضوع ممتع", "Cache ممتع"]) {
    assert.deepEqual(verify(text).claims, []);
  }
});

test("non-authored topic mentions become amber, never red or green", () => {
  const response = send(start().session_id, "التخزين المؤقت يعمل بطريقة غير معروفة", "unknown");
  assert.ok(states(response).length > 0);
  assert.ok(states(response).every(event => event.state === "amber"));
});

test("invalid source lines, mismatched quotes, wrong concept evidence and low confidence become unverified", () => {
  const claim: DemoClaim = {
    concept_id: "cache-freshness", verdict: "contradicts", confidence: 1,
    evidence: { line_id: 6, quote: source(6) }, correction: source(6),
  };
  for (const input of [
    { ...claim, confidence: 0.79 },
    { ...claim, evidence: { line_id: 999, quote: source(6) } },
    { ...claim, evidence: { line_id: 6, quote: "اقتباس مخترع" } },
    { ...claim, evidence: { line_id: 1, quote: source(1) }, correction: source(1) },
    { ...claim, correction: "تصحيح غير موجود في المرجع" },
  ]) {
    const result = validateDemoClaim(input);
    assert.equal(result.verdict, "unverified");
    assert.equal(result.evidence, null);
    assert.equal(result.correction, null);
  }
  assert.deepEqual(validateDemoClaim(claim), claim);
});

test("typed sentences and recorded sentences use identical sentence, claim and concept events", () => {
  const typed = start();
  const recorded = start();
  const sentences = [
    source(1), source(3), source(4), pack.misconceptions[0].wrong_claim,
    source(7), pack.misconceptions[1].wrong_claim,
    pack.misconceptions[0].correction, pack.misconceptions[1].correction,
  ];
  const withoutSession = (events: DemoEvent[]) => events.map(({ session_id: _id, ...event }) => event);
  sentences.forEach((sentence, index) => {
    const id = `sentence-${index}`;
    const typedEvents = send(typed.session_id, sentence, id);
    const recordedEvents = send(recorded.session_id, sentence, id);
    assert.deepEqual(withoutSession(typedEvents.events), withoutSession(recordedEvents.events));
    const result = verify(sentence, id);
    assert.deepEqual(typedEvents.events.filter(event => event.type === "claim").map(event => event.claim), result.claims);
  });
  const report = stop(typed.session_id);
  assert.deepEqual(report, stop(recorded.session_id));
  assert.deepEqual(report, reportDemoSession({
    topic_id: "system-design", sentences: sentences.map((sentence, index) => ({ sentence_id: `sentence-${index}`, sentence })),
  }));
  assert.equal(report.score, 100);
  assert.equal(report.errors.length, 2);
  assert.ok(report.errors.every(error => error.resolved));
  assert.deepEqual(report.self_corrections.map(item => item.concept_id), ["cache-freshness", "backups"]);
  assert.equal(report.review_questions.length, pack.concepts.length);
});

test("report exposes coverage times accuracy and the topic questions without invented evidence", () => {
  const report = reportDemoSession({
    topic_id: "system-design",
    sentences: [
      { sentence_id: "supported", sentence: source(1) },
      { sentence_id: "wrong", sentence: pack.misconceptions[0].wrong_claim },
    ],
  });
  assert.equal(report.covered_count, 2);
  assert.equal(report.must_cover_count, 6);
  assert.equal(report.correct_count, 1);
  assert.equal(report.assessed_count, 2);
  assert.equal(report.coverage, 2 / 6);
  assert.equal(report.accuracy, 1 / 2);
  assert.equal(report.score, 16.67);
  assert.equal(report.gaps.length, 5);
  assert.equal(report.tomorrow_question, pack.concepts.find(concept => concept.id === "cache-freshness")!.gap_question);
  assert.deepEqual(report.review_questions, pack.concepts.map(concept => ({ concept_id: concept.id, question: concept.gap_question })));
});

test("latest verdict wins without erasing correction history", () => {
  const session = start();
  const misconception = pack.misconceptions[0];
  send(session.session_id, misconception.wrong_claim, "wrong");
  send(session.session_id, misconception.correction, "fixed");
  send(session.session_id, "حداثة البيانات غير معروفة", "uncertain");
  const report = stop(session.session_id);
  assert.equal(report.gaps.find(gap => gap.concept_id === misconception.concept_id)?.state, "amber");
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].resolved, false);
  assert.equal(report.self_corrections.length, 1);
});

test("retry is idempotent and never restores an older red verdict after a correction", () => {
  const session = start();
  const misconception = pack.misconceptions[0];
  send(session.session_id, misconception.wrong_claim, "first");
  send(session.session_id, misconception.correction, "second");
  const retry = send(session.session_id, misconception.wrong_claim, "first");
  const current = states(retry).find(event => event.concept_id === misconception.concept_id);
  assert.equal(current?.state, "green");
  assert.equal(current?.sentence_id, "second");
  const report = stop(session.session_id);
  assert.equal(report.errors.length, 1);
  assert.equal(report.self_corrections.length, 1);
  assert.deepEqual(stop(session.session_id), report);
  assert.throws(() => send(session.session_id, source(1), "new-after-stop"), (error: unknown) =>
    error instanceof DemoStudyError && error.status === 409);
  assert.throws(() => send(session.session_id, "different", "first"), (error: unknown) =>
    error instanceof DemoStudyError && error.status === 409);
});

test("empty reports, unknown sessions, blank input, and repeated sentence IDs fail safely", () => {
  const report = reportDemoSession({ topic_id: "system-design", sentences: [] });
  assert.equal(report.score, 0);
  assert.equal(report.accuracy, 0);
  assert.equal(report.gaps.length, pack.concepts.length);
  assert.throws(() => verify("  "), DemoStudyError);
  assert.throws(() => send("00000000-0000-4000-8000-000000000000", source(1), "missing"), DemoStudyError);
  assert.throws(() => reportDemoSession({
    topic_id: "system-design", sentences: [
      { sentence_id: "duplicate", sentence: source(1) }, { sentence_id: "duplicate", sentence: source(4) },
    ],
  }), DemoStudyError);
  assert.equal(SendDemoMessageBody.safeParse({ type: "start", topic_id: "unknown" }).success, false);
  assert.equal(VerifyDemoSentenceBody.safeParse({
    topic_id: "system-design", sentence_id: "s", sentence: source(1), previous_sentences: ["a", "b", "c", "d"],
  }).success, false);
});
