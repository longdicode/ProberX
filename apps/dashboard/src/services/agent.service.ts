import { eq, and } from "drizzle-orm";
import { servers } from "../db/schema/servers";
import { metricSnapshots } from "../db/schema/metric-snapshots";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { AgentRegisterInput, AgentMetricsInput } from "../validators/agent";

export async function register(input: AgentRegisterInput, db: DbClient, remoteIp?: string) {
  const [server] = await db.select().from(servers).where(eq(servers.agentId, input.agentId)).limit(1);
  if (!server) throw AppError.notFound("Server with agentId", input.agentId);

  const existingHostInfo = (server.hostInfo as Record<string, unknown>) ?? {};
  const mergedHostInfo = { ...existingHostInfo, ...(input.hostInfo as Record<string, unknown>) };

  // Infer agent_host from request IP if not already set
  if (!mergedHostInfo.agent_host && remoteIp) {
    mergedHostInfo.agent_host = remoteIp === "127.0.0.1" || remoteIp === "::1" ? "localhost" : remoteIp;
  }

  const [updated] = await db.update(servers)
    .set({
      hostInfo: mergedHostInfo,
      lastSeenAt: new Date(),
      isOnline: true,
    })
    .where(eq(servers.id, server.id))
    .returning();
  return { serverId: server.id, workspaceId: server.workspaceId };
}

export async function heartbeat(agentId: string, db: DbClient) {
  const [server] = await db.select().from(servers).where(eq(servers.agentId, agentId)).limit(1);
  if (!server) throw AppError.notFound("Server with agentId", agentId);

  await db.update(servers)
    .set({ lastSeenAt: new Date(), isOnline: true })
    .where(eq(servers.id, server.id));
  return { serverId: server.id };
}

export async function ingestMetrics(input: AgentMetricsInput, db: DbClient) {
  const [server] = await db.select().from(servers).where(eq(servers.agentId, input.agentId)).limit(1);
  if (!server) throw AppError.notFound("Server with agentId", input.agentId);

  const ts = input.collected_at ? new Date(input.collected_at) : input.timestamp ? new Date(input.timestamp) : new Date();
  await db.insert(metricSnapshots).values({
    time: ts,
    serverId: server.id,
    cpuPercent: input.cpu_percent !== undefined ? String(input.cpu_percent) : null,
    memTotal: input.mem_total ?? null,
    memUsed: input.mem_used ?? null,
    diskTotal: input.disk_total ?? null,
    diskUsed: input.disk_used ?? null,
    netInBytes: input.net_in_bytes ?? null,
    netOutBytes: input.net_out_bytes ?? null,
    load1: input.load_1 !== undefined ? String(input.load_1) : null,
    load5: input.load_5 !== undefined ? String(input.load_5) : null,
    load15: input.load_15 !== undefined ? String(input.load_15) : null,
  } as typeof metricSnapshots.$inferInsert);

  await db.update(servers)
    .set({ lastSeenAt: ts, isOnline: true })
    .where(eq(servers.id, server.id));
}
