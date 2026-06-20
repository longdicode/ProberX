import type { CommandContext, Context } from "grammy";
import { requireAuth } from "../middleware/auth.js";
import { getServers } from "../services/api-client.js";

export async function handleServers(ctx: CommandContext<Context>) {
  const auth = await requireAuth(ctx);
  if (!auth) return;

  await ctx.reply("⏳ Fetching servers...");

  try {
    const servers = await getServers(auth.apiKey, auth.workspaceId);
    if (servers.length === 0) {
      await ctx.reply("No servers found in your workspace.");
      return;
    }

    const lines = [`<b>🖥️ Servers — ${auth.workspaceName}</b>`, ""];
    for (const s of servers) {
      const icon = s.isOnline ? "🟢" : "🔴";
      const cpu = s.latestCpuPercent ? `${parseFloat(s.latestCpuPercent).toFixed(1)}% CPU` : "";
      const lastSeen = s.lastSeenAt
        ? `Last seen: ${new Date(s.lastSeenAt).toLocaleString()}`
        : "Never seen";

      lines.push(`${icon} <b>${s.name}</b>`);
      lines.push(`   Agent: ${s.agentId} | ${cpu}`);
      lines.push(`   ${lastSeen}`);
      lines.push("");
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply(`❌ Failed to fetch servers: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}
