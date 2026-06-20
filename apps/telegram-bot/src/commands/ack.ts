import type { CommandContext, Context } from "grammy";
import { requireAuth } from "../middleware/auth.js";
import { resolveAlert } from "../services/api-client.js";

export async function handleAck(ctx: CommandContext<Context>) {
  const auth = await requireAuth(ctx);
  if (!auth) return;

  const args = ctx.match?.trim();
  if (!args) {
    await ctx.reply(
      "Usage: <code>/ack &lt;event_id&gt; &lt;rule_id&gt;</code>\n\n" +
      "You can find event IDs by running /alerts.\n" +
      "Or use the buttons below alert messages.",
      { parse_mode: "HTML" },
    );
    return;
  }

  const [eventId, ruleId] = args.split(/\s+/);
  if (!eventId || !ruleId) {
    await ctx.reply("⚠️ Usage: <code>/ack &lt;event_id&gt; &lt;rule_id&gt;</code>", { parse_mode: "HTML" });
    return;
  }

  try {
    await resolveAlert(auth.apiKey, auth.workspaceId, eventId, ruleId);
    await ctx.reply(`✅ Alert <code>${eventId}</code> has been resolved.`, { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(`❌ Failed to resolve alert: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}
