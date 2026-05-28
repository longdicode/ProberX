import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { wsAuthenticator } from "./authenticator";
import { servers } from "../db/schema/servers";
import { eq, and } from "drizzle-orm";
import { uuidv7 } from "../utils/id";

export function registerTerminalRelay(app: FastifyInstance) {
  app.get("/terminal", { websocket: true }, async (socket: WebSocket, req) => {
    const auth = await wsAuthenticator(app, req);
    if (!auth) {
      socket.close(4001, JSON.stringify({ code: "UNAUTHORIZED", message: "Authentication failed" }));
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const serverId = url.searchParams.get("serverId");
    if (!serverId) {
      socket.close(4002, JSON.stringify({ code: "BAD_REQUEST", message: "Missing serverId" }));
      return;
    }

    const { workspaceId } = auth;

    const [server] = await app.db
      .select({ hostInfo: servers.hostInfo, agentSecret: servers.agentSecret })
      .from(servers)
      .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
      .limit(1);

    if (!server) {
      socket.close(4004, JSON.stringify({ code: "NOT_FOUND", message: "Server not found" }));
      return;
    }

    const hostInfo = server.hostInfo as Record<string, unknown> | null;
    const agentHost = hostInfo?.agent_host as string | undefined;
    const agentPort = (hostInfo?.agent_port as number) ?? 9800;

    if (!agentHost) {
      socket.close(4003, JSON.stringify({
        code: "NO_AGENT",
        message: "Server has no agent host configured",
      }));
      return;
    }

    const agentWs = new WebSocket(`ws://${agentHost}:${agentPort}/terminal?token=${encodeURIComponent(server.agentSecret)}`);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        if (agentWs.readyState === WebSocket.OPEN) agentWs.close(1000);
      } catch { /* ignore */ }
      try {
        if (socket.readyState === WebSocket.OPEN) socket.close(1000);
      } catch { /* ignore */ }
    };

    agentWs.on("open", () => {
      socket.send(JSON.stringify({
        id: uuidv7(),
        type: "terminal:ready",
        payload: { serverId },
        timestamp: Date.now(),
      }));
    });

    agentWs.on("message", (data: Buffer) => {
      if (!cleaned && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    agentWs.on("close", () => {
      if (!cleaned) {
        socket.send(JSON.stringify({
          id: uuidv7(),
          type: "terminal:closed",
          payload: { serverId },
          timestamp: Date.now(),
        }));
        cleanup();
      }
    });

    agentWs.on("error", () => {
      if (!cleaned) {
        socket.send(JSON.stringify({
          id: uuidv7(),
          type: "terminal:error",
          payload: { message: "Failed to connect to agent" },
          timestamp: Date.now(),
        }));
        cleanup();
      }
    });

    socket.on("message", (raw: Buffer) => {
      if (cleaned || agentWs.readyState !== WebSocket.OPEN) return;

      const str = raw.toString();
      if (str.startsWith("{")) {
        try {
          JSON.parse(str);
          agentWs.send(str);
          return;
        } catch { /* fall through to binary */ }
      }

      agentWs.send(raw);
    });

    socket.on("close", () => cleanup());
    socket.on("error", () => cleanup());
  });
}
