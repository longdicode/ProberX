import { uuidv7 } from "../utils/id";
import { connectionManager } from "./connection-manager";
import type {
  MetricsUpdatePayload,
  ProbeResultPayload,
  AlertEventPayload,
  ServerStatusPayload,
} from "../types/ws";

function send(workspaceId: string, type: string, payload: unknown) {
  const msg = {
    id: uuidv7(),
    type,
    payload,
    timestamp: Date.now(),
  };
  connectionManager.broadcastToWorkspace(workspaceId, JSON.stringify(msg));
}

export function broadcastMetrics(workspaceId: string, payload: MetricsUpdatePayload) {
  send(workspaceId, "metrics:update", payload);
}

export function broadcastProbeResult(workspaceId: string, payload: ProbeResultPayload) {
  send(workspaceId, "probe:result", payload);
}

export function broadcastAlertEvent(workspaceId: string, payload: AlertEventPayload) {
  send(workspaceId, "alert:event", payload);
}

export function broadcastServerStatus(workspaceId: string, payload: ServerStatusPayload) {
  send(workspaceId, "server:status", payload);
}
