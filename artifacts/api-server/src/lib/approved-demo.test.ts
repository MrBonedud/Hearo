import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  approvedDemo, groundedEvaluation, initialMap, issueSourceToken,
  matchesApprovedPdf, referenceText, sourceMetadata, validSourceToken,
} from "./approved-demo";

const fixture = process.env.TEST_APPROVED_PDF;

test("the original PDF is accepted by content, while same-length mutation is rejected", { skip: !fixture }, () => {
  const bytes = readFileSync(fixture!);
  assert.equal(matchesApprovedPdf(bytes), true);
  const changed = Buffer.from(bytes);
  changed[changed.length - 20] ^= 1;
  assert.equal(matchesApprovedPdf(changed), false);
  assert.equal(matchesApprovedPdf(bytes.subarray(0, bytes.length - 1)), false);
});

test("unsupported, empty, and PDF-looking content cannot impersonate the source", () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from("hello"), Buffer.from("%PDF-1.7 corrupt"), Buffer.alloc(approvedDemo.byteLength)]) {
    assert.equal(matchesApprovedPdf(bytes), false);
  }
  const paddedFake = Buffer.alloc(approvedDemo.byteLength);
  paddedFake.write("%PDF-1.7");
  assert.equal(matchesApprovedPdf(paddedFake), false);
});

test("source authorization expires and rejects modification or missing authorization", () => {
  const now = 1_000_000;
  const token = issueSourceToken(now);
  assert.equal(validSourceToken(token, now), true);
  assert.equal(validSourceToken(token, now + 2 * 60 * 60 * 1000), false);
  assert.equal(validSourceToken(`X${token}`, now), false);
  assert.equal(validSourceToken(`${token}.extra`, now), false);
  assert.equal(validSourceToken(undefined, now), false);
  assert.equal(validSourceToken("bad.token", now), false);
});

test("fixed source line IDs, pages, and objectives stay consistent", () => {
  const ids = new Set(approvedDemo.referenceLines.map(line => line.id));
  assert.equal(ids.size, approvedDemo.referenceLines.length);
  for (const line of approvedDemo.referenceLines) {
    assert.ok(line.page >= 1 && line.page <= approvedDemo.pageCount);
    assert.ok(referenceText.includes(`[${line.id} | slide ${line.page}] ${line.text}`));
  }
  for (const concept of approvedDemo.concepts) {
    assert.ok(concept.supportingLines.length > 0);
    assert.ok(concept.supportingLines.every(id => ids.has(id)));
  }
  const metadata = sourceMetadata(false);
  assert.equal("sourceToken" in metadata, false);
  assert.equal(metadata.aiAvailable, false);
  assert.equal(initialMap().nodes.every(node => node.status === "skipped"), true);
});

function outputFor(quote: string) {
  return approvedDemo.concepts.map(concept => ({
    conceptId: concept.id,
    verdict: concept.id === "load-balancing" ? "supported" : "not_demonstrated",
    studentEvidence: concept.id === "load-balancing" ? quote : null,
    sourceLineIds: concept.id === "load-balancing" ? ["S05-01"] : [],
    confidence: "high",
    explanation: "A synthetic model result used only to exercise validation.",
    followUp: concept.question,
  }));
}

test("evidence validation preserves Arabic and English quotations without translation", () => {
  for (const quote of [
    "A load balancer distributes HTTP requests across web servers.",
    "موزّع الحمل بيوزّع طلبات HTTP على أكثر من خادم.",
  ]) {
    const result = groundedEvaluation(outputFor(quote), quote);
    const item = result.assessments!.find(value => value.conceptId === "load-balancing")!;
    assert.equal(item.studentEvidence, quote);
    assert.equal(item.verdict, "supported");
    assert.ok(result.nodes.find(node => node.id === "load-balancing")!.evidence!.includes("S05-01, slide 5"));
  }
  // These test structural grounding, not the accuracy of a live language model.
});

test("student evidence must be an exact contiguous excerpt from the original transcript", () => {
  const transcript = "A load balancer  distributes requests.";
  const rows = outputFor("A load balancer distributes requests.");
  const result = groundedEvaluation(rows, transcript);
  const item = result.assessments!.find(value => value.conceptId === "load-balancing")!;
  assert.equal(item.verdict, "not_demonstrated");
  assert.equal(item.studentEvidence, null);
  assert.deepEqual(item.sourceLineIds, []);
});

