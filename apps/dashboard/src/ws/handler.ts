import { uuidv7 } from "../utils/id";
import { connectionManager } from "./connection-manager";
import type { WsMessage } from "../types/ws";

interface HandlerContext {
  userId: string;
  workspaceId: string;
}

const VALID_CHANNELS = new Set([
  "metrics:update",
  "probe:result",
  "alert:event",
  "server:status",
]);

export function createHandler(ctx: HandlerContext) {
  return function handleMessage(raw: WsMessage) {
    switch (raw.type) {
      case "ping": {
        connectionManager.sendToUser(ctx.userId, JSON.stringify({
          id: uuidv7(),
          type: "pong",
          payload: { serverTime: Date.now() },
          timestamp: Date.now(),
        }));
        break;
      }
      case "subscribe": {
        const channels = (raw.payload as { channels?: string[] })?.channels ?? [];
        const valid = channels.filter((ch) => VALID_CHANNELS.has(ch));
        if (valid.length > 0) {
          connectionManager.subscribe(ctx.userId, valid);
        }
        connectionManager.sendToUser(ctx.userId, JSON.stringify({
          id: uuidv7(),
          type: "subscribed",
          payload: { channels: valid },
          timestamp: Date.now(),
        }));
        break;
      }
      case "unsubscribe": {
        const channels = (raw.payload as { channels?: string[] })?.channels ?? [];
        if (channels.length > 0) {
          connectionManager.unsubscribe(ctx.userId, channels);
        }
        connectionManager.sendToUser(ctx.userId, JSON.stringify({
          id: uuidv7(),
          type: "unsubscribed",
          payload: { channels },
          timestamp: Date.now(),
        }));
        break;
      }
      default: {
        // Unknown message type — ignore
      }
    }
  };
}
