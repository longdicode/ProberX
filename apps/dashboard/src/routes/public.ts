import type { FastifyPluginAsync } from "fastify";
import { eq, desc } from "drizzle-orm";
import * as statusPageService from "../services/status-page.service";
import { servers } from "../db/schema/servers";
import { monitorTasks } from "../db/schema/monitor-tasks";
import { probeResults } from "../db/schema/probe-results";
import { metricSnapshots } from "../db/schema/metric-snapshots";

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/status/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    try {
      const sp = await statusPageService.getBySlug(slug, app.db);

      const serverList = await app.db
        .select({ id: servers.id, name: servers.name, isOnline: servers.isOnline, lastSeenAt: servers.lastSeenAt, hostInfo: servers.hostInfo })
        .from(servers)
        .where(eq(servers.workspaceId, sp.workspaceId));

      const monitorList = await app.db
        .select({ id: monitorTasks.id, name: monitorTasks.name, type: monitorTasks.type, target: monitorTasks.target, isEnabled: monitorTasks.isEnabled })
        .from(monitorTasks)
        .where(eq(monitorTasks.workspaceId, sp.workspaceId));

      // Latest probe result per monitor
      const probeMap: Record<string, { isSuccess: boolean; responseMs: number | null; time: Date }> = {};
      if (monitorList.length > 0) {
        for (const m of monitorList) {
          const [latest] = await app.db
            .select({ isSuccess: probeResults.isSuccess, responseMs: probeResults.responseMs, time: probeResults.time })
            .from(probeResults)
            .where(eq(probeResults.taskId, m.id))
            .orderBy(desc(probeResults.time))
            .limit(1);
          if (latest) probeMap[m.id] = latest;
        }
      }

      // Latest metric snapshot per server
      const serverMetrics: Record<string, Record<string, unknown>> = {};
      for (const s of serverList) {
        const [latestMetric] = await app.db
          .select({
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
            time: metricSnapshots.time,
          })
          .from(metricSnapshots)
          .where(eq(metricSnapshots.serverId, s.id))
          .orderBy(desc(metricSnapshots.time))
          .limit(1);
        if (latestMetric) {
          serverMetrics[s.id] = {
            cpuPercent: latestMetric.cpuPercent ? Number(latestMetric.cpuPercent) : null,
            memTotal: latestMetric.memTotal,
            memUsed: latestMetric.memUsed,
            diskTotal: latestMetric.diskTotal,
            diskUsed: latestMetric.diskUsed,
            netInBytes: latestMetric.netInBytes,
            netOutBytes: latestMetric.netOutBytes,
            load1: latestMetric.load1 ? Number(latestMetric.load1) : null,
            load5: latestMetric.load5 ? Number(latestMetric.load5) : null,
            load15: latestMetric.load15 ? Number(latestMetric.load15) : null,
            updatedAt: latestMetric.time,
          };
        }
      }

      const allServersOnline = serverList.length > 0 && serverList.every((s) => s.isOnline);
      const probes = Object.values(probeMap);
      const allMonitorsHealthy = probes.length > 0 && probes.every((p) => p.isSuccess);

      let status = "unknown";
      if (serverList.length > 0 || monitorList.length > 0) {
        status = (allServersOnline && (probes.length === 0 || allMonitorsHealthy)) ? "operational" : "degraded";
      }

      const services = [
        ...serverList.map((s) => ({
          name: s.name,
          type: "server" as const,
          status: s.isOnline ? ("operational" as const) : ("down" as const),
          detail: s.isOnline ? "Online" : "Offline",
          hostInfo: s.hostInfo,
          metrics: serverMetrics[s.id] || null,
        })),
        ...monitorList.map((m) => {
          const probe = probeMap[m.id];
          return {
            name: m.name,
            type: "monitor" as const,
            target: m.target,
            monitorType: m.type,
            status: probe ? (probe.isSuccess ? ("operational" as const) : ("degraded" as const)) : ("unknown" as const),
            detail: probe ? `${probe.responseMs ?? "?"}ms` : "No data",
          };
        }),
      ];

      return reply.send({
        id: sp.id,
        name: sp.name,
        slug: sp.slug,
        logoUrl: sp.logoUrl,
        theme: sp.theme,
        status,
        services,
      });
    } catch {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Status page not found" });
    }
  });
};
