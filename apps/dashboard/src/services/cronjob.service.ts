import { eq, and, desc } from "drizzle-orm";
import { cronJobs } from "../db/schema/cron-jobs";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateCronJobInput, UpdateCronJobInput } from "../validators/cronjob";

export async function list(workspaceId: string, db: DbClient, limit = 50) {
  return db.select().from(cronJobs)
    .where(eq(cronJobs.workspaceId, workspaceId))
    .orderBy(desc(cronJobs.createdAt))
    .limit(limit);
}

export async function create(workspaceId: string, input: CreateCronJobInput, db: DbClient) {
  const [job] = await db.insert(cronJobs).values({
    workspaceId,
    name: input.name,
    cronExpr: input.cronExpr,
    command: input.command,
    targetServers: input.targetServers,
  }).returning();
  return job;
}

export async function update(workspaceId: string, jobId: string, input: UpdateCronJobInput, db: DbClient) {
  const [job] = await db.select().from(cronJobs)
    .where(and(eq(cronJobs.id, jobId), eq(cronJobs.workspaceId, workspaceId))).limit(1);
  if (!job) throw AppError.notFound("Cron job", jobId);

  const [updated] = await db.update(cronJobs)
    .set({
      name: input.name ?? job.name,
      cronExpr: input.cronExpr ?? job.cronExpr,
      command: input.command ?? job.command,
      targetServers: input.targetServers ?? job.targetServers,
      isEnabled: input.isEnabled ?? job.isEnabled,
    })
    .where(and(eq(cronJobs.id, jobId), eq(cronJobs.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, jobId: string, db: DbClient) {
  const [job] = await db.select().from(cronJobs)
    .where(and(eq(cronJobs.id, jobId), eq(cronJobs.workspaceId, workspaceId))).limit(1);
  if (!job) throw AppError.notFound("Cron job", jobId);
  await db.delete(cronJobs).where(and(eq(cronJobs.id, jobId), eq(cronJobs.workspaceId, workspaceId)));
}
