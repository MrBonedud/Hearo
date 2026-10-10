import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const caveat = "This is a small, authored regression sample, not calibrated accuracy, a population estimate, or native-speaker certification. Question wording and valid evidence selections can differ without a semantic regression. Semantic question focus and evidence sufficiency require independent review.";
export const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function validateCorpus(cases, pack) {
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length, "Duplicate case IDs.");
  for (const concept of pack.concepts) {
    for (const variant of ["en", "msa", "jordanian", "egyptian", "gulf", "maghrebi", "mixed", "heldout-en", "heldout-ar"]) {
      assert.ok(cases.some(item => item.concept === concept.id && item.variant === variant && item.expect === "supported"), `Missing ${concept.id}/${variant}`);
    }
  }
  for (const item of cases) {
    assert.ok(pack.concepts.some(concept => concept.id === item.concept));
    assert.ok(item.text.trim());
    assert.ok(["supported", "partially_understood", "contradicted", "not_demonstrated"].includes(item.expect));
  }
}

function check(failures, category, conceptId, action) {
  try { action(); } catch (error) { failures.push({ category, conceptId, reason: error.message }); }
}

export function inspectResult(item, result, pack) {
  const failures = [];
  const body = result.response;
  check(failures, "availability", null, () => assert.equal(result.status, 200, "Assessment request did not succeed."));
  if (result.status !== 200) return failures;
  check(failures, "sourceOwnership", null, () => {
    assert.equal(body.topic, pack.title);
    assert.deepEqual(body.edges, pack.edges);
    assert.deepEqual(body.nodes.map(node => ({ id: node.id, label: node.label, description: node.description })),
      pack.concepts.map(({ id, label, description }) => ({ id, label, description })));
    assert.deepEqual(body.assessments.map(row => row.conceptId), pack.concepts.map(concept => concept.id));
  });
  if (!Array.isArray(body?.assessments) || !Array.isArray(body?.nodes)
    || body.assessments.some(row => !row || typeof row !== "object")
    || body.nodes.some(row => !row || typeof row !== "object")) return failures;
  for (const concept of pack.concepts) {
    const row = body.assessments.find(value => value.conceptId === concept.id);
    check(failures, "verdict", concept.id, () => {
      assert.ok(row, "Objective is missing.");
      assert.ok(["supported", "partially_understood", "contradicted", "not_demonstrated"].includes(row.verdict));
      if (concept.id === item.concept) assert.equal(row.verdict, item.expect);
      else if (!item.allowOtherConcepts) assert.equal(row.verdict, "not_demonstrated", "Unmentioned objective received a substantive verdict.");
    });
    check(failures, "exactEvidence", concept.id, () => {
      assert.ok(row);
      assert.ok(Array.isArray(row.sourceLineIds));
      assert.equal(new Set(row.sourceLineIds).size, row.sourceLineIds.length);
      assert.ok(row.sourceLineIds.every(id => concept.supportingLines.includes(id)), "Unapproved source ID.");
      if (row.verdict === "not_demonstrated") {
        assert.equal(row.studentEvidence, null);
        assert.deepEqual(row.sourceLineIds, []);
      } else {
        assert.equal(typeof row.studentEvidence, "string");
        assert.ok(row.studentEvidence.trim() && item.text.includes(row.studentEvidence), "Student quotation is not exact contiguous original text.");
        assert.ok(row.sourceLineIds.length, "Substantive verdict needs source evidence.");
        assert.ok(["medium", "high"].includes(row.confidence), "Low confidence cannot substantiate a verdict.");
      }
      const evidence = pack.referenceLines.filter(line => row.sourceLineIds.includes(line.id))
        .map(line => `[${line.id}, slide ${line.page}] ${line.text}`).join("\n");
      assert.equal(body.nodes.find(node => node.id === concept.id)?.evidence, evidence || null, "Source quote/page is not server-owned.");
      assert.equal(body.nodes.find(node => node.id === concept.id)?.status,
        row.verdict === "supported" ? "understood" : row.verdict === "contradicted" ? "incorrect" : "skipped");
    });
    check(failures, "questionStructure", concept.id, () => {
      assert.equal(typeof row?.followUp, "string");
      assert.ok(row.followUp.trim(), "Missing follow-up question.");
      assert.ok(row.followUp.length <= 600, "Question resembles a lecture; review needed.");
      assert.equal((row.followUp.match(/[?؟]/g) || []).length, 1, "Expected one question, not a lecture or multiple questions.");
    });
  }
  return failures;
}

