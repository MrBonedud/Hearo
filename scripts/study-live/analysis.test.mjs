import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { allCases, main, parseArgs } from "../verify-study-live.mjs";
import { expandGroups } from "./corpus.mjs";
import {
  fingerprint, validateCorpus, inspectResult, summarize, compareReports,
  questionReviewTemplate, applyQuestionReview,
} from "./analysis.mjs";

const pack = JSON.parse(await readFile(new URL("../../shared/topic-packs/system-design-slides.json", import.meta.url), "utf8"));
const reviewRecord = JSON.parse(await readFile(new URL("./corpus-review.json", import.meta.url), "utf8"));

function synthetic(item, model = "synthetic-model-a") {
  const assessments = pack.concepts.map(concept => ({
    conceptId: concept.id, verdict: concept.id === item.concept ? item.expect : "not_demonstrated",
    studentEvidence: concept.id === item.concept && item.expect !== "not_demonstrated" ? item.text : null,
    sourceLineIds: concept.id === item.concept && item.expect !== "not_demonstrated" ? concept.supportingLines : [],
    confidence: "high", explanation: "Synthetic harness test; not semantic model evidence.", followUp: concept.question,
  }));
  const response = { topic: pack.title, edges: pack.edges, assessments,
    nodes: pack.concepts.map(concept => {
      const row = assessments.find(value => value.conceptId === concept.id);
      return { id: concept.id, label: concept.label, description: concept.description,
        status: row.verdict === "supported" ? "understood" : row.verdict === "contradicted" ? "incorrect" : "skipped",
        evidence: pack.referenceLines.filter(line => row.sourceLineIds.includes(line.id))
          .map(line => `[${line.id}, slide ${line.page}] ${line.text}`).join("\n") || null };
    }) };
  const result = { ...item, transcript: item.text, status: 200, response,
    checker: { provider: "Synthetic", model, fallbackUsed: "false" } };
  result.failures = inspectResult(item, result, pack);
  return result;
}

function report(items = allCases, model = "synthetic-model-a") {
  return { schemaVersion: 2, runId: model, sourceId: pack.id, sourceSha256: pack.sha256,
    corpusSha256: fingerprint(allCases), expectedChecker: { provider: "Synthetic", model },
    caseIds: items.map(item => item.id), results: items.map(item => synthetic(item, model)),
    semanticReview: "pending" };
}

test("reviewed corpus covers every objective and dialect, with separately held-out pairs", () => {
  assert.equal(allCases.length, 76);
  assert.equal(allCases.filter(item => item.split === "heldout").length, 12);
  assert.equal(allCases.filter(item => item.split === "legacy").length, 10);
  validateCorpus(allCases, pack);
  assert.equal(fingerprint(expandGroups()), reviewRecord.expandedCorpusSha256, "Changed fixtures need independent re-review.");
  assert.equal(reviewRecord.sourceSha256, pack.sha256);
  assert.deepEqual(Object.keys(reviewRecord.decisions), pack.concepts.map(concept => concept.id));
  assert.throws(() => validateCorpus(allCases.filter(item => item.id !== "replication/maghrebi"), pack));
  assert.throws(() => validateCorpus([...allCases, allCases[0]], pack));
});

test("all synthetic gold shapes pass structural checks without claiming semantic accuracy", () => {
  const run = report();
  assert.ok(run.results.every(result => result.failures.length === 0));
  assert.deepEqual(summarize(run, pack).equivalenceDisagreements, []);
  assert.equal(run.semanticReview, "pending");
});

test("literal Arabic/English quotes are accepted, translations and spacing changes are rejected", () => {
  for (const id of ["load-balancing/en", "load-balancing/msa", "caching/maghrebi", "scaling/heldout-ar"]) {
    const item = allCases.find(value => value.id === id);
    const result = synthetic(item);
    const row = result.response.assessments.find(value => value.conceptId === item.concept);
    row.studentEvidence = id.endsWith("/en") ? "A fabricated learner quotation." : "An English translation is not original evidence.";
    assert.ok(inspectResult(item, result, pack).some(value => value.category === "exactEvidence"));
  }
  const item = { ...allCases[0], text: "Load  balancer sends requests." };
  const result = synthetic(item);
  result.response.assessments[1].studentEvidence = "Load balancer sends requests.";
  assert.ok(inspectResult(item, result, pack).some(value => value.category === "exactEvidence"));
});

