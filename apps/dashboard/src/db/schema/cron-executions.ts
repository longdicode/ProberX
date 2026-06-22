import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { cronJobs } from "./cron-jobs";
import { servers } from "./servers";

export const cronExecutions = pgTable("cron_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => cronJobs.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull(),
  output: text("output"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});