export function summarize(report, pack) {
  const failures = report.results.flatMap(result => result.failures.map(failure => ({ caseId: result.id, ...(result.trial ? { trial: result.trial } : {}), ...failure })));
  const equivalenceDisagreements = [];
  for (const concept of pack.concepts) {
    for (let trial = 1; trial <= (report.repeatTrials || 1); trial++) {
    const peers = report.results.filter(row => (row.trial || 1) === trial && row.equivalenceGroup === concept.id && row.status === 200 && Array.isArray(row.response?.assessments));
    const groups = new Map();
    for (const peer of peers) {
      const vector = JSON.stringify(peer.response.assessments.map(row => [row?.conceptId ?? null, row?.verdict ?? null]));
      groups.set(vector, [...(groups.get(vector) || []), peer.id]);
    }
    if (groups.size > 1) equivalenceDisagreements.push({ conceptId: concept.id, ...(report.repeatTrials ? { trial } : {}),
      verdictVectors: [...groups].map(([vector, caseIds]) => ({ vector: JSON.parse(vector), caseIds })) });
    }
  }
  return { cases: report.results.length, completed: report.results.filter(row => row.status === 200).length,
    failures, equivalenceDisagreements, caveat };
}

/** No translated-quote equality between languages: compare verdicts; validate each quote locally. */
export function compareReports(baseline, candidate) {
  assert.ok(baseline.complete !== false && candidate.complete !== false, "Cannot compare incomplete or aborted reports.");
  for (const key of ["schemaVersion", "sourceId", "sourceSha256", "corpusSha256"]) {
    assert.equal(candidate[key], baseline[key], `Cannot compare different ${key}.`);
  }
  assert.deepEqual(candidate.caseIds, baseline.caseIds, "Cannot compare different case selections.");
  assert.equal(candidate.repeatTrials, baseline.repeatTrials, "Cannot compare different trial counts.");
  if (baseline.repeatTrials) {
    for (const report of [baseline, candidate]) {
      assert.ok(Number.isInteger(report.repeatTrials) && report.repeatTrials >= 2 && report.repeatTrials <= 10);
      assert.equal(report.results.length, report.caseIds.length * report.repeatTrials, "Repeat report is incomplete.");
      assert.deepEqual(report.results.map(row => [row.trial, row.id]),
        Array.from({ length: report.repeatTrials }, (_, i) => report.caseIds.map(id => [i + 1, id])).flat(),
        "Repeat IDs/trial order mismatch.");
    }
    const comparisons = Array.from({ length: baseline.repeatTrials }, (_, i) => {
      const single = report => ({ ...report, schemaVersion: 2, repeatTrials: undefined,
        results: report.results.filter(row => row.trial === i + 1) });
      return compareReports(single(baseline), single(candidate));
    });
    const differences = comparisons.flatMap((result, i) => result.differences.map(row => ({ trial: i + 1, ...row })));
    return { baseline: { runId: baseline.runId, checker: baseline.expectedChecker },
      candidate: { runId: candidate.runId, checker: candidate.expectedChecker }, differences,
      verdictDisagreements: comparisons.reduce((n, result) => n + result.verdictDisagreements, 0),
      withinModel: { baseline: analyzeRepeats(baseline), candidate: analyzeRepeats(candidate) },
      semanticReview: { baseline: baseline.semanticReview, candidate: candidate.semanticReview }, caveat };
  }
  assert.equal(baseline.results.length, baseline.caseIds.length, "Baseline is incomplete.");
  assert.equal(candidate.results.length, candidate.caseIds.length, "Candidate is incomplete.");
  assert.deepEqual(baseline.results.map(row => row.id), baseline.caseIds, "Baseline IDs/order mismatch.");
  assert.deepEqual(candidate.results.map(row => row.id), candidate.caseIds, "Candidate IDs/order mismatch.");
  for (const report of [baseline, candidate]) {
    assert.ok(report.expectedChecker?.provider && report.expectedChecker?.model, "Report is missing its pinned checker.");
    assert.ok(report.results.every(row => row.status !== 200 || (
      row.checker?.provider === report.expectedChecker.provider && row.checker?.model === report.expectedChecker.model
    )), "Report contains responses from an unpinned checker.");
  }
  const differences = [];
  for (const after of candidate.results) {
    const before = baseline.results.find(row => row.id === after.id);
    if (before.status !== 200 || after.status !== 200) {
      differences.push({ caseId: after.id, category: "availability", before: before.status, after: after.status, semanticComparison: "unavailable" });
      continue;
    }
    const fields = ["verdict", "studentEvidence", "sourceLineIds", "followUp"];
    const beforeRows = Array.isArray(before.response?.assessments) ? before.response.assessments : [];
    const afterRows = Array.isArray(after.response?.assessments) ? after.response.assessments : [];
    if (!beforeRows.length || !afterRows.length) differences.push({
      caseId: after.id, category: "malformedOutput", before: beforeRows.length, after: afterRows.length,
    });
    for (const conceptId of new Set([...beforeRows, ...afterRows].map(row => row.conceptId))) {
      const old = beforeRows.find(value => value.conceptId === conceptId);
      const row = afterRows.find(value => value.conceptId === conceptId);
      for (const field of fields) {
        const a = field === "sourceLineIds" && Array.isArray(old?.[field]) ? [...old[field]].sort() : old?.[field];
        const b = field === "sourceLineIds" && Array.isArray(row?.[field]) ? [...row[field]].sort() : row?.[field];
        if (JSON.stringify(a) !== JSON.stringify(b)) differences.push({
          caseId: after.id, conceptId, category: field, before: a, after: b,
          interpretation: field === "verdict" ? "verdict disagreement" : "Review change; different valid quotations or question wording need not be a regression.",
        });
      }
      const oldNode = Array.isArray(before.response?.nodes) ? before.response.nodes.find(node => node.id === conceptId) : null;
      const newNode = Array.isArray(after.response?.nodes) ? after.response.nodes.find(node => node.id === conceptId) : null;
      if (oldNode?.evidence !== newNode?.evidence) differences.push({
        caseId: after.id, conceptId, category: "sourceQuotation",
        before: oldNode?.evidence, after: newNode?.evidence,
      });
    }
    if (JSON.stringify(before.failures) !== JSON.stringify(after.failures)) differences.push({
      caseId: after.id, category: "invariants", before: before.failures, after: after.failures,
    });
    if (JSON.stringify(before.semanticReviewRows) !== JSON.stringify(after.semanticReviewRows)) differences.push({
      caseId: after.id, category: "semanticReview",
      before: before.semanticReviewRows || "pending", after: after.semanticReviewRows || "pending",
    });
  }
  return {
    baseline: { runId: baseline.runId, checker: baseline.expectedChecker },
    candidate: { runId: candidate.runId, checker: candidate.expectedChecker },
    differences, verdictDisagreements: differences.filter(item => item.category === "verdict").length,
    semanticReview: { baseline: baseline.semanticReview, candidate: candidate.semanticReview },
    caveat,
  };
}

