import crypto from "crypto";
import { eq, and, desc, inArray } from "drizzle-orm";
import { servers } from "../db/schema/servers";
import { metricSnapshots } from "../db/schema/metric-snapshots";
import { generateAgentSecret } from "../utils/crypto";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateServerInput, UpdateServerInput } from "../validators/server";

export async function list(workspaceId: string, db: DbClient, limit = 50) {
  const rows = await db.select({
    id: servers.id,
    name: servers.name,
    agentId: servers.agentId,
    tags: servers.tags,
    hostInfo: servers.hostInfo,
    lastSeenAt: servers.lastSeenAt,
    isOnline: servers.isOnline,
    isHidden: servers.isHidden,
    createdAt: servers.createdAt,
  }).from(servers)
    .where(eq(servers.workspaceId, workspaceId))
    .orderBy(desc(servers.createdAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return rows;

  const latestMetrics = await db
    .select({
      serverId: metricSnapshots.serverId,
      cpuPercent: metricSnapshots.cpuPercent,
      memTotal: metricSnapshots.memTotal,
      memUsed: metricSnapshots.memUsed,
    })
    .from(metricSnapshots)
    .where(inArray(metricSnapshots.serverId, ids))
    .orderBy(metricSnapshots.serverId, desc(metricSnapshots.time));

  const metricByServer = new Map<string, typeof latestMetrics[number]>();
  for (const m of latestMetrics) {
    if (!metricByServer.has(m.serverId)) metricByServer.set(m.serverId, m);
  }

  return rows.map((r) => {
    const m = metricByServer.get(r.id);
    return {
      ...r,
      latestCpuPercent: m?.cpuPercent ?? null,
      latestMemTotal: m?.memTotal ?? null,
      latestMemUsed: m?.memUsed ?? null,
    };
  });
}

export async function create(workspaceId: string, input: CreateServerInput, db: DbClient) {
  const agentSecret = generateAgentSecret();
	const agentId = input.agentId || `agent-${crypto.randomUUID().slice(0, 8)}`;
	const hostInfo: Record<string, unknown> = {};
	if (input.agentHost) hostInfo.agent_host = input.agentHost;
	if (input.agentPort) hostInfo.agent_port = input.agentPort;

	const [server] = await db.insert(servers).values({
		workspaceId,
		name: input.name,
		agentId,
		tags: input.tags ?? [],
		agentSecret,
		isHidden: input.isHidden ?? false,
		hostInfo,
	}).returning();
	return { ...server, agentToken: agentSecret };
}

export async function getById(workspaceId: string, serverId: string, db: DbClient) {
  const [server] = await db.select().from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId))).limit(1);
  if (!server) throw AppError.notFound("Server", serverId);
  return server;
}

export async function update(workspaceId: string, serverId: string, input: UpdateServerInput, db: DbClient) {
	  const existing = await getById(workspaceId, serverId, db);
	  const hostInfo = (existing.hostInfo as Record<string, unknown>) ?? {};
	  if (input.agentHost !== undefined) hostInfo.agent_host = input.agentHost;
	  if (input.agentPort !== undefined) hostInfo.agent_port = input.agentPort;
	  const [updated] = await db.update(servers)
	    .set({
	      name: input.name ?? existing.name,
	      tags: input.tags ?? existing.tags,
	      isHidden: input.isHidden ?? existing.isHidden,
	      hostInfo,
	    })
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, serverId: string, db: DbClient) {
  await getById(workspaceId, serverId, db);
  await db.delete(servers).where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)));
}

export async function regenerateToken(workspaceId: string, serverId: string, db: DbClient) {
  await getById(workspaceId, serverId, db);
  const agentSecret = generateAgentSecret();
  await db.update(servers)
    .set({ agentSecret, agentId: null })
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)));
  return { agentToken: agentSecret };
}

export async function pullMetrics(workspaceId: string, serverId: string, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");

  const res = await fetch(`http://${host}:${port}/metrics`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);

  const snap = (await res.json()) as Record<string, unknown>;

  await db.insert(metricSnapshots).values({
    serverId,
    time: new Date(),
    cpuPercent: snap.cpu_percent != null ? String(snap.cpu_percent) : null,
    memTotal: snap.mem_total as number ?? null,
    memUsed: snap.mem_used as number ?? null,
    diskTotal: snap.disk_total as number ?? null,
    diskUsed: snap.disk_used as number ?? null,
    netInBytes: snap.net_in_bytes as number ?? null,
    netOutBytes: snap.net_out_bytes as number ?? null,
    load1: snap.load_1 != null ? String(snap.load_1) : null,
    load5: snap.load_5 != null ? String(snap.load_5) : null,
    load15: snap.load_15 != null ? String(snap.load_15) : null,
  });

  await db.update(servers)
    .set({ isOnline: true, lastSeenAt: new Date() })
    .where(eq(servers.id, serverId));

  return snap;
}

export async function runProbe(
  workspaceId: string,
  serverId: string,
  probe: { type: string; target: string; timeoutMs?: number },
  db: DbClient,
) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");

  const timeoutMs = probe.timeoutMs ?? 5000;
  const res = await fetch(`http://${host}:${port}/probe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: probe.type,
      target: probe.target,
      timeout_ms: timeoutMs,
    }),
    signal: AbortSignal.timeout(timeoutMs + 5000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);

  return res.json();
}

export async function getProcesses(workspaceId: string, serverId: string, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");

  const res = await fetch(`http://${host}:${port}/processes`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);

  return res.json();
}
