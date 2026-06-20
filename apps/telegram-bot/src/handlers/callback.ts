import type { Context } from "grammy";
import { requireAuth } from "../middleware/auth.js";
import { resolveAlert } from "../services/api-client.js";

export async function handleCallback(ctx: Context) {
  const cb = ctx.callbackQuery;
  if (!cb?.data) return;

  const data = cb.data as string;

  // Parse "ack:<eventId>:<ruleId>" or "resolve:<eventId>:<ruleId>"
  const match = data.match(/^(ack|resolve):(.+):(.+)$/);
  if (!match) {
    await ctx.answerCallbackQuery({ text: "Unknown action." });
    return;
  }

  const [, action, eventId, ruleId] = match;

  const auth = await requireAuth(ctx);
  if (!auth) {
    await ctx.answerCallbackQuery({ text: "You need to link a workspace first. Use /start <api_key>" });
    return;
  }

  try {
    await resolveAlert(auth.apiKey, auth.workspaceId, eventId, ruleId);
    await ctx.answerCallbackQuery({ text: `Alert ${action === "ack" ? "acknowledged" : "resolved"}! ✅` });
    await ctx.editMessageReplyMarkup(undefined); // remove buttons
  } catch (err) {
    await ctx.answerCallbackQuery({ text: `Failed: ${err instanceof Error ? err.message : "Unknown error"}` });
  }
}
