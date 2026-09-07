import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  trigger: varchar("trigger", { length: 100 }),
  steps: jsonb("steps").default([]).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});