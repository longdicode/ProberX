import { pgTable, uuid, varchar, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const monitorTasks = pgTable("monitor_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  target: text("target").notNull(),
  intervalSec: integer("interval_sec").notNull().default(60),
  timeoutMs: integer("timeout_ms").notNull().default(5000),
  settings: jsonb("settings").default({}),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});