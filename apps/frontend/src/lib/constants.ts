export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";

export const PLAN_LIMITS = {
  free: {
    maxServers: 10,
    maxMonitors: 20,
    maxAlertRules: 5,
    maxMembers: 2,
    dataRetentionDays: 7,
    hasApiAccess: false,
    hasStatusPage: false,
  },
  pro: {
    maxServers: 100,
    maxMonitors: 500,
    maxAlertRules: 50,
    maxMembers: 20,
    dataRetentionDays: 90,
    hasApiAccess: true,
    hasStatusPage: true,
    hasWebSSH: true,
  },
  enterprise: {
    maxServers: Infinity,
    maxMonitors: Infinity,
    maxAlertRules: Infinity,
    maxMembers: Infinity,
    dataRetentionDays: 365,
    hasApiAccess: true,
    hasStatusPage: true,
    hasWebSSH: true,
  },
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;

export const MONITOR_TYPES = [
  { value: "http", label: "HTTP(S)", icon: "Globe" },
  { value: "tcp", label: "TCP Port", icon: "Cable" },
  { value: "ping", label: "ICMP Ping", icon: "Activity" },
  { value: "dns", label: "DNS", icon: "Network" },
  { value: "ssl", label: "SSL Certificate", icon: "Shield" },
  { value: "grpc", label: "gRPC", icon: "Zap" },
] as const;

export const SEVERITY_COLORS = {
  warning: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30" },
  critical: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
  emergency: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
} as const;

export const NOTIFICATION_TYPES = [
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhook" },
  { value: "dingtalk", label: "DingTalk" },
  { value: "feishu", label: "Feishu" },
  { value: "wecom", label: "WeCom" },
  { value: "telegram", label: "Telegram" },
  { value: "slack", label: "Slack" },
] as const;

export const POLLING_INTERVALS = {
  metrics: 2000,
  serverList: 5000,
  monitorList: 10000,
} as const;
