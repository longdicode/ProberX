import type { CommandContext, Context } from "grammy";
import { validateApiKey } from "../services/api-client.js";
import { addSubscription } from "../services/subscription.js";

export async function handleStart(ctx: CommandContext<Context>) {
  const args = ctx.match?.trim();
  if (!args) {
    await ctx.reply(
      "👋 Welcome to <b>ProberX Bot</b>!\n\n" +
      "I can help you monitor your servers and receive alerts directly in Telegram.\n\n" +
      "<b>Getting started:</b>\n" +
      "1. Go to your ProberX Dashboard → Settings → API Keys\n" +
      "2. Create an API key (or copy an existing one)\n" +
      "3. Run: <code>/start YOUR_API_KEY</code>\n\n" +
      "<b>Commands:</b>\n" +
      "/status — Server overview\n" +
      "/servers — Server list\n" +
      "/alerts — Active alerts\n" +
      "/ack — Acknowledge an alert\n" +
      "/exec — Execute a command\n" +
      "/stop — Unlink workspace",
      { parse_mode: "HTML" },
    );
    return;
  }

  const apiKey = args;
  await ctx.reply("🔍 Validating your API key...");

  const result = await validateApiKey(apiKey);
  if (!result.valid || !result.workspaceId) {
    await ctx.reply("❌ Invalid API key. Please check and try again.");
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.reply("⚠️ Could not identify your chat.");
    return;
  }

  addSubscription(chatId, result.workspaceId, result.workspaceName ?? "My Workspace", apiKey);

  await ctx.reply(
    `✅ Linked to workspace <b>${result.workspaceName ?? "My Workspace"}</b>!\n\n` +
    "You will now receive alert notifications here.\n\n" +
    "Try /status to see your servers.",
    { parse_mode: "HTML" },
  );
}
