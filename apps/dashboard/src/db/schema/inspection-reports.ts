import { pgTable, uuid, varchar, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { servers } from "./servers";

export const inspectionReports = pgTable("inspection_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  trigger: varchar("trigger", { length: 20 }).notNull().default("manual"),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  healthScore: integer("health_score"),
  summary: text("summary"),
  findings: jsonb("findings").default([]),
  metricsSummary: jsonb("metrics_summary").default({}),
  markdown: text("markdown"),
  rawEvidence: text("raw_evidence"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
