import type { CommandContext, Context } from "grammy";
import { requireAuth } from "../middleware/auth.js";
import { getServers, formatServerStatus } from "../services/api-client.js";

export async function handleStatus(ctx: CommandContext<Context>) {
  const auth = await requireAuth(ctx);
  if (!auth) return;

  await ctx.reply("⏳ Fetching server status...");

  try {
    const servers = await getServers(auth.apiKey, auth.workspaceId);
    if (servers.length === 0) {
      await ctx.reply("No servers found in your workspace.");
      return;
    }

    const online = servers.filter((s) => s.isOnline).length;
    const lines = [
      `<b>🏠 ${auth.workspaceName}</b>`,
      `Online: ${online}/${servers.length}`,
      "",
      ...servers.map(formatServerStatus),
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(`❌ Failed to fetch server status: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}
