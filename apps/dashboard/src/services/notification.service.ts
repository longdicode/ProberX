import { eq, and, desc } from "drizzle-orm";
import { notificationChannels } from "../db/schema/notification-channels";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateChannelInput, UpdateChannelInput } from "../validators/notification";

export async function list(workspaceId: string, db: DbClient, limit = 50) {
  return db.select().from(notificationChannels)
    .where(eq(notificationChannels.workspaceId, workspaceId))
    .orderBy(desc(notificationChannels.createdAt))
    .limit(limit);
}

export async function create(workspaceId: string, input: CreateChannelInput, db: DbClient) {
  const [channel] = await db.insert(notificationChannels).values({
    workspaceId,
    name: input.name,
    type: input.type,
    config: input.config as Record<string, unknown>,
  }).returning();
  return channel;
}

export async function update(workspaceId: string, channelId: string, input: UpdateChannelInput, db: DbClient) {
  const [channel] = await db.select().from(notificationChannels)
    .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.workspaceId, workspaceId))).limit(1);
  if (!channel) throw AppError.notFound("Notification channel", channelId);

  const [updated] = await db.update(notificationChannels)
    .set({
      name: input.name ?? channel.name,
      type: input.type ?? channel.type,
      config: input.config ? (input.config as Record<string, unknown>) : channel.config,
      isEnabled: input.isEnabled !== undefined ? input.isEnabled : channel.isEnabled,
    })
    .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, channelId: string, db: DbClient) {
  const [channel] = await db.select().from(notificationChannels)
    .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.workspaceId, workspaceId))).limit(1);
  if (!channel) throw AppError.notFound("Notification channel", channelId);
  await db.delete(notificationChannels).where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.workspaceId, workspaceId)));
}
