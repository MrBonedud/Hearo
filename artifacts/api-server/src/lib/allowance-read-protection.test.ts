import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { pool } from "@workspace/db";
import { createAllowanceReadThrottle } from "./allowance-read-throttle";
import { ALLOWANCE_READ_BOUNDS, BUDGET_COOKIE, readEvaluationAllowance, reserveEvaluation } from "./evaluation-budget";
import router from "../routes/study";
import { approvedDemo, issueSourceToken, referenceText } from "./approved-demo";

const row = { reset_at: "2026-10-11T00:00:00Z", session_used: 0, overall_exhausted: false,
  session_limit: 30, overall_limit: 500 };
const fastBounds = { ...ALLOWANCE_READ_BOUNDS, connectionMs: 20, queryMs: 30, statementMs: 10 };

test("read throttle expires, isolates sessions, catches cookie rotation and bounds memory", () => {
  const throttle = createAllowanceReadThrottle(1000, 2, 4, 20);
  assert.equal(throttle("one", 0), 0);
  assert.equal(throttle("one", 0), 0);
  assert.equal(throttle("one", 0), 1);
  assert.equal(throttle("two", 0), 0);
  assert.equal(throttle("rotated-cookie", 0), 1);
  assert.equal(throttle("one", 1000), 0);
  const small = createAllowanceReadThrottle(1000, 10, 10, 2);
  assert.equal(small("one", 0), 0);
  assert.equal(small("two", 0), 1);
  assert.equal(small("two", 1000), 0);
});

test("connection deadlines release late arrivals and bound outstanding pool acquisitions", async () => {
  let deliver!: (client: { query: () => Promise<{ rows: typeof row[] }>; release: () => void }) => void;
  let releases = 0;
  let queries = 0;
  let connections = 0;
  const pending = new Promise<Parameters<typeof deliver>[0]>(resolve => { deliver = resolve; });
  const database = { connect: () => { connections++; return pending; } };
  const bounds = { ...fastBounds, maxConcurrent: 1 };
  await assert.rejects(readEvaluationAllowance("one", database, bounds), { name: "AllowanceReadUnavailable" });
  await assert.rejects(readEvaluationAllowance("two", database, bounds), { name: "AllowanceReadUnavailable" });
  assert.equal(connections, 1, "A timed-out acquisition must retain its slot until settled");
  // The read-only admission cap must not deny evaluation reservations.
  assert.equal((await reserveEvaluation("one", { connect: async () => ({
    query: async sql => ({ rows: sql.includes("WITH clock")
      ? [{ day: "2026-10-10", reset_at: row.reset_at, now: "2026-10-10T12:00:00Z" }]
      : sql.includes("evaluation_check_policy") ? [row] : [] }),
    release() {},
  }) })).allowed, true);
  deliver({
    query: async () => { queries++; return { rows: [row] }; },
    release: () => { releases++; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases, 1);
  assert.equal(queries, 0);
  assert.equal((await readEvaluationAllowance("one", { connect: async () => ({
    query: async () => ({ rows: [row] }), release() {},
  }) }, bounds)).available, true);
});

test("stalled queries destroy their clients and do not change reservation behavior", async () => {
  let destroyed: boolean | undefined;
  const queries: string[] = [];
  const started = Date.now();
  await assert.rejects(readEvaluationAllowance("one", { connect: async () => ({
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("WITH clock")) return new Promise<never>(() => {});
      return { rows: [] };
    },
    release: destroy => { destroyed = destroy; },
  }) }, fastBounds), { name: "AllowanceReadUnavailable" });
  assert.ok(Date.now() - started < 1000);
  assert.equal(destroyed, true);
  assert.ok(queries.includes("BEGIN READ ONLY"));
  assert.ok(queries.includes("SET LOCAL statement_timeout = '10ms'"));
  assert.doesNotMatch(queries.join(" "), /\b(INSERT|UPDATE|DELETE|pg_advisory)\b/i);
  const reservationQueries: string[] = [];
  const decision = await reserveEvaluation("one", { connect: async () => ({
    query: async (sql: string) => {
      reservationQueries.push(sql);
      return { rows: sql.includes("WITH clock")
        ? [{ day: "2026-10-10", reset_at: row.reset_at, now: "2026-10-10T12:00:00Z" }]
        : sql.includes("evaluation_check_policy") ? [row] : [] };
    },
    release() {},
  }) });
  assert.equal(decision.allowed, true);
  assert.ok(reservationQueries.some(sql => sql.includes("INSERT INTO")));
  assert.ok(reservationQueries.includes("SET LOCAL statement_timeout = '5s'"));
});

