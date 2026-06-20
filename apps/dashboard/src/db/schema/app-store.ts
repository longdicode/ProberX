import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const appStoreEntries = pgTable("app_store_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull().default("Tools"),
  icon: varchar("icon", { length: 50 }).notNull().default("package"),
  composeYaml: text("compose_yaml").notNull(),
  defaultEnv: jsonb("default_env").default({}),
  memoryLimit: varchar("memory_limit", { length: 20 }),
  cpuLimit: varchar("cpu_limit", { length: 10 }),
  logoUrl: text("logo_url"),
  version: varchar("version", { length: 50 }),
  author: varchar("author", { length: 255 }),
  homepage: text("homepage"),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
