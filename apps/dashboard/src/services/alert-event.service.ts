import { eq, and, desc, inArray } from "drizzle-orm";
import { alertEvents } from "../db/schema/alert-events";
import { alertRules } from "../db/schema/alert-rules";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

export async function listByRule(workspaceId: string, ruleId: string, db: DbClient) {
  const [rule] = await db.select().from(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.workspaceId, workspaceId))).limit(1);
  if (!rule) throw AppError.notFound("Alert rule", ruleId);

  return db.select().from(alertEvents)
    .where(eq(alertEvents.ruleId, ruleId))
    .orderBy(desc(alertEvents.createdAt));
}

export async function listByWorkspace(workspaceId: string, db: DbClient, limit = 50) {
  const rules = await db.select({ id: alertRules.id, name: alertRules.name }).from(alertRules)
    .where(eq(alertRules.workspaceId, workspaceId));
  const ruleIds = rules.map(r => r.id);
  const ruleMap = new Map(rules.map(r => [r.id, r.name]));

  if (ruleIds.length === 0) return [];

  const events = await db.select().from(alertEvents)
    .where(inArray(alertEvents.ruleId, ruleIds))
    .orderBy(desc(alertEvents.createdAt))
    .limit(limit);

  return events.map(e => ({ ...e, ruleName: ruleMap.get(e.ruleId) ?? "Unknown" }));
}

export async function resolve(workspaceId: string, ruleId: string, eventId: string, db: DbClient) {
  const [rule] = await db.select().from(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.workspaceId, workspaceId))).limit(1);
  if (!rule) throw AppError.notFound("Alert rule", ruleId);

  const [event] = await db.select().from(alertEvents)
    .where(and(eq(alertEvents.id, eventId), eq(alertEvents.ruleId, ruleId))).limit(1);
  if (!event) throw AppError.notFound("Alert event", eventId);

  const [updated] = await db.update(alertEvents)
    .set({ isResolved: true, resolvedAt: new Date() })
    .where(eq(alertEvents.id, eventId))
    .returning();
  return updated;
}
