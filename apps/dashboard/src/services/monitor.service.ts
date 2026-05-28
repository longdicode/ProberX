import { eq, and, desc } from "drizzle-orm";
import { monitorTasks } from "../db/schema/monitor-tasks";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateMonitorInput, UpdateMonitorInput } from "../validators/monitor";

export async function list(workspaceId: string, db: DbClient, limit = 50) {
  return db.select().from(monitorTasks)
    .where(eq(monitorTasks.workspaceId, workspaceId))
    .orderBy(desc(monitorTasks.createdAt))
    .limit(limit);
}

export async function create(workspaceId: string, input: CreateMonitorInput, db: DbClient) {
  const [monitor] = await db.insert(monitorTasks).values({
    workspaceId,
    name: input.name,
    type: input.type,
    target: input.target,
    intervalSec: input.intervalSec ?? 60,
    timeoutMs: input.timeoutMs ?? 5000,
    settings: input.settings as Record<string, unknown>,
  }).returning();
  return monitor;
}

export async function getById(workspaceId: string, monitorId: string, db: DbClient) {
  const [monitor] = await db.select().from(monitorTasks)
    .where(and(eq(monitorTasks.id, monitorId), eq(monitorTasks.workspaceId, workspaceId))).limit(1);
  if (!monitor) throw AppError.notFound("Monitor", monitorId);
  return monitor;
}

export async function update(workspaceId: string, monitorId: string, input: UpdateMonitorInput, db: DbClient) {
  const existing = await getById(workspaceId, monitorId, db);
  const [updated] = await db.update(monitorTasks)
    .set({
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
      target: input.target ?? existing.target,
      intervalSec: input.intervalSec ?? existing.intervalSec,
      timeoutMs: input.timeoutMs ?? existing.timeoutMs,
      settings: input.settings ? (input.settings as Record<string, unknown>) : existing.settings,
      isEnabled: input.isEnabled ?? existing.isEnabled,
    })
    .where(and(eq(monitorTasks.id, monitorId), eq(monitorTasks.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, monitorId: string, db: DbClient) {
  await getById(workspaceId, monitorId, db);
  await db.delete(monitorTasks).where(and(eq(monitorTasks.id, monitorId), eq(monitorTasks.workspaceId, workspaceId)));
}
