import { pgTable, uuid, varchar, text, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { alertRules } from "./alert-rules";
import { servers } from "./servers";
import { monitorTasks } from "./monitor-tasks";

export const alertEvents = pgTable("alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
  taskId: uuid("task_id").references(() => monitorTasks.id, { onDelete: "cascade" }),
  severity: varchar("severity", { length: 20 }).notNull(),
  message: text("message").notNull(),
  metricValue: decimal("metric_value", { precision: 12, scale: 2 }),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});