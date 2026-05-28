export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  oauthProvider: string | null;
  oauthId: string | null;
  createdAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Membership {
  id: string;
  workspaceId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  joinedAt: Date;
}

export interface Server {
  id: string;
  workspaceId: string;
  name: string;
  agentId: string | null;
  tags: string[];
  hostInfo: Record<string, unknown>;
  lastSeenAt: Date | null;
  isOnline: boolean;
  isHidden: boolean;
  createdAt: Date;
}

export interface MetricSnapshot {
  time: Date;
  serverId: string;
  cpuPercent: number | null;
  memTotal: number | null;
  memUsed: number | null;
  diskTotal: number | null;
  diskUsed: number | null;
  netInBytes: number | null;
  netOutBytes: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  extra: Record<string, unknown>;
}

export interface MonitorTask {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  target: string;
  intervalSec: number;
  timeoutMs: number;
  settings: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: Date;
}

export interface AlertRule {
  id: string;
  workspaceId: string;
  name: string;
  targetType: string;
  targetId: string | null;
  metric: string;
  operator: string;
  threshold: number;
  durationSec: number;
  severity: string;
  isEnabled: boolean;
  createdAt: Date;
}

export interface NotificationChannel {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: Date;
}

export interface CronJob {
  id: string;
  workspaceId: string;
  name: string;
  cronExpr: string;
  command: string;
  targetServers: string[];
  isEnabled: boolean;
  lastRunAt: Date | null;
  createdAt: Date;
}

export interface StatusPage {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  theme: Record<string, unknown>;
  isPublished: boolean;
  createdAt: Date;
}
