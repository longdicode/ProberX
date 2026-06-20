import { z } from "zod";

export const createChannelBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["email", "webhook", "dingtalk", "feishu", "wecom", "telegram", "slack", "discord", "telegram-bot"]),
  config: z.record(z.string(), z.unknown()),
}, undefined);

export const updateChannelBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["email", "webhook", "dingtalk", "feishu", "wecom", "telegram", "slack", "discord", "telegram-bot"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export type CreateChannelInput = z.infer<typeof createChannelBody>;
export type UpdateChannelInput = z.infer<typeof updateChannelBody>;
