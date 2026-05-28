import { pgTable, uuid, varchar, decimal, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  targetType: varchar("target_type", { length: 20 }).notNull(),
  targetId: uuid("target_id"),
  metric: varchar("metric", { length: 50 }).notNull(),
  operator: varchar("operator", { length: 10 }).notNull(),
  threshold: decimal("threshold", { precision: 12, scale: 2 }).notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  severity: varchar("severity", { length: 20 }).notNull().default("warning"),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});