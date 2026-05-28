import { Queue } from "bullmq";
import { connection } from "./connection";

export interface CronExecJob {
  execId: string;
  jobId: string;
  serverId: string;
  host: string;
  port: number;
  command: string;
}

export const cronExecQueue = new Queue<CronExecJob>("cron-execution", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export async function enqueueCronExec(payload: CronExecJob) {
  await cronExecQueue.add("cron-exec", payload);
}
