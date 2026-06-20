"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  latestCpuPercent?: string | null;
  latestMemUsed?: number | null;
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

export function useAlertTrends(workspaceId: string | undefined, range: string = "7d") {
  return useQuery({
    queryKey: ["alert-trends", workspaceId, range],
    queryFn: () => api.get<{ period: string; count: number; critical: number; warning: number; resolved: number }[]>(`/workspaces/${workspaceId}/alert-trends?range=${range}`),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });
}

export function useServerComparison(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["server-comparison", workspaceId],
    queryFn: () => api.get<{ name: string; cpu: number; memory: number; disk: number }[]>(`/workspaces/${workspaceId}/server-comparison`),
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
  gpuName: string | null;
  gpuUtilPercent: string | null;
  gpuMemTotal: number | null;
  gpuMemUsed: number | null;
  gpuTemp: string | null;
}

export function useServerMetrics(workspaceId: string | undefined, serverId: string | undefined, range?: string) {
  const params: Record<string, string | number> = { limit: 500 };
  if (range) {
    const now = new Date();
    const from = new Date(now.getTime() - parseRangeMs(range));
    params.from = from.toISOString();
    params.to = now.toISOString();
  }
  return useQuery({
    queryKey: ["server-metrics", workspaceId, serverId, range],
    queryFn: () => api.get<MetricSnapshot[]>(`/workspaces/${workspaceId}/servers/${serverId}/metrics`, { params }),
    enabled: !!workspaceId && !!serverId,
  });
}

function parseRangeMs(range: string): number {
  switch (range) {
    case "1h": return 3600000;
    case "6h": return 21600000;
    case "24h": return 86400000;
    case "7d": return 604800000;
    default: return 3600000;
  }
}

// --- App Store ---

export interface AppStoreEntry {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  category: string;
  icon: string;
  composeYaml: string;
  defaultEnv: Record<string, string>;
  memoryLimit: string | null;
  cpuLimit: string | null;
  logoUrl: string | null;
  version: string | null;
  author: string | null;
  homepage: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useAppStore(workspaceId: string | undefined, opts?: { category?: string; search?: string }) {
  const params: Record<string, string> = {};
  if (opts?.category && opts.category !== "all") params.category = opts.category;
  if (opts?.search) params.search = opts.search;
  return useQuery({
    queryKey: ["app-store", workspaceId, opts?.category, opts?.search],
    queryFn: () => api.get<AppStoreEntry[]>(`/workspaces/${workspaceId}/app-store`, { params }),
    enabled: !!workspaceId,
    staleTime: 60_000,
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

export function usePreviewCron(workspaceId: string | undefined, cronExpr: string) {
  return useQuery({
    queryKey: ["cron-preview", workspaceId, cronExpr],
    queryFn: () =>
      api.post<{ nextRuns: string[]; humanReadable: string }>(
        `/workspaces/${workspaceId}/cronjobs/preview`,
        { cronExpr, count: 5 }
      ),
    enabled: !!workspaceId && cronExpr.length > 0,
    retry: false,
    staleTime: 30_000,
  });
}

export function useUpdateCronJob(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/workspaces/${workspaceId}/cronjobs/${id}`, data, { noToast: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cronjobs", workspaceId] });
    },
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