test("reject foreign source IDs, page/text tampering, caller-owned map and low confidence", () => {
  const item = allCases.find(value => value.id === "scaling/en");
  for (const mutate of [
    result => { result.response.assessments[0].sourceLineIds = ["S10-01"]; },
    result => { result.response.nodes[0].evidence = "[S04-01, slide 999] invented"; },
    result => { result.response.nodes[0].label = "Caller-injected label"; },
    result => { result.response.edges = []; },
    result => { result.response.assessments[0].confidence = "low"; },
    result => { result.response.assessments[0].sourceLineIds = []; },
    result => { result.response.assessments[1].studentEvidence = item.text; },
    result => { result.response.assessments = []; },
  ]) {
    const result = synthetic(item);
    mutate(result);
    assert.ok(inspectResult(item, result, pack).length);
  }
});

test("question structure rejects lectures, empty follow-ups and multiple questions, not semantic focus", () => {
  const item = allCases[0];
  for (const question of ["", "A lecture without a question.", "Why? How?", `${"a".repeat(601)}?`]) {
    const result = synthetic(item);
    result.response.assessments[1].followUp = question;
    assert.ok(inspectResult(item, result, pack).some(row => row.category === "questionStructure"));
  }
  const result = synthetic(item);
  result.response.assessments[1].followUp = "ما الذي يحدث عندما يتعطل الخادم؟";
  assert.equal(inspectResult(item, result, pack).length, 0);
  result.response.assessments[1].followUp = "What is your favorite fruit?";
  assert.equal(inspectResult(item, result, pack).length, 0, "Focus requires independent semantic review, not keyword heuristics.");
});

test("within-run language disagreement includes unmentioned objectives, excluding failed requests", () => {
  const run = report(allCases.filter(item => item.equivalenceGroup === "replication"));
  const changed = run.results.find(result => result.variant === "egyptian");
  changed.response.assessments[0].verdict = "supported";
  assert.equal(summarize(run, pack).equivalenceDisagreements.length, 1);
  changed.status = 503;
  assert.equal(summarize(run, pack).equivalenceDisagreements.length, 0);
});

test("model comparisons distinguish verdicts, literal evidence, source selection and question drift", () => {
  const before = report([allCases[0]]);
  const after = report([allCases[0]], "synthetic-model-b");
  let comparison = compareReports(before, after);
  assert.equal(comparison.differences.length, 0);
  const row = after.results[0].response.assessments[1];
  row.verdict = "partially_understood";
  row.studentEvidence = "A load balancer";
  row.sourceLineIds = ["S05-01"];
  row.followUp = "What does the balancer do after a web server fails?";
  after.results[0].response.nodes[1].evidence = "[S05-01, slide 5] " + pack.referenceLines.find(line => line.id === "S05-01").text;
  comparison = compareReports(before, after);
  assert.equal(comparison.verdictDisagreements, 1);
  for (const category of ["verdict", "studentEvidence", "sourceLineIds", "followUp", "sourceQuotation"]) {
    assert.ok(comparison.differences.some(value => value.category === category));
  }
  after.results[0].status = 503;
  comparison = compareReports(before, after);
  assert.equal(comparison.verdictDisagreements, 0);
  assert.equal(comparison.differences[0].category, "availability");
});

test("comparison rejects changed corpus, source, selection, incomplete or misattributed runs", () => {
  const before = report([allCases[0]]);
  for (const mutate of [
    run => { run.corpusSha256 = "changed"; },
    run => { run.sourceSha256 = "changed"; },
    run => { run.caseIds = ["other"]; },
    run => { run.results = []; },
    run => { run.results[0].checker.model = "unexpected-fallback"; },
  ]) {
    const after = structuredClone(before);
    mutate(after);
    assert.throws(() => compareReports(before, after));
  }
});

test("semantic review binds focus and evidence judgments to exact run inputs", () => {
  const run = report([allCases[0]]);
  const review = questionReviewTemplate(run, pack);
  review.reviewer = "Synthetic review-method test, not a real reviewer";
  assert.throws(() => applyQuestionReview(run, review, pack), /pending/);
  for (const row of review.rows) Object.assign(row, { focus: "pass", evidenceSufficiency: "pass", rationale: "Synthetic test rationale." });
  review.rows[1].focus = "fail";
  const reviewed = applyQuestionReview(run, review, pack);
  assert.equal(reviewed.semanticReview.failures.length, 1);
  assert.ok(compareReports(run, reviewed).differences.some(row => row.category === "semanticReview"));
  for (const mutate of [
    copy => { copy.runId = "different"; },
    copy => { copy.rows[0].question = "A different question?"; },
    copy => { copy.rows[0].sourceEvidence = "A fabricated quote"; },
    copy => { copy.rows.pop(); },
    copy => { copy.rows[0] = copy.rows[1]; },
    copy => { copy.rows[0].rationale = ""; },
  ]) {
    const copy = structuredClone(review);
    mutate(copy);
    assert.throws(() => applyQuestionReview(run, copy, pack));
  }
});

