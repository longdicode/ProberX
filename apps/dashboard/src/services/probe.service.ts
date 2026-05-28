import { eq, and, desc, inArray } from "drizzle-orm";
import { probeResults } from "../db/schema/probe-results";
import { monitorTasks } from "../db/schema/monitor-tasks";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

export async function listByMonitor(workspaceId: string, monitorId: string, db: DbClient, limit = 50) {
  const [monitor] = await db.select().from(monitorTasks)
    .where(and(eq(monitorTasks.id, monitorId), eq(monitorTasks.workspaceId, workspaceId))).limit(1);
  if (!monitor) throw AppError.notFound("Monitor", monitorId);

  return db.select().from(probeResults)
    .where(eq(probeResults.taskId, monitorId))
    .orderBy(desc(probeResults.time))
    .limit(limit);
}

export async function listByServer(workspaceId: string, serverId: string, db: DbClient, limit = 50) {
  const tasks = await db.select({ id: monitorTasks.id }).from(monitorTasks)
    .where(and(eq(monitorTasks.workspaceId, workspaceId)));
  const taskIds = tasks.map(t => t.id);

  if (taskIds.length === 0) return [];

  return db.select().from(probeResults)
    .where(inArray(probeResults.taskId, taskIds))
    .orderBy(desc(probeResults.time))
    .limit(limit);
}

export async function listRecent(workspaceId: string, db: DbClient, limit = 20) {
  const tasks = await db.select({ id: monitorTasks.id }).from(monitorTasks)
    .where(eq(monitorTasks.workspaceId, workspaceId));
  const taskIds = tasks.map(t => t.id);

  if (taskIds.length === 0) return [];

  return db.select().from(probeResults)
    .where(inArray(probeResults.taskId, taskIds))
    .orderBy(desc(probeResults.time))
    .limit(limit);
}
