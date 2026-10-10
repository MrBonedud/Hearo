import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import test from "node:test";
import { budgetSession, BUDGET_COOKIE, readEvaluationAllowance, reserveEvaluation, verifiedSession } from "./evaluation-budget";
import type { Request, Response } from "express";
import { manageEvaluationPolicy } from "./evaluation-policy";

test("session identity is signed and survives a new request/instance", () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "synthetic-test-secret";
  try {
    let cookie = "";
    let options: Record<string, unknown> = {};
    const res = { cookie: (name: string, value: string, opts: Record<string, unknown>) => {
      assert.equal(name, BUDGET_COOKIE); cookie = value; options = opts;
    } } as unknown as Response;
    const id = randomUUID();
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
  let queries = 0;
  let released = 0;
    const database = { connect: async () => {
      const client = await originalConnect();
      await client.query(`SET search_path TO "${schema}"`);
      return { query: (sql: string, values?: unknown[]) => client.query(sql, values),
        release: () => { client.release(true); } };
    } };
  await assert.rejects(reserveEvaluation(randomUUID(), database));
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.includes("COMMIT"), false);
  assert.equal(released, true);
});

test("owner values are validated before opening a database connection", async () => {
    const database = { connect: async () => {
      const client = await originalConnect();
      await client.query(`SET search_path TO "${schema}"`);
      return { query: (sql: string, values?: unknown[]) => client.query(sql, values),
        release: () => { client.release(true); } };
    } };
  for (const input of [
    { session: -1, overall: 5 }, { session: 1.5, overall: 5 },
    { session: 1, overall: 1_000_001 }, { session: NaN, overall: 5 },
    { session: "30", overall: 500 }, { session: 30, overall: 500, extra: true },
  ]) {
    await assert.rejects(manageEvaluationPolicy("set", input as never, database),
      error => error instanceof Error && error.message !== "must not connect");
  }
});

test("allowance reads only the current session, clamps exhausted counts and releases storage", async () => {
  let queries = 0;
  let released = 0;
  let used = 0;
  let overall = false;
  let sessionLimit = 3;
    const database = { connect: async () => {
      const client = await originalConnect();
      await client.query(`SET search_path TO "${schema}"`);
      return { query: (sql: string, values?: unknown[]) => client.query(sql, values),
        release: () => { client.release(true); } };
    } };
  const read = () => readEvaluationAllowance("current-session", database);
  assert.deepEqual(await read(), { remainingChecks: 3, dailyLimit: 3, resetAt: "2026-10-11T00:00:00.000Z", available: true });
  used = 2;
  assert.equal((await read()).remainingChecks, 1);
  used = 9;
  assert.deepEqual(await read(), { remainingChecks: 0, dailyLimit: 3, resetAt: "2026-10-11T00:00:00.000Z", available: false, blockedBy: "session" });
  overall = true;
  used = 0;
  assert.deepEqual(await read(), { remainingChecks: 3, dailyLimit: 3, resetAt: "2026-10-11T00:00:00.000Z", available: false, blockedBy: "overall" });
  assert.equal(queries, 4);
  assert.equal(released, 4);
  overall = false;
  sessionLimit = 7;
  assert.equal((await read()).dailyLimit, 7);
  sessionLimit = -1;
  await assert.rejects(read());
  await assert.rejects(readEvaluationAllowance("current-session", { connect: async () => ({
    query: async () => { throw new Error("Synthetic read failure"); },
    release: () => { released++; },
  }) }));
  assert.equal(released, 7);
});

