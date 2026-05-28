import { eq, and, gte, lte, desc } from "drizzle-orm";
import { metricSnapshots } from "../db/schema/metric-snapshots";
import { servers } from "../db/schema/servers";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

export async function getServerMetrics(
  workspaceId: string, serverId: string, query: { from?: string; to?: string; interval?: number }, db: DbClient
) {
  const [server] = await db.select({ id: servers.id }).from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId))).limit(1);
  if (!server) throw AppError.notFound("Server", serverId);

  let conditions = [eq(metricSnapshots.serverId, serverId)];
  const now = new Date();
  const fromDate = query.from ? new Date(query.from) : new Date(now.getTime() - 3600000); // default 1h
  const toDate = query.to ? new Date(query.to) : now;
  conditions.push(gte(metricSnapshots.time, fromDate));
  conditions.push(lte(metricSnapshots.time, toDate));

  return db.select({
    time: metricSnapshots.time,
    cpuPercent: metricSnapshots.cpuPercent,
    memTotal: metricSnapshots.memTotal,
    memUsed: metricSnapshots.memUsed,
    diskTotal: metricSnapshots.diskTotal,
    diskUsed: metricSnapshots.diskUsed,
    netInBytes: metricSnapshots.netInBytes,
    netOutBytes: metricSnapshots.netOutBytes,
    load1: metricSnapshots.load1,
    load5: metricSnapshots.load5,
    load15: metricSnapshots.load15,
    gpuName: metricSnapshots.gpuName,
    gpuUtilPercent: metricSnapshots.gpuUtilPercent,
    gpuMemTotal: metricSnapshots.gpuMemTotal,
    gpuMemUsed: metricSnapshots.gpuMemUsed,
    gpuTemp: metricSnapshots.gpuTemp,
  }).from(metricSnapshots)
    .where(and(...conditions))
    .orderBy(desc(metricSnapshots.time))
    .limit(500); // max 500 data points
}
