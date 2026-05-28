import type { FastifyPluginAsync } from "fastify";
import websocket from "@fastify/websocket";
import { wsAuthenticator } from "./authenticator";
import { connectionManager } from "./connection-manager";
import { createHandler } from "./handler";
import { registerTerminalRelay } from "./terminal-relay";
import { uuidv7 } from "../utils/id";
import { WebSocket } from "ws";

export const wsPlugin: FastifyPluginAsync = async (app) => {
  await app.register(websocket, { options: { maxPayload: 1048576 } });

  app.get("/", { websocket: true }, async (socket: WebSocket, req) => {
    const auth = await wsAuthenticator(app, req);
    if (!auth) {
      socket.close(4001, JSON.stringify({ code: "UNAUTHORIZED", message: "Authentication failed" }));
      return;
    }

    const { userId, workspaceId } = auth;
    connectionManager.add(userId, socket, workspaceId);
    const handler = createHandler({ userId, workspaceId });

    socket.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        handler(msg);
      } catch {
        socket.send(JSON.stringify({ type: "error", payload: { message: "Invalid message format" }, timestamp: Date.now() }));
      }
    });

    socket.on("close", () => {
      connectionManager.remove(userId);
    });

    socket.on("error", () => {
      connectionManager.remove(userId);
    });

    socket.send(JSON.stringify({
      id: uuidv7(),
      type: "connected",
      payload: { workspaceId, clientCount: connectionManager.getWorkspaceClientCount(workspaceId) },
      timestamp: Date.now(),
    }));
  });

  registerTerminalRelay(app);
};
