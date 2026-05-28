import { Queue } from "bullmq";
import { connection } from "./connection";

export interface NotificationJob {
  workspaceId: string;
  eventId: string;
  ruleName: string;
  severity: string;
  message: string;
  metricValue?: string;
}

export const notificationQueue = new Queue<NotificationJob>("notification-dispatch", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

export async function enqueueNotification(payload: NotificationJob) {
  await notificationQueue.add("alert-notification", payload);
}
