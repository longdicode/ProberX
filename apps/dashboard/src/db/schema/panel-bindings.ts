import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { servers } from "./servers";

/**
 * Panel binding: link a server control panel into ProberX as a native data source.
 */
export const panelBindings = pgTable("panel_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  adapter: varchar("adapter", { length: 20 }).notNull().default("bt"),
  name: varchar("name", { length: 100 }),
  panelUrl: text("panel_url").notNull(),
  apiKey: text("api_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastStatus: varchar("last_status", { length: 40 }),
  errorMsg: text("error_msg"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
