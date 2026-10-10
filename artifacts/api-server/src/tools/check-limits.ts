import { manageEvaluationPolicy } from "../lib/evaluation-policy";

const [action, session, overall, ...extra] = process.argv.slice(2);
const usage = "Usage: check-limits.ts show | init | set <session 0..1000000> <overall 0..1000000>";
let database: typeof import("@workspace/db") | undefined;
try {
  const validCount = (value: string | undefined) => value !== undefined && /^(0|[1-9]\d*)$/.test(value);
  if (extra.length || !["show", "init", "set"].includes(action ?? "") ||
      (action !== "set" && (session !== undefined || overall !== undefined)) ||
      (action === "set" && (!validCount(session) || !validCount(overall)))) {
    throw new Error(usage);
  }
  database = await import("@workspace/db");
  const policy = await manageEvaluationPolicy(action as "show" | "init" | "set",
    action === "set" ? { session: Number(session), overall: Number(overall) } : undefined,
    database.pool);
  console.log(JSON.stringify(policy));
} catch {
  // Never print connection strings or driver errors from owner tooling.
  console.error(`Checking-limit command failed; no change was committed. ${usage}\nVerify the schema, initialized policy, database access and count ranges.`);
  process.exitCode = 1;
} finally {
  await database?.pool.end();
}
