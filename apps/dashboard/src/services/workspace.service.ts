import { eq, and, count, desc, sql } from "drizzle-orm";
import { workspaces } from "../db/schema/workspaces";
import { memberships } from "../db/schema/memberships";
import { servers } from "../db/schema/servers";
import { monitorTasks } from "../db/schema/monitor-tasks";
import { alertRules } from "../db/schema/alert-rules";
import { alertEvents } from "../db/schema/alert-events";
import { metricSnapshots } from "../db/schema/metric-snapshots";
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

export async function getAlertTrends(workspaceId: string, range: string, db: DbClient) {
  const intervals: Record<string, string> = {
    "24h": "1 hour",
    "7d": "1 day",
    "30d": "1 day",
  };
  const bucket = intervals[range] || "1 day";
  const since = range === "24h" ? "INTERVAL '24 hours'" : range === "7d" ? "INTERVAL '7 days'" : "INTERVAL '30 days'";

  const result = await db.execute(sql`
    SELECT
      date_trunc(${sql.raw(`'${bucket}'`)}, ae.created_at) AS period,
      COUNT(*)::int AS count,
      COUNT(CASE WHEN ae.severity IN ('critical','emergency') THEN 1 END)::int AS critical,
      COUNT(CASE WHEN ae.severity = 'warning' THEN 1 END)::int AS warning,
      COUNT(CASE WHEN ae.is_resolved = true THEN 1 END)::int AS resolved
    FROM alert_events ae
    INNER JOIN servers s ON s.id = ae.server_id
    WHERE s.workspace_id = ${workspaceId}
      AND ae.created_at > NOW() - ${sql.raw(since)}
    GROUP BY period
    ORDER BY period
  `);

  return (result.rows as { period: string; count: number; critical: number; warning: number; resolved: number }[]).map((r) => ({
    period: r.period,
    count: r.count,
    critical: r.critical,
    warning: r.warning,
    resolved: r.resolved,
  }));
}

export async function getServerComparison(workspaceId: string, db: DbClient) {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (s.id)
      s.name,
      ms.cpu_percent,
      ms.mem_used,
      ms.mem_total,
      ms.disk_used,
      ms.disk_total
    FROM servers s
    LEFT JOIN LATERAL (
      SELECT cpu_percent, mem_used, mem_total, disk_used, disk_total
      FROM metric_snapshots
      WHERE server_id = s.id
      ORDER BY time DESC LIMIT 1
    ) ms ON true
    WHERE s.workspace_id = ${workspaceId}
      AND s.is_online = true
  `);

  return (result.rows as {
    name: string; cpu_percent: string | null; mem_used: string | null;
    mem_total: string | null; disk_used: string | null; disk_total: string | null;
  }[]).map((r) => ({
    name: r.name,
    cpu: r.cpu_percent ? Number(r.cpu_percent) : 0,
    memory: r.mem_used != null && r.mem_total != null && Number(r.mem_total) > 0
      ? Math.round((Number(r.mem_used) / Number(r.mem_total)) * 100) : 0,
    disk: r.disk_used != null && r.disk_total != null && Number(r.disk_total) > 0
      ? Math.round((Number(r.disk_used) / Number(r.disk_total)) * 100) : 0,
  }));
}
