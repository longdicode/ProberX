import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const cronJobs = pgTable("cron_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  cronExpr: varchar("cron_expr", { length: 100 }).notNull(),
  command: text("command").notNull(),
  targetServers: uuid("target_servers").array().notNull(),
  isEnabled: boolean("is_enabled").default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});