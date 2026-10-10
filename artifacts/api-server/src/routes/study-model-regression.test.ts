import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Completions } from "openai/resources/chat/completions";
import { pool } from "@workspace/db";
import app from "../app";
import router from "./study";
import { approvedDemo, initialMap, issueSourceToken, referenceText } from "../lib/approved-demo";

async function testServer(t: TestContext) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;
  return {
    base,
    post: (path: string, body: unknown) => fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  };
}

test("each legacy and AI route has exactly one owner after concurrent route changes", () => {
  const layers = (router as unknown as { stack: { route?: { path: string; methods: { post?: boolean } } }[] }).stack;
  for (const path of ["/study/messages", "/verify", "/report", "/study/prepare", "/study/evaluate"]) {
    assert.equal(layers.filter(layer => layer.route?.path === path && layer.route.methods.post).length, 1, `Duplicate or missing ${path}`);
  }
});

test("legacy endpoints still exist and the app/runner's smaller prepare body succeeds", async t => {
  const { post } = await testServer(t);
  for (const path of ["/verify", "/report"]) assert.equal((await post(path, {})).status, 400, `${path} must not become 404`);
  const started = await post("/study/messages", { type: "start", topic_id: "system-design" });
  assert.equal(started.status, 200);
  const prepared = await post("/study/prepare", {
    topic: approvedDemo.title, referenceText, sourceToken: issueSourceToken(),
  });
  assert.equal(prepared.status, 200, "Prepare must not require transcript/nodes/edges.");
  assert.deepEqual(await prepared.json(), initialMap());
});

test("real evaluate handler reserves budget and returns model-attributed grounded assessments without paid calls", async t => {
  const { post, base } = await testServer(t);
  const metadata = await (await fetch(`${base}/study/demo`)).json() as { aiAvailable: boolean };
  if (!metadata.aiAvailable) {
    t.skip("Configure a checker to exercise the SDK stub; no provider requests are ever sent.");
    return;
  }
  const transcript = "Replication keeps multiple data copies to tolerate failures; three is common.";
  const assessments = approvedDemo.concepts.map(concept => ({
    conceptId: concept.id, verdict: concept.id === "replication" ? "supported" : "not_demonstrated",
    studentEvidence: concept.id === "replication" ? transcript : null,
    sourceLineIds: concept.id === "replication" ? ["S09-03"] : [], confidence: "high",
    explanation: "Synthetic structural regression test, not a live semantic assessment.", followUp: concept.question,
  }));
  const originalConnect = pool.connect;
  const originalCreate = Completions.prototype.create;
  let reserved = false;
  let committed = false;
  let calls = 0;
  let selectedModel = "";
  // Mock only database I/O and SDK transport. The actual router, schemas,
  // budget reservation logic, prompts and grounding remain in the request path.
  pool.connect = (async () => ({
    query: async (sql: string) => {
      if (sql.includes("INSERT INTO evaluation_daily_budgets")) reserved = true;
      if (sql === "COMMIT") committed = true;
      return { rows: sql.includes("clock_timestamp()") ? [
        { day: "2026-10-10", now: "2026-10-10T12:00:00Z", reset_at: "2026-10-11T00:00:00Z" },
      ] : [] };
    },
    release: () => {},
  })) as unknown as typeof pool.connect;
  Completions.prototype.create = ((request: { model: string }) => {
    assert.ok(reserved && committed, "Both budget reservations must precede the provider call.");
    calls++;
    selectedModel = request.model;
    return Promise.resolve({ choices: [{ message: { content: JSON.stringify({ assessments }) } }] });
  }) as unknown as typeof Completions.prototype.create;
  t.after(() => {
    pool.connect = originalConnect;
    Completions.prototype.create = originalCreate;
  });
  const response = await post("/study/evaluate", {
    ...initialMap(), referenceText, sourceToken: issueSourceToken(), transcript,
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 1, "No earlier duplicate route may return initialMap before the checker.");
  assert.equal(response.headers.get("X-Hearo-Model"), selectedModel);
  assert.ok(["OpenAI", "Gemini"].includes(response.headers.get("X-Hearo-Checker") || ""));
  assert.equal(response.headers.get("X-Hearo-Fallback"), "false");
  const result = await response.json() as { assessments: typeof assessments; nodes: ReturnType<typeof initialMap>["nodes"] };
  assert.equal(result.assessments.length, approvedDemo.concepts.length);
  const target = result.assessments.find(row => row.conceptId === "replication");
  assert.equal(target?.verdict, "supported");
  assert.equal(target?.studentEvidence, transcript);
  assert.deepEqual(target?.sourceLineIds, ["S09-03"]);
  assert.equal(result.nodes.find(node => node.id === "replication")?.evidence,
    "[S09-03, slide 9] Can tolerate failures by replication - place more than one copy of data (3 is common)");
});
