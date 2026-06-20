import "dotenv/config";
import http from "http";
import { createBot } from "./bot.js";
import { getSubscriptionsByWorkspace } from "./services/subscription.js";

// Configure undici global dispatcher for fetch-based proxy (Grammy uses fetch)
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent({ uri: proxyUrl }));
    console.log(`[proxy] fetch proxy enabled: ${proxyUrl}`);
  } catch (err) {
    console.warn(`[proxy] undici ProxyAgent failed, trying global-agent fallback:`, err);
    try {
      const { bootstrap } = await import("global-agent");
      bootstrap();
      console.log(`[proxy] global-agent fallback enabled`);
    } catch {
      console.warn(`[proxy] No proxy configured — Telegram API may be unreachable`);
    }
  }
}

const BOT_PORT = parseInt(process.env.BOT_PORT ?? "3101", 10);

async function main() {
  // Start the Telegram bot (long polling)
  const bot = createBot();
  bot.start({
    onStart: () => {
      console.log(`🤖 Telegram Bot started (long polling)`);
    },
  });

  // HTTP server for receiving notification alerts from Dashboard
  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "/";

    // Health check
    if (url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    // Notification webhook from Dashboard
    if (url === "/notify" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body) as {
            workspaceId?: string;
            eventId?: string;
            ruleName: string;
            severity: string;
            message: string;
            metricValue?: string;
          };

          // Look up all chat subscriptions for this workspace
          const subs = payload.workspaceId
            ? getSubscriptionsByWorkspace(payload.workspaceId)
            : [];

          if (subs.length === 0) {
            console.log(`[notify] No subscriptions for workspace ${payload.workspaceId ?? "?"}`);
            res.writeHead(200);
            res.end(JSON.stringify({ sent: 0 }));
            return;
          }

          const severityEmoji: Record<string, string> = {
            warning: "🟡", critical: "🟠", emergency: "🔴",
          };
          const emoji = severityEmoji[payload.severity] ?? "⚪";

          const text = [
            `${emoji} <b>[${payload.severity.toUpperCase()}] ${payload.ruleName}</b>`,
            payload.message,
            payload.metricValue ? `Value: <code>${payload.metricValue}</code>` : "",
            `<i>Sent by ProberX</i> — Use /alerts to manage`,
          ].filter(Boolean).join("\n\n");

          let sent = 0;
          for (const sub of subs) {
            try {
              await bot.api.sendMessage(Number(sub.chat_id), text, {
                parse_mode: "HTML",
              });
              sent++;
            } catch (err) {
              console.error(`[notify] Failed to send to chat ${sub.chat_id}:`, err);
            }
          }

          console.log(`[notify] Sent alert to ${sent}/${subs.length} chats`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sent }));
        } catch (err) {
          console.error("[notify] Parse error:", err);
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid payload" }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(BOT_PORT, () => {
    console.log(`🌐 Notification server listening on port ${BOT_PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    await bot.stop();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
