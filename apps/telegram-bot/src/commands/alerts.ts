import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { requireAuth } from "../middleware/auth.js";
import { getAlerts } from "../services/api-client.js";

export async function handleAlerts(ctx: CommandContext<Context>) {
  const auth = await requireAuth(ctx);
  if (!auth) return;

  await ctx.reply("⏳ Fetching alerts...");

  try {
    const alerts = await getAlerts(auth.apiKey, auth.workspaceId);
    const unresolved = alerts.filter((a) => !a.isResolved);

    if (unresolved.length === 0) {
      await ctx.reply("✅ No active alerts. Everything is running smoothly!");
      return;
    }

    const severityIcon: Record<string, string> = {
      warning: "🟡", critical: "🟠", emergency: "🔴",
    };

    // Show first 5 alerts
    const toShow = unresolved.slice(0, 5);
    for (const a of toShow) {
      const icon = severityIcon[a.severity] ?? "⚪";
      const keyboard = new InlineKeyboard()
        .text("✅ Acknowledge", `ack:${a.id}:${a.ruleId}`)
        .text("✅ Resolve", `resolve:${a.id}:${a.ruleId}`);

      const text = [
        `${icon} <b>[${a.severity.toUpperCase()}]</b> ${a.ruleName ?? "Unknown"}`,
        `${a.message}`,
        a.metricValue ? `Value: ${a.metricValue}` : "",
        `🕐 ${new Date(a.createdAt).toLocaleString()}`,
      ].filter(Boolean).join("\n");

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    }

    if (unresolved.length > 5) {
      await ctx.reply(`... and ${unresolved.length - 5} more active alerts.`);
    }
  } catch (err) {
    await ctx.reply(`❌ Failed to fetch alerts: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}
