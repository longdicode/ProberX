"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useWorkspaceStore } from "@/stores/workspace-store";

// --- Types ---

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Server {
  id: string;
  name: string;
  agentId: string | null;
  tags: string[];
  hostInfo: Record<string, unknown>;
  lastSeenAt: string | null;
  isOnline: boolean;
  isHidden: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalServers: number;
  activeMonitors: number;
  alertsTotal: number;
  avgCpu: number;
  recentActivity: {
    type: string;
    serverName: string;
    isOnline: boolean;
    timestamp: string;
  }[];
}

// --- Hooks ---

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.get<Workspace[]>("/workspaces"),
    staleTime: 30_000,
  });
}

export function useServers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["servers", workspaceId],
    queryFn: () => api.get<Server[]>(`/workspaces/${workspaceId}/servers`),
    enabled: !!workspaceId,
    refetchInterval: 10_000,
  });
}

export function useDashboard(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", workspaceId],
    queryFn: () => api.get<DashboardStats>(`/workspaces/${workspaceId}/dashboard`),
    enabled: !!workspaceId,
    refetchInterval: 15_000,
  });
}

export function useCurrentWorkspace() {
  const { current } = useWorkspaceStore();
  return current;
}

// --- Monitor types & hooks ---

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
  createdAt: string;
}

export interface ProbeResult {
  time: string;
  taskId: string;
  isSuccess: boolean;
  responseMs: number | null;
  statusCode: number | null;
  errorMsg: string | null;
  detail: Record<string, unknown>;
}
export function useMonitors(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["monitors", workspaceId],
    queryFn: () => api.get<MonitorTask[]>(`/workspaces/${workspaceId}/monitors`),
    enabled: !!workspaceId,
  });
}

export function useProbeResults(workspaceId: string | undefined, monitorId: string | undefined) {
  return useQuery({
    queryKey: ["probe-results", workspaceId, monitorId],
    queryFn: () => api.get<ProbeResult[]>(`/workspaces/${workspaceId}/monitors/${monitorId}/results`, { params: { limit: 20 } }),
    enabled: !!workspaceId && !!monitorId,
  });
}

// --- Alert types & hooks ---

export interface AlertRule {
  id: string;
  workspaceId: string;
  name: string;
  targetType: string;
  targetId: string | null;
  metric: string;
  operator: string;
  threshold: string;
  durationSec: number;
  severity: string;
  isEnabled: boolean;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName?: string;
  serverId: string | null;
  taskId: string | null;
  severity: string;
  message: string;
  metricValue: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export function useAlertRules(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["alert-rules", workspaceId],
    queryFn: () => api.get<AlertRule[]>(`/workspaces/${workspaceId}/alerts`),
    enabled: !!workspaceId,
  });
}

export function useAlertEvents(workspaceId: string | undefined, ruleId?: string) {
  return useQuery({
    queryKey: ["alert-events", workspaceId, ruleId],
    queryFn: () => {
      if (ruleId) return api.get<AlertEvent[]>(`/workspaces/${workspaceId}/alerts/${ruleId}/events`);
      return api.get<AlertEvent[]>(`/workspaces/${workspaceId}/alert-events`);
    },
    enabled: !!workspaceId,
  });
}

// --- Server metrics ---

export interface MetricSnapshot {
  time: string;
  cpuPercent: string | null;
  memTotal: number | null;
  memUsed: number | null;
  diskTotal: number | null;
  diskUsed: number | null;
  netInBytes: number | null;
  netOutBytes: number | null;
  load1: string | null;
  load5: string | null;
  load15: string | null;
}

export function useServerMetrics(workspaceId: string | undefined, serverId: string | undefined) {
  return useQuery({
    queryKey: ["server-metrics", workspaceId, serverId],
    queryFn: () => api.get<MetricSnapshot[]>(`/workspaces/${workspaceId}/servers/${serverId}/metrics`, { params: { limit: 30 } }),
    enabled: !!workspaceId && !!serverId,
  });
}

// --- Cron jobs ---

export interface CronJob {
  id: string;
  workspaceId: string;
  name: string;
  cronExpr: string;
  command: string;
  targetServers: string[];
  isEnabled: boolean;
  createdAt: string;
}

export function useCronJobs(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["cronjobs", workspaceId],
    queryFn: () => api.get<CronJob[]>(`/workspaces/${workspaceId}/cronjobs`),
    enabled: !!workspaceId,
  });
}

// --- API Keys ---

export interface ApiKey {
  id: string;
  name: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function useApiKeys(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["api-keys", workspaceId],
    queryFn: () => api.get<ApiKey[]>(`/workspaces/${workspaceId}/api-keys`),
    enabled: !!workspaceId,
  });
}

// --- Cron Executions ---

export interface CronExecution {
  id: string;
  jobId: string;
  serverId: string;
  status: string;
  output?: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function useCronExecutions(workspaceId: string | undefined, jobId?: string) {
  return useQuery({
    queryKey: ["cron-executions", workspaceId, jobId],
    queryFn: () => {
      if (jobId) return api.get<CronExecution[]>(`/workspaces/${workspaceId}/cronjobs/${jobId}/executions`);
      return api.get<CronExecution[]>(`/workspaces/${workspaceId}/cron-executions`);
    },
    enabled: !!workspaceId,
  });
}

// --- Notification Channels ---

export interface NotificationChannel {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
}

export function useNotificationChannels(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["notification-channels", workspaceId],
    queryFn: () => api.get<NotificationChannel[]>(`/workspaces/${workspaceId}/notifications`),
    enabled: !!workspaceId,
  });
}

// --- Members ---

export interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
}

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => api.get<Member[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });
}
