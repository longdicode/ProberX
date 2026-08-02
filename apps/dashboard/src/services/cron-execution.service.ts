import { eq, and, desc, isNotNull } from "drizzle-orm";
import { cronExecutions } from "../db/schema/cron-executions";
import { cronJobs } from "../db/schema/cron-jobs";
import { servers } from "../db/schema/servers";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

export async function listByJob(workspaceId: string, jobId: string, db: DbClient, limit = 50) {
  const [job] = await db.select().from(cronJobs)
    .where(and(eq(cronJobs.id, jobId), eq(cronJobs.workspaceId, workspaceId))).limit(1);
  if (!job) throw AppError.notFound("Cron job", jobId);

  return db.select().from(cronExecutions)
    .where(eq(cronExecutions.jobId, jobId))
    .orderBy(desc(cronExecutions.createdAt))
    .limit(limit);
}

export async function listByWorkspace(workspaceId: string, db: DbClient, limit = 50) {
  return db.select({
    id: cronExecutions.id,
    jobId: cronExecutions.jobId,
    serverId: cronExecutions.serverId,
    status: cronExecutions.status,
    startedAt: cronExecutions.startedAt,
    finishedAt: cronExecutions.finishedAt,
    createdAt: cronExecutions.createdAt,
  }).from(cronExecutions)
    .innerJoin(cronJobs, eq(cronExecutions.jobId, cronJobs.id))
    .where(eq(cronJobs.workspaceId, workspaceId))
    .orderBy(desc(cronExecutions.createdAt))
    .limit(limit);
}

/**
 * Manually trigger a cron job now.
 * Finds all matching online servers, creates a running execution record
 * and enqueues (or synchronously runs) the command - same logic as the poller.
 */
export async function runNow(workspaceId: string, jobId: string, db: DbClient) {
  const [job] = await db.select().from(cronJobs)
    .where(and(eq(cronJobs.id, jobId), eq(cronJobs.workspaceId, workspaceId))).limit(1);
  if (!job) throw AppError.notFound("Cron job", jobId);

  const targets = await db
    .select({ id: servers.id, hostInfo: servers.hostInfo, agentSecret: servers.agentSecret })
    .from(servers)
    .where(
      and(
        eq(servers.workspaceId, workspaceId),
        eq(servers.isOnline, true),
        isNotNull(servers.hostInfo),
      ),
    );

  let triggered = 0;
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
        serverSecret: server.agentSecret,
      });
    } else {
      try {
        const res = await fetch(`http://${host}:${port}/exec`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(server.agentSecret ? { Authorization: `Bearer ${server.agentSecret}` } : {}),
          },
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
    triggered++;
  }

  return { triggered };
}

