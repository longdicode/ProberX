import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { servers } from "./servers";

// AI 智能体“记忆”：把排查/巡检/周报沉淀为可向量检索的知识文档
export const memoryDocs = pgTable("memory_docs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
  sourceType: varchar("source_type", { length: 24 }).notNull(),
  sourceId: varchar("source_id", { length: 64 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  kind: varchar("kind", { length: 40 }).default("ops"),
  embedding: jsonb("embedding"),
  dim: integer("dim"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
