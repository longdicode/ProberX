import { pgTable, uuid, timestamp, boolean as pgBoolean, integer, text, jsonb } from "drizzle-orm/pg-core";
import { monitorTasks } from "./monitor-tasks";

export const probeResults = pgTable("probe_results", {
  time: timestamp("time", { withTimezone: true }).notNull(),
  taskId: uuid("task_id").notNull().references(() => monitorTasks.id, { onDelete: "cascade" }),
  isSuccess: pgBoolean("is_success").notNull(),
  responseMs: integer("response_ms"),
  statusCode: integer("status_code"),
  errorMsg: text("error_msg"),
  detail: jsonb("detail").default({}),
});