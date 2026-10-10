import { evaluationLimitsSchema, type EvaluationLimits } from "@workspace/db/schema";

export type BudgetClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: (destroy?: boolean) => void;
};
export type BudgetPool = { connect: () => Promise<BudgetClient> };

export async function lockEvaluationBudget(client: BudgetClient): Promise<void> {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '5s'");
  await client.query("SELECT pg_advisory_xact_lock(184713, 1)");
}

export async function readEvaluationPolicy(client: BudgetClient): Promise<EvaluationLimits> {
  // The row lock also serializes a manual SQL UPDATE with in-flight reservations.
  const { rows } = await client.query(
    "SELECT session_limit, overall_limit FROM evaluation_check_policy WHERE id = 1 FOR SHARE",
  );
  if (rows.length !== 1) throw new Error("Evaluation checking policy is missing");
  return evaluationLimitsSchema.parse({
    session: rows[0].session_limit, overall: rows[0].overall_limit,
  });
}

// For trusted owner tooling only. Never expose this through the public study API.
export async function manageEvaluationPolicy(
  action: "show" | "init" | "set",
  input?: EvaluationLimits,
  database?: BudgetPool,
): Promise<EvaluationLimits> {
  const limits = action === "set" ? evaluationLimitsSchema.parse(input) : undefined;
  const pool = database ?? (await import("@workspace/db")).pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockEvaluationBudget(client);
    if (action === "init") {
      // Explicit one-time setup; never silently restore defaults during a check.
      await client.query(`INSERT INTO evaluation_check_policy (id, session_limit, overall_limit)
        VALUES (1, 30, 500) ON CONFLICT (id) DO NOTHING`);
    } else if (limits) {
      const { rows } = await client.query(`UPDATE evaluation_check_policy
        SET session_limit = $1, overall_limit = $2, updated_at = clock_timestamp()
        WHERE id = 1 RETURNING id`, [limits.session, limits.overall]);
      if (rows.length !== 1) throw new Error("Initialize the evaluation checking policy first");
    }
    const policy = await readEvaluationPolicy(client);
    await client.query("COMMIT");
    return policy;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
