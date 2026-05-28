export interface WsMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

// Frontend → Backend
export type ClientMessageType =
  | "subscribe"
  | "unsubscribe"
  | "ping";

// Backend → Frontend
export type ServerMessageType =
  | "metrics:update"
  | "probe:result"
  | "alert:event"
  | "server:status"
  | "terminal:ready"
  | "terminal:error"
  | "terminal:closed"
  | "pong"
  | "error"
  | "subscribed"
  | "unsubscribed";

export interface MetricsUpdatePayload {
  serverId: string;
  serverName: string;
  cpuPercent: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
  load1: number;
  load5: number;
  load15: number;
  gpuName: string;
  gpuUtilPercent: number;
  gpuMemUsed: number;
  gpuMemTotal: number;
  gpuTemp: number;
}

export interface ProbeResultPayload {
  taskId: string;
  taskName: string;
  isSuccess: boolean;
  responseMs: number;
  statusCode?: number;
  errorMsg?: string;
}

export interface AlertEventPayload {
  eventId: string;
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  metricValue?: number;
}

export interface ServerStatusPayload {
  serverId: string;
  serverName: string;
  online: boolean;
}
