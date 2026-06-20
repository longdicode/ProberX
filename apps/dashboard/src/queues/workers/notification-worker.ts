import { Worker } from "bullmq";
import { eq, and } from "drizzle-orm";
import { connection } from "../connection";
import type { NotificationJob } from "../notification-queue";
import { notificationChannels } from "../../db/schema/notification-channels";
import { sendToChannel } from "../../services/notification-senders";
import type { DbClient } from "../../db/index";

function createProcessor(db: DbClient) {
  return async (job: { data: NotificationJob }) => {
    const payload = job.data;

    const channels = await db
      .select()
      .from(notificationChannels)
      .where(
        and(
          eq(notificationChannels.workspaceId, payload.workspaceId),
          eq(notificationChannels.isEnabled, true),
        ),
      );

    for (const ch of channels) {
      await sendToChannel(ch.type, ch.config as Record<string, unknown>, {
        channelName: ch.name,
        ruleName: payload.ruleName,
        severity: payload.severity,
        message: payload.message,
        metricValue: payload.metricValue,
      });
    }
  };
}

export async function startNotificationWorker(db: DbClient) {
  const worker = new Worker<NotificationJob>(
    "notification-dispatch",
    createProcessor(db),
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  return worker;
}
