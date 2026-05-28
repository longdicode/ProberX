import { eq, and, count, desc, sql } from "drizzle-orm";
import { workspaces } from "../db/schema/workspaces";
import { memberships } from "../db/schema/memberships";
import { servers } from "../db/schema/servers";
import { monitorTasks } from "../db/schema/monitor-tasks";
import { alertRules } from "../db/schema/alert-rules";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "../validators/workspace";

export async function list(userId: string, db: DbClient) {
  return db.select({
    id: workspaces.id,
    name: workspaces.name,
    plan: workspaces.plan,
    settings: workspaces.settings,
    createdAt: workspaces.createdAt,
    updatedAt: workspaces.updatedAt,
  }).from(workspaces)
    .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(workspaces.createdAt);
}

export async function create(userId: string, input: CreateWorkspaceInput, db: DbClient) {
  const [ws] = await db.insert(workspaces).values({ name: input.name }).returning();
  await db.insert(memberships).values({ workspaceId: ws.id, userId, role: "owner" });
  return ws;
}

export async function getById(userId: string, workspaceId: string, db: DbClient) {
  const [ws] = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    plan: workspaces.plan,
    settings: workspaces.settings,
    createdAt: workspaces.createdAt,
    updatedAt: workspaces.updatedAt,
  }).from(workspaces)
    .innerJoin(memberships, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(workspaces.id, workspaceId), eq(memberships.userId, userId)))
    .limit(1);
  if (!ws) throw AppError.notFound("Workspace", workspaceId);
  return ws;
}

export async function update(userId: string, workspaceId: string, input: UpdateWorkspaceInput, db: DbClient) {
  await getById(userId, workspaceId, db); // verify access
  const [updated] = await db.update(workspaces)
    .set({ name: input.name ?? undefined, plan: input.plan, settings: input.settings as Record<string, unknown> | undefined, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  return updated;
}

export async function remove(userId: string, workspaceId: string, db: DbClient) {
  const [member] = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId))).limit(1);
  if (!member || member.role !== "owner") throw AppError.forbidden("Only workspace owners can delete workspaces");
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function getDashboardStats(workspaceId: string, db: DbClient) {
  const [serverCount] = await db.select({ count: count() }).from(servers)
    .where(eq(servers.workspaceId, workspaceId));

  const [monitorCount] = await db.select({ count: count() }).from(monitorTasks)
    .where(and(eq(monitorTasks.workspaceId, workspaceId), eq(monitorTasks.isEnabled, true)));

  const [alertCount] = await db.select({ count: count() }).from(alertRules)
    .where(eq(alertRules.workspaceId, workspaceId));

  const avgCpuResult = await db.execute(sql`
    SELECT COALESCE(AVG(ms.cpu_percent), 0) as avg_cpu
    FROM metric_snapshots ms
    INNER JOIN servers s ON s.id = ms.server_id
    WHERE s.workspace_id = ${workspaceId}
    AND ms.time > NOW() - INTERVAL '10 minutes'
  `);

  const recentServers = await db.select({
    id: servers.id,
    name: servers.name,
    isOnline: servers.isOnline,
    lastSeenAt: servers.lastSeenAt,
    createdAt: servers.createdAt,
  }).from(servers)
    .where(eq(servers.workspaceId, workspaceId))
    .orderBy(desc(servers.createdAt))
    .limit(5);

  return {
    totalServers: serverCount.count,
    activeMonitors: monitorCount.count,
    alertsTotal: alertCount.count,
    avgCpu: Number((avgCpuResult.rows[0] as { avg_cpu: string })?.avg_cpu ?? 0),
    recentActivity: recentServers.map((s) => ({
      type: "server" as const,
      serverName: s.name,
      isOnline: s.isOnline,
      timestamp: s.lastSeenAt ?? s.createdAt,
    })),
  };
}
