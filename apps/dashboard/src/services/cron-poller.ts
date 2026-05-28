import { CronExpressionParser } from "cron-parser";
import { eq, and, isNotNull } from "drizzle-orm";
import { cronJobs } from "../db/schema/cron-jobs";
import { cronExecutions } from "../db/schema/cron-executions";
import { servers } from "../db/schema/servers";
import type { DbClient } from "../db/index";
import { env } from "../config/env";

let timer: ReturnType<typeof setInterval> | null = null;

export function startCronPoller(db: DbClient, intervalSec = 60) {
  if (timer) return;

  const poll = async () => {
    const now = new Date();
    const jobs = await db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.isEnabled, true));

    for (const job of jobs) {
      try {
        const interval = CronExpressionParser.parse(job.cronExpr);
        const next = interval.next().toDate();
        const prev = job.lastRunAt
          ? CronExpressionParser.parse(job.cronExpr, { currentDate: new Date(job.lastRunAt.getTime() - 60000) }).next().toDate()
          : new Date(0);

        const shouldRun = now >= next && (job.lastRunAt == null || prev <= now);

        if (!shouldRun) continue;

        const targets = await db
          .select({
            id: servers.id,
            hostInfo: servers.hostInfo,
          })
          .from(servers)
          .where(
            and(
              eq(servers.workspaceId, job.workspaceId),
              eq(servers.isOnline, true),
              isNotNull(servers.hostInfo),
            ),
          );

        for (const server of targets) {
          if (job.targetServers.length > 0 && !job.targetServers.includes(server.id)) continue;

          const hostInfo = server.hostInfo as Record<string, unknown> | null;
          const host = hostInfo?.agent_host as string | undefined;
          const port = (hostInfo?.agent_port as number) ?? 9800;

          if (!host) continue;

          const execId = crypto.randomUUID();
          await db.insert(cronExecutions).values({
            id: execId,
            jobId: job.id,
            serverId: server.id,
            status: "running",
            startedAt: new Date(),
          });

          if (env.QUEUE_ENABLED) {
            const { enqueueCronExec } = await import("../queues/cron-queue");
            await enqueueCronExec({
              execId,
              jobId: job.id,
              serverId: server.id,
              host,
              port,
              command: job.command,
            });
          } else {
            try {
              const res = await fetch(`http://${host}:${port}/exec`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: job.command, timeout_sec: 30 }),
                signal: AbortSignal.timeout(35000),
              });

              const result = (await res.json()) as {
                exit_code?: number;
                stdout?: string;
                stderr?: string;
                error?: string;
              };

              await db
                .update(cronExecutions)
                .set({
                  status: result.exit_code === 0 ? "success" : "failed",
                  output: result.stdout ?? result.stderr ?? result.error ?? "",
                  finishedAt: new Date(),
                })
                .where(eq(cronExecutions.id, execId));
            } catch (err) {
              await db
                .update(cronExecutions)
                .set({
                  status: "failed",
                  output: err instanceof Error ? err.message : "unknown error",
                  finishedAt: new Date(),
                })
                .where(eq(cronExecutions.id, execId));
            }
          }
        }

        await db
          .update(cronJobs)
          .set({ lastRunAt: new Date() })
          .where(eq(cronJobs.id, job.id));
      } catch {
        // Skip invalid cron expressions
      }
    }
  };

  poll();
  timer = setInterval(poll, intervalSec * 1000);
}

export function stopCronPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