test("CLI rejects accidental live combinations and unbounded retries", () => {
  for (const args of [["--live", "--list"], ["--compare", "a", "b", "--review", "c", "d"], ["--retries", "3"], ["--split", "unknown"], ["--baseline", "a"], ["--compare", "a"], ["--unknown"]]) {
    assert.throws(() => parseArgs(args));
  }
  assert.equal(parseArgs(["--live"]).retries, 0);
});

test("no arguments, help, list and missing live inputs never perform network calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Unexpected request"); };
  console.log = () => {};
  try {
    await main([], {});
    await main(["--help"], {});
    await main(["--list", "--split", "heldout"], {});
    await assert.rejects(main(["--live"], {}), /STUDY_API_BASE/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test("standalone list command succeeds without provider configuration", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-study-live.mjs", "--list", "--concept", "caching"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.count, 11);
  assert.match(output.caveat, /not calibrated accuracy/);
});

test("opted-in runner uses source flow, persists results without token, then compares offline", { skip: !process.env.TEST_APPROVED_PDF }, async () => {
  await mkdir("generated-artifacts", { recursive: true });
  const dir = await mkdtemp("generated-artifacts/study-harness-test-");
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const logs = [];
  const paths = [];
  const uploads = [];
  const sourceToken = "synthetic-private-source-token";
  const budgetCookie = "hearo_check_session=synthetic-private-budget-session";
  const env = { STUDY_API_BASE: "https://synthetic.invalid/api", TEST_APPROVED_PDF: process.env.TEST_APPROVED_PDF,
    STUDY_EXPECT_CHECKER: "Synthetic", STUDY_EXPECT_MODEL: "synthetic-model-a" };
  const json = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers });
  globalThis.fetch = async (url, options) => {
    paths.push(url);
    if (url.endsWith("/study/demo")) return json({ ...pack, aiAvailable: true, referenceText: "synthetic reference" });
    if (url.endsWith("/upload")) { uploads.push(options.body); return json({ sourceToken }); }
    const body = JSON.parse(options.body);
    assert.equal(body.sourceToken, sourceToken);
    if (url.endsWith("/prepare")) return json({ topic: pack.title, nodes: [], edges: [] });
    assert.ok(url.endsWith("/evaluate"));
    if (paths.filter(value => value.endsWith("/evaluate")).length === 2) assert.equal(options.headers.Cookie, budgetCookie);
    const item = allCases.find(value => value.text === body.transcript);
    assert.ok(item, "Runner sends the unchanged fixture, not a translation.");
    assert.equal("model" in body, false);
    return json(synthetic(item).response, { "X-Hearo-Checker": "Synthetic", "X-Hearo-Model": "synthetic-model-a", "X-Hearo-Fallback": "false",
      "Set-Cookie": `${budgetCookie}; HttpOnly; Path=/api/study` });
  };
  console.log = text => logs.push(text);
  try {
    const output = `${dir}/run.json`;
    await main(["--live", "--split", "control", "--concept", "replication", "--output", output], env);
    const saved = JSON.parse(await readFile(output, "utf8"));
    assert.equal(saved.complete, true);
    assert.equal(saved.results.length, 2);
    assert.equal(saved.summary.failures.length, 0);
    assert.equal(saved.results[0].checker.model, env.STUDY_EXPECT_MODEL);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].length, pack.byteLength);
    assert.ok(!JSON.stringify(saved).includes(sourceToken));
    assert.ok(!JSON.stringify(saved).includes(budgetCookie));
    assert.ok(!logs.join("").includes(sourceToken));
    assert.ok(paths[0].endsWith("/study/demo") && paths[1].endsWith("/upload") && paths[2].endsWith("/prepare"));
    const count = paths.length;
    await main(["--compare", output, output, "--output", `${dir}/comparison.json`], {});
    assert.equal(paths.length, count, "Offline comparison must not fetch.");
    await assert.rejects(main(["--live", "--split", "control", "--concept", "replication", "--output", output], env), /already exists/);
    assert.equal(paths.length, count, "Output collision must stop before paid requests.");
    await main(["--live", "--split", "control", "--concept", "replication", "--output", `${dir}/wrong-model.json`],
      { ...env, STUDY_EXPECT_MODEL: "wrong-model" });
    const wrong = JSON.parse(await readFile(`${dir}/wrong-model.json`, "utf8"));
    assert.equal(wrong.complete, false);
    assert.equal(wrong.results.length, 1, "Wrong checker stops further cost.");
    assert.equal(wrong.results[0].failures.at(-1).category, "modelIdentity");
    assert.equal(process.exitCode, 1);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    process.exitCode = originalExitCode;
    await rm(dir, { recursive: true, force: true });
  }
});
