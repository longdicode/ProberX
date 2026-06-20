import { eq, and } from "drizzle-orm";
import { notificationChannels } from "../db/schema/notification-channels";
import { env } from "../config/env";
import { sendToChannel } from "./notification-senders";
import type { DbClient } from "../db/index";

interface AlertPayload {
  workspaceId: string;
  eventId: string;
  ruleName: string;
  severity: string;
  message: string;
  metricValue?: string;
}

export async function dispatchAlert(db: DbClient, payload: AlertPayload) {
  if (env.QUEUE_ENABLED) {
    const { enqueueNotification } = await import("../queues/notification-queue");
    await enqueueNotification(payload);
    return;
  }

  await sendNotifications(db, payload);
}

export async function sendNotifications(db: DbClient, payload: AlertPayload) {
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
      workspaceId: payload.workspaceId,
      eventId: payload.eventId,
    });
  }
}
