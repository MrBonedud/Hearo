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
  const failures = report.results.flatMap(result => result.failures.map(failure => ({ caseId: result.id, ...failure })));
  const equivalenceDisagreements = [];
  for (const concept of pack.concepts) {
    const peers = report.results.filter(row => row.equivalenceGroup === concept.id && row.status === 200 && Array.isArray(row.response?.assessments));
    const groups = new Map();
    for (const peer of peers) {
      const vector = JSON.stringify(peer.response.assessments.map(row => [row?.conceptId ?? null, row?.verdict ?? null]));
      groups.set(vector, [...(groups.get(vector) || []), peer.id]);
    }
    if (groups.size > 1) equivalenceDisagreements.push({ conceptId: concept.id, verdictVectors: [...groups].map(([vector, caseIds]) => ({ vector: JSON.parse(vector), caseIds })) });
  }
  return { cases: report.results.length, completed: report.results.filter(row => row.status === 200).length,
    failures, equivalenceDisagreements, caveat };
}

/** No translated-quote equality between languages: compare verdicts; validate each quote locally. */
export function compareReports(baseline, candidate) {
  for (const key of ["schemaVersion", "sourceId", "sourceSha256", "corpusSha256"]) {
    assert.equal(candidate[key], baseline[key], `Cannot compare different ${key}.`);
  }
  assert.deepEqual(candidate.caseIds, baseline.caseIds, "Cannot compare different case selections.");
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
  assert.equal(new Set(review.rows.map(row => `${row.caseId}/${row.conceptId}`)).size, template.rows.length, "Duplicate review rows.");
  for (const expected of template.rows) {
    const row = review.rows.find(value => value.caseId === expected.caseId && value.conceptId === expected.conceptId);
    assert.ok(row, "Missing review row.");
    for (const field of ["objective", "transcript", "verdict", "studentEvidence", "sourceEvidence", "question"]) {
      assert.deepEqual(row[field], expected[field], `Review is stale: ${expected.caseId}/${expected.conceptId}/${field}`);
    }
    assert.ok(["pass", "fail"].includes(row.focus) && ["pass", "fail"].includes(row.evidenceSufficiency), "Complete both semantic judgments; pending cannot pass.");
    assert.ok(typeof row.rationale === "string" && row.rationale.trim(), "Review needs a rationale.");
  }
  const reviewed = structuredClone(report);
  for (const result of reviewed.results) {
    result.semanticReviewRows = review.rows.filter(row => row.caseId === result.id)
      .map(({ conceptId, focus, evidenceSufficiency, rationale }) => ({ conceptId, focus, evidenceSufficiency, rationale }));
  }
  reviewed.semanticReview = { reviewer: review.reviewer, reviewedAt: new Date().toISOString(),
    failures: review.rows.filter(row => row.focus === "fail" || row.evidenceSufficiency === "fail")
      .map(({ caseId, conceptId, focus, evidenceSufficiency, rationale }) => ({ caseId, conceptId, focus, evidenceSufficiency, rationale })) };
  return reviewed;
}
