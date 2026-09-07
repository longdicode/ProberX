import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { servers } from "./servers";

export const diagnosisRuns = pgTable("diagnosis_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  goal: text("goal").notNull(),
  trigger: varchar("trigger", { length: 20 }).notNull().default("manual"),
  expertType: varchar("expert_type", { length: 40 }),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  steps: jsonb("steps").default([]),
  rootCause: text("root_cause"),
  confidence: integer("confidence"),
  evidence: text("evidence"),
  conclusion: text("conclusion"),
  suggestions: jsonb("suggestions").default([]),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
