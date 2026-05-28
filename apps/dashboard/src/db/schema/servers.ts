import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  agentId: varchar("agent_id", { length: 64 }).unique(),
  agentSecret: varchar("agent_secret", { length: 128 }).notNull(),
  tags: text("tags").array().default([]),
  hostInfo: jsonb("host_info").default({}),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  isOnline: boolean("is_online").default(false),
  isHidden: boolean("is_hidden").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});