export function questionReviewTemplate(report, pack) {
  return { runId: report.runId, corpusSha256: report.corpusSha256,
    instructions: "Independently inspect question focus/relevance and whether exact source/student quotes substantiate the verdict. Do not infer semantic quality from question punctuation. Set each dimension to pass/fail with a rationale. Leave pending when unsure.",
    rows: report.results.filter(result => result.status === 200 && Array.isArray(result.response?.assessments) && Array.isArray(result.response?.nodes)
      && result.response.assessments.every(row => row && typeof row === "object") && result.response.nodes.every(row => row && typeof row === "object")).flatMap(result =>
      (result.response.assessments || []).map(row => ({
        caseId: result.id, conceptId: row.conceptId,
        ...(result.trial ? { trial: result.trial, checker: result.checker } : {}),
        objective: pack.concepts.find(concept => concept.id === row.conceptId)?.description,
        transcript: result.transcript, verdict: row.verdict, studentEvidence: row.studentEvidence,
        sourceEvidence: result.response.nodes?.find(node => node.id === row.conceptId)?.evidence,
        question: row.followUp, focus: "pending", evidenceSufficiency: "pending", rationale: "",
      }))) };
}

/** Bind offline judgments to the exact run and question/evidence being reviewed. */
export function applyQuestionReview(report, review, pack) {
  const template = questionReviewTemplate(report, pack);
  assert.equal(review.runId, report.runId, "Review belongs to another run.");
  assert.equal(review.corpusSha256, report.corpusSha256, "Review belongs to another corpus.");
  assert.ok(typeof review.reviewer === "string" && review.reviewer.trim(), "Name the reviewer or review method (do not claim human review for a model).");
  assert.ok(Array.isArray(review.rows));
  assert.equal(review.rows.length, template.rows.length, "Every returned objective must be reviewed.");
  const reviewKey = row => JSON.stringify([row.trial ?? null, row.caseId, row.conceptId]);
  assert.equal(new Set(review.rows.map(reviewKey)).size, template.rows.length, "Duplicate review rows.");
  for (const expected of template.rows) {
    const row = review.rows.find(value => reviewKey(value) === reviewKey(expected));
    assert.ok(row, "Missing review row.");
    for (const field of ["objective", "transcript", "verdict", "studentEvidence", "sourceEvidence", "question"]) {
      assert.deepEqual(row[field], expected[field], `Review is stale: ${expected.caseId}/${expected.conceptId}/${field}`);
    }
    if (expected.trial) assert.deepEqual(row.checker, expected.checker, "Review checker identity is stale.");
    assert.ok(["pass", "fail"].includes(row.focus) && ["pass", "fail"].includes(row.evidenceSufficiency), "Complete both semantic judgments; pending cannot pass.");
    assert.ok(typeof row.rationale === "string" && row.rationale.trim(), "Review needs a rationale.");
  }
  const reviewed = structuredClone(report);
  for (const result of reviewed.results) {
    result.semanticReviewRows = review.rows.filter(row => row.caseId === result.id && row.trial === result.trial)
      .map(({ conceptId, focus, evidenceSufficiency, rationale }) => ({ conceptId, focus, evidenceSufficiency, rationale }));
  }
  reviewed.semanticReview = { reviewer: review.reviewer, reviewedAt: new Date().toISOString(),
    failures: review.rows.filter(row => row.focus === "fail" || row.evidenceSufficiency === "fail")
      .map(({ caseId, trial, conceptId, focus, evidenceSufficiency, rationale }) => ({ caseId, trial, conceptId, focus, evidenceSufficiency, rationale })) };
  if (reviewed.repeatTrials) reviewed.repeatAnalysis = analyzeRepeats(reviewed);
  return reviewed;
}

