import { eq, isNotNull } from "drizzle-orm";
import { servers } from "../db/schema/servers";
import { metricSnapshots } from "../db/schema/metric-snapshots";
import { broadcastMetrics, broadcastServerStatus } from "../ws/broadcaster";
import { evaluateMetrics } from "./alert-evaluator";
import type { DbClient } from "../db/index";

interface AgentSnapshot {
  cpu_percent: number;
  mem_total: number;
  mem_used: number;
  disk_total: number;
  disk_used: number;
  net_in_bytes: number;
  net_out_bytes: number;
  load_1: number;
  load_5: number;
  load_15: number;
  gpu_name: string;
  gpu_util_percent: number;
  gpu_mem_total: number;
  gpu_mem_used: number;
  gpu_temp: number;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startMetricsPoller(db: DbClient, intervalSec = 60) {
  if (timer) return;

  const poll = async () => {
    const targets = await db
      .select({
        id: servers.id,
        name: servers.name,
        workspaceId: servers.workspaceId,
        hostInfo: servers.hostInfo,
        lastSeenAt: servers.lastSeenAt,
        isOnline: servers.isOnline,
      })
      .from(servers)
      .where(isNotNull(servers.hostInfo));

    for (const s of targets) {
      // Skip servers offline > 5 min to avoid wasted fetch attempts
      if (!s.isOnline && s.lastSeenAt) {
        const offlineSince = Date.now() - new Date(s.lastSeenAt).getTime();
        if (offlineSince > 300_000) continue;
      }
      const hostInfo = s.hostInfo as Record<string, unknown> | null;
      const host = hostInfo?.agent_host as string | undefined;
      const port = (hostInfo?.agent_port as number) ?? 9800;
      if (!host) continue;

      try {
        const res = await fetch(`http://${host}:${port}/metrics`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);

        const snap = (await res.json()) as AgentSnapshot;

        await db.insert(metricSnapshots).values({
          serverId: s.id,
          time: new Date(),
          cpuPercent: String(snap.cpu_percent),
          memTotal: snap.mem_total,
          memUsed: snap.mem_used,
          diskTotal: snap.disk_total,
          diskUsed: snap.disk_used,
          netInBytes: snap.net_in_bytes,
          netOutBytes: snap.net_out_bytes,
          load1: String(snap.load_1),
          load5: String(snap.load_5),
          load15: String(snap.load_15),
          gpuName: snap.gpu_name,
          gpuUtilPercent: String(snap.gpu_util_percent),
          gpuMemTotal: snap.gpu_mem_total,
          gpuMemUsed: snap.gpu_mem_used,
          gpuTemp: String(snap.gpu_temp),
        });

        await db
          .update(servers)
          .set({ isOnline: true, lastSeenAt: new Date() })
          .where(eq(servers.id, s.id));

        broadcastMetrics(s.workspaceId, {
          serverId: s.id,
          serverName: s.name,
          cpuPercent: snap.cpu_percent,
          memUsed: snap.mem_used,
          memTotal: snap.mem_total,
          diskUsed: snap.disk_used,
          diskTotal: snap.disk_total,
          load1: snap.load_1,
          load5: snap.load_5,
          load15: snap.load_15,
          gpuName: snap.gpu_name,
          gpuUtilPercent: snap.gpu_util_percent,
          gpuMemUsed: snap.gpu_mem_used,
          gpuMemTotal: snap.gpu_mem_total,
          gpuTemp: snap.gpu_temp,
        });

        evaluateMetrics(db, s.workspaceId, s.id, s.name, snap.cpu_percent, snap.mem_used, snap.disk_used);
      } catch {
        // Only mark offline if the agent hasn't pushed recently (push model takes priority over pull)
        const recentlySeen = s.lastSeenAt && (Date.now() - new Date(s.lastSeenAt).getTime()) < 90_000;
        if (!recentlySeen) {
          await db
            .update(servers)
            .set({ isOnline: false })
            .where(eq(servers.id, s.id));

          broadcastServerStatus(s.workspaceId, {
            serverId: s.id,
            serverName: s.name,
            online: false,
          });
        }
      }
    }
  };

  poll();
  timer = setInterval(poll, intervalSec * 1000);
}

export function stopMetricsPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
