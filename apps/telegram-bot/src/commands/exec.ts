import type { CommandContext, Context } from "grammy";
import { requireAuth } from "../middleware/auth.js";
import { getServers, execOnServer } from "../services/api-client.js";

export async function handleExec(ctx: CommandContext<Context>) {
  const auth = await requireAuth(ctx);
  if (!auth) return;

  const args = ctx.match?.trim();
  if (!args) {
    await ctx.reply(
      "Usage: <code>/exec &lt;server_name_or_agent&gt; &lt;command&gt;</code>\n\n" +
      "Example:\n" +
      "<code>/exec agent-d9e4c957 uptime</code>\n" +
      "<code>/exec VM-0-14 docker ps</code>\n\n" +
      "Use /servers to see your available servers.",
      { parse_mode: "HTML" },
    );
    return;
  }

  const firstSpace = args.indexOf(" ");
  if (firstSpace === -1) {
    await ctx.reply("⚠️ Please provide both server and command. Example: <code>/exec my-server uptime</code>", { parse_mode: "HTML" });
    return;
  }

  const serverQuery = args.slice(0, firstSpace).trim();
  const command = args.slice(firstSpace + 1).trim();

  try {
    // Find the server by name or agentId
    const servers = await getServers(auth.apiKey, auth.workspaceId);
    const server = servers.find(
      (s) =>
        s.name.toLowerCase().includes(serverQuery.toLowerCase()) ||
        s.agentId.toLowerCase() === serverQuery.toLowerCase() ||
        s.id.startsWith(serverQuery),
    );

    if (!server) {
      await ctx.reply(`❌ Server "${serverQuery}" not found. Use /servers to see available servers.`);
      return;
    }

    await ctx.reply(`⏳ Executing on <b>${server.name}</b>:\n<code>${command}</code>`, { parse_mode: "HTML" });

    const result = await execOnServer(auth.apiKey, auth.workspaceId, server.id, command);
    const output = result.output
      ? result.output.slice(0, 3500) // Telegram message limit
      : "(no output)";

    await ctx.reply(
      `<b>${server.name}</b> → exit code: ${result.exitCode}\n\n<pre>${output}</pre>`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    await ctx.reply(`❌ Exec failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}