/** Pairwise counts, never accuracy: only identical cases on the same actual checker. */
export function analyzeRepeats(report) {
  const groups = new Map();
  const excluded = [];
  const identities = [];
  for (const row of report.results) {
    identities.push({ caseId: row.id, trial: row.trial, status: row.status, checker: row.checker });
    const assessments = row.response?.assessments;
    if (row.status !== 200 || !row.checker?.provider || !row.checker?.model
      || !Array.isArray(assessments) || !assessments.length
      || assessments.some(value => !value?.conceptId || !["supported", "partially_understood", "contradicted", "not_demonstrated"].includes(value.verdict))
      || new Set(assessments.map(value => value.conceptId)).size !== assessments.length) {
      excluded.push({ caseId: row.id, trial: row.trial, status: row.status, reason: "Unavailable, unidentified or malformed response; no semantic comparison." });
      continue;
    }
    const key = JSON.stringify([row.id, row.checker.provider, row.checker.model]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const differences = [];
  let comparedTrialPairs = 0, comparedVerdicts = 0, reviewedQuestionPairs = 0, pendingQuestionPairs = 0;
  for (const peers of groups.values()) {
    for (let i = 0; i < peers.length; i++) for (let j = i + 1; j < peers.length; j++) {
      const before = peers[i], after = peers[j];
      assert.notEqual(before.trial, after.trial, "Duplicate case/model/trial records.");
      assert.equal(before.transcript, after.transcript, "Repeated case transcript changed.");
      const a = before.response.assessments, b = after.response.assessments;
      const context = { caseId: before.id, checker: before.checker, trials: [before.trial, after.trial] };
      if (JSON.stringify(a.map(row => row.conceptId).sort()) !== JSON.stringify(b.map(row => row.conceptId).sort())) {
        differences.push({ ...context, category: "malformedOutput" });
        continue;
      }
      comparedTrialPairs++;
      for (const old of a) {
        const current = b.find(row => row.conceptId === old.conceptId);
        comparedVerdicts++;
        for (const field of ["verdict", "followUp"]) {
          if (old[field] !== current[field]) differences.push({ ...context, conceptId: old.conceptId,
            category: field, before: old[field], after: current[field] });
        }
        const oldReview = before.semanticReviewRows?.find(row => row.conceptId === old.conceptId);
        const newReview = after.semanticReviewRows?.find(row => row.conceptId === old.conceptId);
        if (![oldReview, newReview].every(row => ["pass", "fail"].includes(row?.focus) && ["pass", "fail"].includes(row?.evidenceSufficiency))) {
          pendingQuestionPairs++;
          continue;
        }
        reviewedQuestionPairs++;
        for (const dimension of ["focus", "evidenceSufficiency"]) {
          if (oldReview[dimension] !== newReview[dimension]) differences.push({ ...context, conceptId: old.conceptId,
            category: dimension, before: oldReview[dimension], after: newReview[dimension] });
        }
      }
    }
  }
  const count = category => differences.filter(row => row.category === category).length;
  return { countingUnit: "unordered trial pairs per case/actual checker; verdict and review counts are per objective",
    comparedTrialPairs, comparedVerdicts, verdictDisagreements: count("verdict"),
    questionWordingChanges: count("followUp"), reviewedQuestionPairs, pendingQuestionPairs,
    questionFocusDisagreements: count("focus"), evidenceReviewDisagreements: count("evidenceSufficiency"),
    malformedPairs: count("malformedOutput"), identities, excluded, differences, caveat };
}