test("PostgreSQL: concurrent instances, reconnects, both ceilings, and UTC reset", async () => {
  const { pool } = await import("@workspace/db");
  const originalConnect = pool.connect.bind(pool);
  const schema = `budget_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  try {
    await pool.query(`CREATE TABLE "${schema}".evaluation_daily_budgets
      (day date NOT NULL, scope text NOT NULL, used integer NOT NULL DEFAULT 0, PRIMARY KEY(day, scope))`);
    await pool.query(`CREATE TABLE "${schema}".evaluation_check_policy
      (id integer PRIMARY KEY CHECK (id = 1),
       session_limit integer NOT NULL CHECK (session_limit BETWEEN 0 AND 1000000),
       overall_limit integer NOT NULL CHECK (overall_limit BETWEEN 0 AND 1000000),
       updated_at timestamptz NOT NULL DEFAULT now())`);
    // Each reservation gets a fresh connection, as different server processes do.
    const database = { connect: async () => {
      const client = await originalConnect();
      await client.query(`SET search_path TO "${schema}"`);
      return { query: (sql: string, values?: unknown[]) => client.query(sql, values),
        release: () => { client.release(true); } };
    } };
    await assert.rejects(reserveEvaluation(randomUUID(), database), /policy is missing/);
    await assert.rejects(manageEvaluationPolicy("set", { session: 3, overall: 5 }, database), /Initialize/);
    assert.deepEqual(await manageEvaluationPolicy("init", undefined, database), { session: 30, overall: 500 });
    await manageEvaluationPolicy("set", { session: 3, overall: 5 }, database);
    // Re-running initialization must not overwrite an owner's existing settings.
    assert.deepEqual(await manageEvaluationPolicy("init", undefined, database), { session: 3, overall: 5 });
    const id = randomUUID();
    const decisions = await Promise.all(Array.from({ length: 12 }, () =>
      reserveEvaluation(id, database)));
    assert.equal(decisions.filter(item => item.allowed).length, 3);
    assert.ok(decisions.filter(item => !item.allowed).every(item => item.scope === "session"));
    const denied = await reserveEvaluation(id, database);
    assert.equal(denied.allowed, false);
    assert.match(denied.retryAt, /T00:00:00\.000Z$/);
    assert.ok(denied.retryAfterSeconds > 0 && denied.retryAfterSeconds <= 86400);
    const otherSessions = await Promise.all(Array.from({ length: 8 }, () =>
      reserveEvaluation(randomUUID(), database)));
    assert.equal(otherSessions.filter(item => item.allowed).length, 2);
    assert.ok(otherSessions.filter(item => !item.allowed).every(item => item.scope === "overall"));
    const { rows } = await pool.query(`SELECT scope, used FROM "${schema}".evaluation_daily_budgets`);
    assert.equal(rows.find(row => row.scope === "overall").used, 5);
    assert.equal(rows.find(row => row.scope === `session:${id}`).used, 3);
    // Lowering preserves counts and denies immediately; increasing restores only headroom.
    await manageEvaluationPolicy("set", { session: 2, overall: 10 }, database);
    assert.equal((await reserveEvaluation(id, database)).scope, "session");
    assert.equal((await readEvaluationAllowance(id, database)).remainingChecks, 0);
    assert.equal((await readEvaluationAllowance(id, database)).dailyLimit, 2);
    await manageEvaluationPolicy("set", { session: 4, overall: 4 }, database);
    assert.equal((await reserveEvaluation(randomUUID(), database)).scope, "overall");
    await manageEvaluationPolicy("set", { session: 4, overall: 6 }, database);
    assert.equal((await readEvaluationAllowance(id, database)).remainingChecks, 1);
    assert.equal((await reserveEvaluation(id, database)).allowed, true);
    assert.equal((await reserveEvaluation(id, database)).scope, "overall");
    await manageEvaluationPolicy("set", { session: 0, overall: 10 }, database);
    assert.equal((await reserveEvaluation(randomUUID(), database)).scope, "session");
    await manageEvaluationPolicy("set", { session: 10, overall: 0 }, database);
    assert.equal((await reserveEvaluation(randomUUID(), database)).scope, "overall");
    await assert.rejects(pool.query(`UPDATE "${schema}".evaluation_check_policy SET overall_limit = -1`));
    await assert.rejects(pool.query(`INSERT INTO "${schema}".evaluation_check_policy VALUES (2, 30, 500, now())`));

    // Roll back BOTH fields if storage fails after the update but before commit.
    const failingUpdateDatabase = { connect: async () => {
      const client = await database.connect();
      return { ...client, query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("FOR SHARE")) throw new Error("Synthetic post-update failure");
        return client.query(sql, values);
      } };
    } };
    await assert.rejects(manageEvaluationPolicy("set", { session: 99, overall: 99 }, failingUpdateDatabase));
    assert.deepEqual(await manageEvaluationPolicy("show", undefined, database), { session: 10, overall: 0 });

    // Pause a real reservation after its policy read. An owner update must wait.
    await manageEvaluationPolicy("set", { session: 10, overall: 10 }, database);
    let reachedInsert!: () => void;
    let resumeInsert!: () => void;
    const atInsert = new Promise<void>(resolve => { reachedInsert = resolve; });
    const resume = new Promise<void>(resolve => { resumeInsert = resolve; });
    const pausedDatabase = { connect: async () => {
      const client = await database.connect();
      return { ...client, query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO evaluation_daily_budgets")) {
          reachedInsert();
          await resume;
        }
        return client.query(sql, values);
      } };
    } };
    const pendingCheck = reserveEvaluation(randomUUID(), pausedDatabase);
    await atInsert;
    const pendingUpdate = manageEvaluationPolicy("set", { session: 0, overall: 0 }, database);
    resumeInsert();
    assert.equal((await pendingCheck).allowed, true);
    assert.deepEqual(await pendingUpdate, { session: 0, overall: 0 });
    assert.equal((await reserveEvaluation(randomUUID(), database)).scope, "overall");
    const after = await pool.query(`SELECT used FROM "${schema}".evaluation_daily_budgets WHERE scope = 'overall'`);
    assert.equal(after.rows[0].used, 7);
    await manageEvaluationPolicy("set", { session: 3, overall: 5 }, database);
    // Move the exhausted day's counters to yesterday; a new UTC day starts empty.
    await pool.query(`UPDATE "${schema}".evaluation_daily_budgets SET day = day - 1`);
    assert.equal((await readEvaluationAllowance(id, database)).remainingChecks, 3);
    assert.equal((await reserveEvaluation(id, database)).allowed, true);
    assert.equal((await readEvaluationAllowance(id, database)).remainingChecks, 2);

    // Preserve read-specific PostgreSQL lock deadlines while using shared policy.
    const locker = await originalConnect();
    try {
      await locker.query("BEGIN");
      await locker.query(`LOCK TABLE "${schema}".evaluation_daily_budgets IN ACCESS EXCLUSIVE MODE`);
      const started = Date.now();
      await assert.rejects(readEvaluationAllowance(id, database));
      assert.ok(Date.now() - started < 3000);
    } finally {
      await locker.query("ROLLBACK");
      locker.release();
    }
    assert.equal((await readEvaluationAllowance(id, database)).available, true);
    await manageEvaluationPolicy("set", { session: 30, overall: 500 }, database);

    // Exercise the real endpoint with exhausted counters, without paid calls.
    const router = (await import("../routes/study")).default;
    const { initialMap, issueSourceToken, approvedDemo, referenceText } = await import("./approved-demo");
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.use((req, _res, next) => { req.log = { warn() {}, error() {} } as unknown as typeof req.log; next(); });
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
    const allowanceUrl = url.replace("/evaluate", "/allowance");
    const readAllowance = (cookie = `${BUDGET_COOKIE}=${routeSession}.${signature}`) =>
      originalFetch(`${allowanceUrl}?sessionId=some-other-session`, { headers: { Cookie: cookie } });
    try {
      await pool.query(`INSERT INTO "${schema}".evaluation_daily_budgets (day, scope, used)
        VALUES ((clock_timestamp() AT TIME ZONE 'UTC')::date, $1, 30)`, [`session:${routeSession}`]);
      Object.defineProperty(pool, "connect", { configurable: true, value: database.connect });
      const controlBefore = await originalConnect();
      const before = await controlBefore.query(`SELECT scope, used, day::text FROM "${schema}".evaluation_daily_budgets ORDER BY scope`);

      const sessionPause = await readAllowance("");
      const exhaustedRead = await readAllowance();
      assert.equal(exhaustedRead.status, 200);
      assert.equal(exhaustedRead.headers.get("Cache-Control"), "private, no-store");
      assert.match(exhaustedRead.headers.get("Vary") ?? "", /Cookie/);
      assert.equal(exhaustedRead.headers.get("Set-Cookie"), null);
      const allowance = await exhaustedRead.json() as Record<string, unknown>;
      assert.deepEqual(Object.keys(allowance).sort(), ["available", "blockedBy", "dailyLimit", "remainingChecks", "resetAt"]);
      assert.equal(allowance.remainingChecks, 0);
      assert.equal(allowance.blockedBy, "session");
      assert.match(String(allowance.resetAt), /T00:00:00\.000Z$/);
      const otherRead = await readAllowance("");
      assert.equal((await otherRead.json() as { remainingChecks: number }).remainingChecks, 30);
      assert.match(otherRead.headers.get("Set-Cookie") ?? "", /HttpOnly/);
      const tamperedRead = await readAllowance(`${BUDGET_COOKIE}=${routeSession}.forged-signature`);
      assert.equal((await tamperedRead.json() as { remainingChecks: number }).remainingChecks, 30);
      assert.ok(tamperedRead.headers.get("Set-Cookie"));
      const controlAfter = await originalConnect();
      const afterRead = await controlAfter.query(`SELECT scope, used, day::text FROM "${schema}".evaluation_daily_budgets ORDER BY scope`);
      controlAfter.release();
      assert.deepEqual(afterRead.rows, before.rows, "Reads must not consume, insert or clean up counters");
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
      const overallRead = await readAllowance("");
      const overallAllowance = await overallRead.json() as Record<string, unknown>;
      assert.equal(overallAllowance.blockedBy, "overall");
      assert.equal(overallAllowance.available, false);
      assert.equal(overallAllowance.remainingChecks, 30);
      assert.equal(Object.keys(overallAllowance).length, 5, "Do not expose global counts or session identifiers");
      Object.defineProperty(pool, "connect", { configurable: true, value: async () => { throw new Error("Synthetic database failure"); } });
      const failedRead = await readAllowance();
      assert.equal(failedRead.status, 503);
      assert.equal((await failedRead.json() as { code: string }).code, "evaluation_budget_unavailable");
      assert.equal(failedRead.headers.get("Cache-Control"), "private, no-store");
      const unavailable = await send("192.0.2.3");
      assert.equal(unavailable.status, 503);
      assert.equal((await unavailable.json() as { code: string }).code, "evaluation_budget_unavailable");
      assert.equal(unavailable.headers.get("Retry-After"), "60");
      Object.defineProperty(pool, "connect", { configurable: true, value: database.connect });
      const policyControl = await originalConnect();
      try {
        await policyControl.query(`DELETE FROM "${schema}".evaluation_check_policy`);
        const missingPolicy = await send("192.0.2.4");
        assert.equal(missingPolicy.status, 503);
        assert.equal((await missingPolicy.json() as { code: string }).code, "evaluation_budget_unavailable");
        assert.equal((await readAllowance()).status, 503);
        // Even a corrupt policy (e.g. constraints removed manually) must fail closed.
        await policyControl.query(`ALTER TABLE "${schema}".evaluation_check_policy DROP CONSTRAINT evaluation_check_policy_session_limit_check`);
        await policyControl.query(`INSERT INTO "${schema}".evaluation_check_policy VALUES (1, -1, 500, now())`);
        const invalidPolicy = await send("192.0.2.5");
        assert.equal(invalidPolicy.status, 503);
        assert.equal((await readAllowance()).status, 503);
        assert.equal(providerCalls, 0);
      } finally { policyControl.release(); }
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

      const sessionPauseBody = await sessionPause.json() as Record<string, unknown>;

      const overallPause = await readAllowance("");
