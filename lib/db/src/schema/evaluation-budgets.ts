import { date, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

export const evaluationBudgetsTable = pgTable("evaluation_daily_budgets", {
  day: date("day", { mode: "string" }).notNull(),
  scope: text("scope").notNull(),
  used: integer("used").notNull().default(0),
}, table => [primaryKey({ columns: [table.day, table.scope] })]);

export const insertEvaluationBudgetSchema = createInsertSchema(evaluationBudgetsTable);
export type InsertEvaluationBudget = z.infer<typeof insertEvaluationBudgetSchema>;
export type EvaluationBudget = typeof evaluationBudgetsTable.$inferSelect;
