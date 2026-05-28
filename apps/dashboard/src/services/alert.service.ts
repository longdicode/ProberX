import { eq, and, desc } from "drizzle-orm";
import { alertRules } from "../db/schema/alert-rules";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateAlertInput, UpdateAlertInput } from "../validators/alert";

export async function list(workspaceId: string, db: DbClient, limit = 50) {
  return db.select().from(alertRules)
    .where(eq(alertRules.workspaceId, workspaceId))
    .orderBy(desc(alertRules.createdAt))
    .limit(limit);
}

export async function create(workspaceId: string, input: CreateAlertInput, db: DbClient) {
  const [rule] = await db.insert(alertRules).values({
    workspaceId,
    name: input.name,
    targetType: input.targetType,
    targetId: input.targetId,
    metric: input.metric,
    operator: input.operator,
    threshold: String(input.threshold),
    durationSec: input.durationSec ?? 0,
    severity: input.severity ?? "warning",
  } as typeof alertRules.$inferInsert).returning();
  return rule;
}

export async function getById(workspaceId: string, ruleId: string, db: DbClient) {
  const [rule] = await db.select().from(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.workspaceId, workspaceId))).limit(1);
  if (!rule) throw AppError.notFound("Alert rule", ruleId);
  return rule;
}

export async function update(workspaceId: string, ruleId: string, input: UpdateAlertInput, db: DbClient) {
  const existing = await getById(workspaceId, ruleId, db);
  const [updated] = await db.update(alertRules)
    .set({
      name: input.name ?? existing.name,
      metric: input.metric ?? existing.metric,
      operator: input.operator ?? existing.operator,
      threshold: input.threshold !== undefined ? String(input.threshold) : existing.threshold,
      durationSec: input.durationSec ?? existing.durationSec,
      severity: input.severity ?? existing.severity,
      isEnabled: input.isEnabled ?? existing.isEnabled,
    })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, ruleId: string, db: DbClient) {
  await getById(workspaceId, ruleId, db);
  await db.delete(alertRules).where(and(eq(alertRules.id, ruleId), eq(alertRules.workspaceId, workspaceId)));
}
