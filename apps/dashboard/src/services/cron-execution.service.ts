import { eq, and, desc } from "drizzle-orm";
import { cronExecutions } from "../db/schema/cron-executions";
import { cronJobs } from "../db/schema/cron-jobs";
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
