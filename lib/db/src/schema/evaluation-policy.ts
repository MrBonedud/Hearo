import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Zero deliberately pauses checking. Bound counts well below PostgreSQL overflow.
export const evaluationLimitsSchema = z.object({
  session: z.number().int().min(0).max(1_000_000),
  overall: z.number().int().min(0).max(1_000_000),
}).strict();
export type EvaluationLimits = z.infer<typeof evaluationLimitsSchema>;

export const evaluationPolicyTable = pgTable("evaluation_check_policy", {
  id: integer("id").primaryKey().default(1),
  sessionLimit: integer("session_limit").notNull().default(30),
  overallLimit: integer("overall_limit").notNull().default(500),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("evaluation_policy_singleton", sql`${table.id} = 1`),
  check("evaluation_policy_session_range", sql`${table.sessionLimit} BETWEEN 0 AND 1000000`),
  check("evaluation_policy_overall_range", sql`${table.overallLimit} BETWEEN 0 AND 1000000`),
]);

export const insertEvaluationPolicySchema = createInsertSchema(evaluationPolicyTable);
export type InsertEvaluationPolicy = z.infer<typeof insertEvaluationPolicySchema>;
export type EvaluationPolicy = typeof evaluationPolicyTable.$inferSelect;