test("invented student quotes, invalid source IDs, and low confidence never produce mastery", () => {
  for (const override of [
    { studentEvidence: "words never spoken" },
    { sourceLineIds: ["invented"] },
    { sourceLineIds: ["S10-01"] },
    { sourceLineIds: [] },
    { confidence: "low" },
  ]) {
    const rows = outputFor("My real answer");
    Object.assign(rows.find(row => row.conceptId === "load-balancing")!, override);
    const result = groundedEvaluation(rows, "My real answer");
    const item = result.assessments!.find(row => row.conceptId === "load-balancing")!;
    assert.equal(item.verdict, "not_demonstrated");
    assert.deepEqual(item.sourceLineIds, []);
    assert.equal(result.nodes.find(node => node.id === item.conceptId)!.status, "skipped");
    assert.equal(result.feedback.length, 0);
  }
});

test("partial understanding is distinct from supported and from a misconception", () => {
  const rows = outputFor("Requests go to several servers");
  rows.find(row => row.conceptId === "load-balancing")!.verdict = "partially_understood";
  const result = groundedEvaluation(rows, "Requests go to several servers");
  assert.equal(result.assessments![1].verdict, "partially_understood");
  assert.equal(result.nodes[1].status, "skipped");
  assert.equal(result.feedback.length, 0);
});

test("a verified contradiction remains distinct from missing evidence", () => {
  const transcript = "A balancer sends one connection's packets to different servers.";
  const rows = outputFor(transcript);
  rows.find(row => row.conceptId === "load-balancing")!.verdict = "contradicted";
  const result = groundedEvaluation(rows, transcript);
  const item = result.assessments!.find(row => row.conceptId === "load-balancing")!;
  assert.equal(item.verdict, "contradicted");
  assert.equal(result.nodes.find(node => node.id === item.conceptId)!.status, "incorrect");
  assert.equal(result.feedback.find(row => row.statement === transcript)!.status, "incorrect");
});

test("malformed verdicts, duplicate, missing, or unknown objectives are rejected", () => {
  const rows = outputFor("answer");
  assert.throws(() => groundedEvaluation(rows.slice(1), "answer"));
  assert.throws(() => groundedEvaluation([...rows.slice(1), rows[1]], "answer"));
  assert.throws(() => groundedEvaluation([{ ...rows[0], conceptId: "invented" }, ...rows.slice(1)], "answer"));
  assert.throws(() => groundedEvaluation([{ ...rows[0], verdict: "perfect" }, ...rows.slice(1)], "answer"));
  assert.throws(() => groundedEvaluation(null, "answer"));
});

test("HTTP upload and preparation enforce the fixed PDF and source authorization", { skip: !fixture }, async () => {
  const { default: app } = await import("../app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const bytes = readFileSync(fixture!);
  const post = (path: string, body: string | Buffer, contentType = "application/json") => fetch(base + path, {
    method: "POST", headers: { "Content-Type": contentType }, body,
  });
  try {
    const metadata = await (await fetch(`${base}/study/demo`)).json() as ReturnType<typeof sourceMetadata> & { sourceToken?: string };
    assert.equal(metadata.id, approvedDemo.id);
    assert.equal(metadata.sourceToken, undefined);
    const uploaded = await post("/study/demo/upload", bytes, "application/pdf");
    assert.equal(uploaded.status, 200);
    const accepted = await uploaded.json() as { sourceToken: string };
    const changed = Buffer.from(bytes); changed[100] ^= 1;
    assert.equal((await post("/study/demo/upload", changed, "application/pdf")).status, 400);
    assert.equal((await post("/study/demo/upload", Buffer.concat([bytes, Buffer.from("x")]), "application/pdf")).status, 413);
    assert.equal((await post("/study/demo/upload", "text", "text/plain")).status, 415);
    const input = { topic: approvedDemo.title, referenceText, sourceToken: accepted.sourceToken };
    const prepared = await post("/study/prepare", JSON.stringify(input));
    assert.equal(prepared.status, 200);
    assert.deepEqual(await prepared.json(), initialMap());
    for (const changes of [{ sourceToken: "" }, { topic: "Other topic" }, { referenceText: "x".repeat(100) }]) {
      assert.equal((await post("/study/prepare", JSON.stringify({ ...input, ...changes }))).status, 400);
    }
    if (!metadata.aiAvailable) {
      for (const transcript of ["Requests go to multiple servers.", "الطلبات بتتوزع على أكثر من خادم."]) {
        const response = await post("/study/evaluate", JSON.stringify({ ...input, ...initialMap(), transcript }));
        assert.equal(response.status, 503);
        const error = await response.json() as { error: string };
        assert.match(error.error, /unchanged/);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
