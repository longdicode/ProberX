import { Bot, type Context } from "grammy";
import { handleStart } from "./commands/start.js";
import { handleStatus } from "./commands/status.js";
import { handleServers } from "./commands/servers.js";
import { handleAlerts } from "./commands/alerts.js";
import { handleAck } from "./commands/ack.js";
import { handleExec } from "./commands/exec.js";
import { handleCallback } from "./handlers/callback.js";

const BOT_TOKEN = process.env.BOT_TOKEN;

export function createBot(): Bot {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN environment variable is required");
  }

  const bot = new Bot(BOT_TOKEN);

  // Command handlers
  bot.command("start", handleStart);
  bot.command("status", handleStatus);
  bot.command("servers", handleServers);
  bot.command("alerts", handleAlerts);
  bot.command("ack", handleAck);
  bot.command("exec", handleExec);

  // /stop — unlink workspace
  bot.command("stop", async (ctx: Context) => {
    const { removeSubscription, getSubscription } = await import("./services/subscription.js");
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const sub = getSubscription(chatId);
    if (!sub) {
      await ctx.reply("No workspace was linked to this chat.");
      return;
    }
    removeSubscription(chatId);
    await ctx.reply("👋 Workspace unlinked. You will no longer receive alerts here.\nUse /start <api_key> to link again.");
  });

  // Callback query handler (inline buttons)
  bot.on("callback_query", handleCallback);

  // Catch-all for non-command messages
  bot.on("message", async (ctx: Context) => {
    const text = ctx.message?.text;
    if (text && text.startsWith("/")) {
      await ctx.reply("Unknown command. Try /start for a list of available commands.");
    }
  });

  return bot;
}
