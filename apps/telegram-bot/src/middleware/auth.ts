import type { Context } from "grammy";
import { getSubscription } from "../services/subscription.js";

export interface AuthContext {
  chatId: number;
  workspaceId: string;
  workspaceName: string;
  apiKey: string;
}

export async function requireAuth(ctx: Context): Promise<AuthContext | null> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.reply("⚠️ This command can only be used in a chat.");
    return null;
  }

  const sub = getSubscription(chatId);
  if (!sub) {
    await ctx.reply(
      "⚠️ You haven't linked your ProberX workspace yet.\n\n" +
      "Use /start <api_key> to get started.\n\n" +
      "You can get an API key from your ProberX Settings page.",
    );
    return null;
  }

  return {
    chatId,
    workspaceId: sub.workspace_id,
    workspaceName: sub.workspace_name,
    apiKey: sub.api_key,
  };
}
