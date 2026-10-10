import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import test from "node:test";
import { budgetSession, BUDGET_COOKIE, reserveEvaluation, verifiedSession } from "./evaluation-budget";
import type { Request, Response } from "express";

test("session identity is signed and survives a new request/instance", () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "synthetic-test-secret";
  try {
    let cookie = "";
    let options: Record<string, unknown> = {};
    const res = { cookie: (name: string, value: string, opts: Record<string, unknown>) => {
      assert.equal(name, BUDGET_COOKIE); cookie = value; options = opts;
    } } as unknown as Response;
    const id = budgetSession({ cookies: {} } as Request, res);
    assert.equal(budgetSession({ cookies: { [BUDGET_COOKIE]: cookie } } as unknown as Request, res), id);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/api/study");
    assert.equal(verifiedSession(cookie, "different-instance-secret"), null);
    assert.equal(verifiedSession(cookie.replace(id, randomUUID()), "synthetic-test-secret"), null);
    assert.equal(verifiedSession("malformed", "synthetic-test-secret"), null);
    delete process.env.SESSION_SECRET;
    assert.throws(() => budgetSession({ cookies: {} } as Request, res));
  } finally {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  }
});

test("database failure rolls back and never grants allowance", async () => {
  const queries: string[] = [];
  let released = false;
  const database = { connect: async () => ({
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("pg_advisory")) throw new Error("Synthetic unavailable storage");
      return { rows: [] };
    },
    release: () => { released = true; },
  }) };
  await assert.rejects(reserveEvaluation(randomUUID(), database));
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.includes("COMMIT"), false);
  assert.equal(released, true);
});

test("PostgreSQL: concurrent instances, reconnects, both ceilings, and UTC reset", async () => {
  const { pool } = await import("@workspace/db");
  const originalConnect = pool.connect.bind(pool);
  const schema = `budget_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  try {
    await pool.query(`CREATE TABLE "${schema}".evaluation_daily_budgets
      (day date NOT NULL, scope text NOT NULL, used integer NOT NULL DEFAULT 0, PRIMARY KEY(day, scope))`);
    // Each reservation gets a fresh connection, as different server processes do.
    const database = { connect: async () => {
      const client = await originalConnect();
      await client.query(`SET search_path TO "${schema}"`);
      return { query: (sql: string, values?: unknown[]) => client.query(sql, values),
        release: () => { client.release(true); } };
    } };
    const id = randomUUID();
    const decisions = await Promise.all(Array.from({ length: 12 }, () =>
      reserveEvaluation(id, database, { session: 3, overall: 5 })));
    assert.equal(decisions.filter(item => item.allowed).length, 3);
    assert.ok(decisions.filter(item => !item.allowed).every(item => item.scope === "session"));
    const denied = await reserveEvaluation(id, database, { session: 3, overall: 5 });
    assert.equal(denied.allowed, false);
    assert.match(denied.retryAt, /T00:00:00\.000Z$/);
    assert.ok(denied.retryAfterSeconds > 0 && denied.retryAfterSeconds <= 86400);
    const otherSessions = await Promise.all(Array.from({ length: 8 }, () =>
      reserveEvaluation(randomUUID(), database, { session: 3, overall: 5 })));
    assert.equal(otherSessions.filter(item => item.allowed).length, 2);
    assert.ok(otherSessions.filter(item => !item.allowed).every(item => item.scope === "overall"));
    const { rows } = await pool.query(`SELECT scope, used FROM "${schema}".evaluation_daily_budgets`);
    assert.equal(rows.find(row => row.scope === "overall").used, 5);
    assert.equal(rows.find(row => row.scope === `session:${id}`).used, 3);
    // Move the exhausted day's counters to yesterday; a new UTC day starts empty.
    await pool.query(`UPDATE "${schema}".evaluation_daily_budgets SET day = day - 1`);
    assert.equal((await reserveEvaluation(id, database, { session: 3, overall: 5 })).allowed, true);

    // Exercise the real endpoint with exhausted counters, without paid calls.
    const router = (await import("../routes/study")).default;
    const { initialMap, issueSourceToken, approvedDemo, referenceText } = await import("./approved-demo");
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.use((req, _res, next) => { req.log = { warn() {}, error() {} } as unknown as typeof req.log; next(); });
    app.use("/api", router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/study/evaluate`;
    const originalFetch = globalThis.fetch;
    const savedSecret = process.env.SESSION_SECRET;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    const savedGemini = process.env.GEMINI_API_KEY;
    let providerCalls = 0;
    process.env.SESSION_SECRET = "synthetic-endpoint-secret";
    process.env.OPENAI_API_KEY = "synthetic-not-a-real-key";
    process.env.GEMINI_API_KEY = "synthetic-not-a-real-key";
    globalThis.fetch = async () => { providerCalls++; throw new Error("Paid calls are forbidden in budget tests"); };
    const routeSession = randomUUID();
    const signature = createHmac("sha256", "synthetic-endpoint-secret").update(routeSession).digest("base64url");
    const body = JSON.stringify({ ...initialMap(), topic: approvedDemo.title,
      referenceText, sourceToken: issueSourceToken(), transcript: "A synthetic explanation." });
    const send = (ip: string) => originalFetch(url, {
      method: "POST", body,
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip,
        Cookie: `${BUDGET_COOKIE}=${routeSession}.${signature}` },
    });
    try {
      await pool.query(`INSERT INTO "${schema}".evaluation_daily_budgets (day, scope, used)
        VALUES ((clock_timestamp() AT TIME ZONE 'UTC')::date, $1, 30)`, [`session:${routeSession}`]);
      Object.defineProperty(pool, "connect", { configurable: true, value: database.connect });
      const sessionResponse = await send("192.0.2.1");
      assert.equal(sessionResponse.status, 429);
      const sessionError = await sessionResponse.json() as {
        code: string; scope: string; retryAt: string; retryAfterSeconds: number;
      };
      assert.equal(sessionError.code, "evaluation_budget_exceeded");
      assert.equal(sessionError.scope, "session");
      assert.match(sessionError.retryAt, /T00:00:00\.000Z$/);
      assert.equal(sessionResponse.headers.get("Retry-After"), String(sessionError.retryAfterSeconds));
      // Use original connection explicitly while the route's pool is redirected.
      const control = await originalConnect();
      try {
        await control.query(`UPDATE "${schema}".evaluation_daily_budgets SET used = 500 WHERE scope = 'overall'`);
      } finally { control.release(); }
      const overallResponse = await send("192.0.2.2");
      assert.equal(overallResponse.status, 429);
      assert.equal((await overallResponse.json() as { scope: string }).scope, "overall");
      Object.defineProperty(pool, "connect", { configurable: true, value: async () => { throw new Error("Synthetic database failure"); } });
      const unavailable = await send("192.0.2.3");
      assert.equal(unavailable.status, 503);
      assert.equal((await unavailable.json() as { code: string }).code, "evaluation_budget_unavailable");
      assert.equal(unavailable.headers.get("Retry-After"), "60");
      assert.equal(providerCalls, 0);
    } finally {
      Object.defineProperty(pool, "connect", { configurable: true, value: originalConnect });
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries({ SESSION_SECRET: savedSecret, OPENAI_API_KEY: savedOpenAI, GEMINI_API_KEY: savedGemini })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  } finally {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
