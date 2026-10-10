import test from "node:test";
import assert from "node:assert/strict";
import { demoMetrics } from "./demo-metrics.mjs";

test("counts availability separately and measures successful round trips only", () => {
  const row = (expect, verdict, latencyMs) => ({ status: 200, concept: "c", expect, latencyMs,
    response: { assessments: [{ conceptId: "c", verdict }] }, failures: [],
    checker: { provider: "Gemini", model: "test" } });
  const summary = demoMetrics({ complete: true, results: [
    row("supported", "supported", 100), row("contradicted", "contradicted", 500),
    row("supported", "contradicted", 300), { status: 503, latencyMs: 9000, failures: [{}] },
  ] });
  assert.equal(summary.attempted, 4);
  assert.equal(summary.successful, 3);
  assert.equal(summary.targetVerdictMatches, 2);
  assert.equal(summary.comparableTargets, 3);
  assert.equal(summary.falseRedOnCorrect, 1);
  assert.equal(summary.plantedContradictionsCaught, 1);
  assert.deepEqual([summary.latency.p50, summary.latency.p95], [300, 500]);
});

test("does not invent timings, verdicts or accuracy when the provider is unavailable", () => {
  const summary = demoMetrics({ complete: false, results: [{ status: 503 }] });
  assert.equal(summary.comparableTargets, 0);
  assert.equal(summary.latency.sampleSize, 0);
  assert.equal(summary.latency.p95, null);
  assert.equal(summary.complete, false);
});
