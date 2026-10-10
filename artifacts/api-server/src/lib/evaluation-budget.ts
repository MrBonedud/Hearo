import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import { lockEvaluationBudget, readEvaluationPolicy, type BudgetPool, type BudgetClient } from "./evaluation-policy";
import { evaluationLimitsSchema } from "@workspace/db/schema";

// A check can attempt at most two providers, both with SDK retries disabled.
// Count reservations, including provider failures; never refund ambiguous calls.
export const BUDGET_COOKIE = "hearo_check_session";

export function verifiedSession(value: unknown, secret: string): string | null {
  if (typeof value !== "string") return null;
  const [id, signature, extra] = value.split(".");
  if (extra !== undefined || !/^[a-f0-9-]{36}$/.test(id ?? "") || !signature) return null;
  const expected = createHmac("sha256", secret).update(id).digest();
  const actual = Buffer.from(signature, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}

export function budgetSession(req: Request, res: Response): string {
  const secret = process.env.SESSION_SECRET;
  // Do not use a process-local random secret: restarts/instances must agree.
  if (!secret) throw new Error("Budget session signing is unavailable");
  const existing = verifiedSession(req.cookies?.[BUDGET_COOKIE], secret);
  if (existing) return existing;
  const id = randomUUID();
  const signature = createHmac("sha256", secret).update(id).digest("base64url");
  res.cookie(BUDGET_COOKIE, `${id}.${signature}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/api/study", maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return id;
}

export const parseBudgetCookie = cookieParser();

export type BudgetDecision = {
  allowed: boolean;
  scope?: "session" | "overall";
  retryAt: string;
  retryAfterSeconds: number;
};

export const ALLOWANCE_READ_BOUNDS = {
  connectionMs: 750,
  queryMs: 1250,
  statementMs: 750,
  maxConcurrent: 4,
};
let activeAllowanceReads = 0;

class AllowanceReadUnavailable extends Error {
  constructor() {
    super("Allowance read temporarily unavailable");
    this.name = "AllowanceReadUnavailable";
  }
}

async function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AllowanceReadUnavailable()), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readEvaluationAllowance(
  sessionId: string,
  database?: BudgetPool,
  bounds = ALLOWANCE_READ_BOUNDS,
) {
  // Never allow read traffic to fill the shared pool or its waiting queue.
  if (activeAllowanceReads >= bounds.maxConcurrent) throw new AllowanceReadUnavailable();
  activeAllowanceReads++;
  let client: BudgetClient;
  let acquisitionOwnsCleanup = false;
  try {
    const pool = database ?? (await import("@workspace/db")).pool;
    const connection = pool.connect();
    try {
      client = await bounded(connection, bounds.connectionMs);
    } catch (error) {
      acquisitionOwnsCleanup = true;
      // A pool acquisition cannot be cancelled. Keep its slot until it settles,
      // and release a late connection instead of leaking it or issuing a query.
      void connection.then(late => late.release(), () => undefined)
        .finally(() => { activeAllowanceReads--; });
      throw error;
    }
  } catch (error) {
    if (!acquisitionOwnsCleanup) activeAllowanceReads--;
    throw error;
  }
  let destroy = false;
  try {
    const read = async () => {
      // Transaction-local bounds never leak into evaluation connections.
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = '${bounds.statementMs}ms'`);
      await client.query(`SET LOCAL lock_timeout = '${bounds.statementMs}ms'`);
      // One read-only snapshot: no reservation, cleanup, AI call or counter lock.
      const { rows: [row] } = await client.query(`
      WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS instant)
      SELECT ((date_trunc('day', instant AT TIME ZONE 'UTC') + interval '1 day')
          AT TIME ZONE 'UTC') AS reset_at,
        policy.session_limit, policy.overall_limit,
        COALESCE((SELECT used FROM evaluation_daily_budgets
          WHERE day = (instant AT TIME ZONE 'UTC')::date AND scope = $1), 0) AS session_used,
        COALESCE((SELECT used FROM evaluation_daily_budgets
          WHERE day = (instant AT TIME ZONE 'UTC')::date AND scope = 'overall'), 0) >= policy.overall_limit AS overall_exhausted
      FROM clock CROSS JOIN evaluation_check_policy policy WHERE policy.id = 1
    `, [`session:${sessionId}`]);
      if (!row) throw new Error("Evaluation checking policy is missing");
      const limits = evaluationLimitsSchema.parse({
        session: row.session_limit, overall: row.overall_limit,
      });
      await client.query("COMMIT");
      const remainingChecks = Math.max(0, limits.session - Number(row.session_used));
      const blockedBy = row.overall_exhausted ? "overall" as const
        : remainingChecks === 0 ? "session" as const : undefined;
      return {
        remainingChecks,
        dailyLimit: limits.session,
        resetAt: new Date(row.reset_at as string | Date).toISOString(),
        available: !blockedBy,
        ...(blockedBy ? { blockedBy } : {}),
      };
    };
    return await bounded(read(), bounds.queryMs);
  } catch (error) {
    // Destroy stalled/failed clients: do not leave a transaction or query
    // occupying storage after returning the recoverable response.
    destroy = true;
    throw error;
  } finally {
    client.release(destroy);
    activeAllowanceReads--;
  }
}

export async function reserveEvaluation(
  sessionId: string,
  database?: BudgetPool,
): Promise<BudgetDecision> {
  // Lazy import lets the authored, non-AI demo keep working if storage is down.
  const pool = database ?? (await import("@workspace/db")).pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // All instances lock the same counter before checking both scopes.
    await lockEvaluationBudget(client);
    const limits = await readEvaluationPolicy(client);
    const { rows: [clock] } = await client.query(`
      WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS instant)
      SELECT (instant AT TIME ZONE 'UTC')::date::text AS day,
        ((date_trunc('day', instant AT TIME ZONE 'UTC') + interval '1 day')
          AT TIME ZONE 'UTC') AS reset_at,
        instant AS now FROM clock
    `);
    const day = String(clock.day);
    const reset = new Date(clock.reset_at as string | Date);
    const result: BudgetDecision = {
      allowed: false,
      retryAt: reset.toISOString(),
      retryAfterSeconds: Math.max(1, Math.ceil((reset.getTime() - new Date(clock.now as string | Date).getTime()) / 1000)),
    };
    const sessionScope = `session:${sessionId}`;
    const { rows } = await client.query(
      "SELECT scope, used FROM evaluation_daily_budgets WHERE day = $1 AND scope = ANY($2::text[])",
      [day, ["overall", sessionScope]],
    );
    const used = (scope: string) => Number(rows.find(row => row.scope === scope)?.used ?? 0);
    if (used("overall") >= limits.overall) result.scope = "overall";
    else if (used(sessionScope) >= limits.session) result.scope = "session";
    else {
      await client.query(`
        INSERT INTO evaluation_daily_budgets (day, scope, used)
        VALUES ($1, 'overall', 1), ($1, $2, 1)
        ON CONFLICT (day, scope) DO UPDATE SET used = evaluation_daily_budgets.used + 1
      `, [day, sessionScope]);
      result.allowed = true;
    }
    // Bound storage without deleting today's reservations.
    await client.query("DELETE FROM evaluation_daily_budgets WHERE day < $1::date - 7", [day]);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
