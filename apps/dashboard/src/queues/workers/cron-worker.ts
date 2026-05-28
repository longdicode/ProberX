import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { connection } from "../connection";
import type { CronExecJob } from "../cron-queue";
import { cronExecutions } from "../../db/schema/cron-executions";
import type { DbClient } from "../../db/index";

function createProcessor(db: DbClient) {
  return async (job: { data: CronExecJob }) => {
    const { execId, host, port, command } = job.data;

    const res = await fetch(`http://${host}:${port}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeout_sec: 30 }),
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
  };
}

export async function startCronWorker(db: DbClient) {
  const worker = new Worker<CronExecJob>("cron-execution", createProcessor(db), {
    connection,
    concurrency: 2,
  });

  worker.on("failed", (job, err) => {
    console.error(`Cron exec job ${job?.id} failed:`, err.message);
  });

  return worker;
}