test("HTTP read bursts and storage delays stay private, retryable and separate from source editing", async t => {
  const secret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "synthetic-read-protection-secret";
  const originalConnect = pool.connect;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let providerCalls = 0;
  const client = {
    query: async () => ({ rows: [row] }),
    release(_destroy?: boolean) {},
  };
  Object.defineProperty(pool, "connect", { configurable: true, value: async () => { calls++; return client; } });
  globalThis.fetch = async () => { providerCalls++; throw new Error("Provider calls forbidden"); };
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} } as unknown as typeof req.log; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => {
    Object.defineProperty(pool, "connect", { configurable: true, value: originalConnect });
    globalThis.fetch = originalFetch;
    if (secret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = secret;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/study`;
  const signedCookie = () => {
    const id = randomUUID();
    return `${BUDGET_COOKIE}=${id}.${createHmac("sha256", "synthetic-read-protection-secret").update(id).digest("base64url")}`;
  };
  const cookie = signedCookie();
  const read = (ip: string, session = cookie) => originalFetch(`${base}/allowance?sessionId=ignored`, {
    headers: { Cookie: session, "X-Forwarded-For": ip },
  });
  for (let i = 0; i < 30; i++) assert.equal((await read("192.0.2.80")).status, 200);
  const throttled = await read("192.0.2.80");
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get("Cache-Control"), "private, no-store");
  assert.match(throttled.headers.get("Vary") ?? "", /Cookie/);
  assert.ok(Number(throttled.headers.get("Retry-After")) > 0);
  const body = await throttled.json() as Record<string, unknown>;
  assert.equal(body.code, "allowance_read_throttled");
  assert.deepEqual(Object.keys(body).sort(), ["code", "error", "retryAfterSeconds"]);
  assert.equal(calls, 30, "Throttling must happen before storage");
  assert.equal((await read("192.0.2.80", signedCookie())).status, 200, "Other sessions on the IP are independent");
  let deliver!: (value: typeof client) => void;
  Object.defineProperty(pool, "connect", { configurable: true,
    value: () => new Promise<typeof client>(resolve => { deliver = resolve; }) });
  let start = Date.now();
  const delayed = await read("192.0.2.82", signedCookie());
  assert.equal(delayed.status, 503);
  assert.ok(Date.now() - start < 2000);
  assert.equal(delayed.headers.get("Retry-After"), "60");
  assert.equal(delayed.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await delayed.json() as { code: string }).code, "evaluation_budget_unavailable");
  let lateReleased = 0;
  deliver({ ...client, release() { lateReleased++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lateReleased, 1);

  let queryDestroyed = false;
  Object.defineProperty(pool, "connect", { configurable: true, value: async () => ({
    query: async () => new Promise<never>(() => {}),
    release(destroy: boolean) { queryDestroyed = destroy; },
  }) });
  start = Date.now();
  const stalled = await read("192.0.2.83", signedCookie());
  assert.equal(stalled.status, 503);
  assert.ok(Date.now() - start < 2500);
  assert.equal(queryDestroyed, true);
  assert.match(stalled.headers.get("Vary") ?? "", /Cookie/);
  Object.defineProperty(pool, "connect", { configurable: true, value: async () => { calls++; return client; } });
  let response: Awaited<ReturnType<typeof read>>;
  for (let i = 0; i < 600; i++) response = await read("192.0.2.81", signedCookie());
  assert.equal(response!.status, 429, "Cookie rotation cannot bypass the service burst ceiling");
  // Source preparation does not touch allowance storage, even while it is down.
  Object.defineProperty(pool, "connect", { configurable: true, value: async () => { throw new Error("Storage down"); } });
  const prepared = await originalFetch(`${base}/prepare`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: approvedDemo.title, referenceText, sourceToken: issueSourceToken() }),
  });
  assert.equal(prepared.status, 200);
  assert.equal(providerCalls, 0);
});
