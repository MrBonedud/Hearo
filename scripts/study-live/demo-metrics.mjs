import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Descriptive sample statistics, never a population accuracy estimate. */
export function demoMetrics(report) {
  if (!Array.isArray(report.results)) throw new Error("Missing benchmark results");
  const rows = report.results;
  const successful = rows.filter(row => row.status === 200);
  const comparable = successful.filter(row =>
    row.response?.assessments?.some(item => item.conceptId === row.concept));
  const matches = comparable.filter(row =>
    row.response.assessments.find(item => item.conceptId === row.concept).verdict === row.expect);
  const contradictions = comparable.filter(row => row.expect === "contradicted");
  const caught = contradictions.filter(row =>
    row.response.assessments.find(item => item.conceptId === row.concept).verdict === "contradicted");
  const correct = comparable.filter(row => row.expect === "supported");
  const falseRed = correct.filter(row =>
    row.response.assessments.find(item => item.conceptId === row.concept).verdict === "contradicted");
  const timings = successful.map(row => row.latencyMs)
    .filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const percentile = p => timings.length ? timings[Math.ceil(p * timings.length) - 1] : null;
  return {
    complete: report.complete === true,
    attempted: rows.length,
    successful: successful.length,
    unavailable: rows.length - successful.length,
    targetVerdictMatches: matches.length,
    comparableTargets: comparable.length,
    plantedContradictionsCaught: caught.length,
    plantedContradictionsComparable: contradictions.length,
    falseRedOnCorrect: falseRed.length,
    correctComparable: correct.length,
    checksWithoutAnyRecordedFailure: rows.filter(row => row.status === 200 && !row.failures?.length).length,
    latency: { unit: "ms", sampleSize: timings.length, p50: percentile(0.5), p95: percentile(0.95),
      definition: "Successful evaluation HTTP round trips, including provider fallback; excludes speech recognition and between-request delays. Nearest-rank percentiles." },
    checkers: [...new Set(successful.map(row => `${row.checker?.provider}/${row.checker?.model}`))],
    caveat: "Small authored text sample, mostly load balancing; successful-only verdict denominators exclude unavailable attempts. This is not general accuracy, dialect certification, microphone reliability, or a full 76-case evaluation.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(demoMetrics(JSON.parse(await readFile(process.argv[2], "utf8"))), null, 2));
}
