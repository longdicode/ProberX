const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3001/api/v1";

interface ServerInfo {
  id: string;
  name: string;
  agentId: string;
  isOnline: boolean;
  lastSeenAt: string;
  latestCpuPercent: string;
  latestMemTotal: number;
  latestMemUsed: number;
  hostInfo?: Record<string, unknown>;
}

interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName?: string;
  serverId: string | null;
  severity: string;
  message: string;
  metricValue: string | null;
  isResolved: boolean;
  createdAt: string;
}

interface ExecResult {
  output: string;
  exitCode: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; workspaceId?: string; workspaceName?: string }> {
  try {
    // Try to list workspaces with the key — if it works, key is valid
    const res = await fetch(`${DASHBOARD_URL}/workspaces`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { valid: false };

    const workspaces = await res.json() as Array<{ id: string; name: string }>;
    if (!Array.isArray(workspaces) || workspaces.length === 0) return { valid: false };

    return { valid: true, workspaceId: workspaces[0].id, workspaceName: workspaces[0].name };
  } catch {
    return { valid: false };
  }
}

export async function getServers(apiKey: string, workspaceId: string): Promise<ServerInfo[]> {
  const res = await fetch(`${DASHBOARD_URL}/workspaces/${workspaceId}/servers`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Failed to fetch servers: ${res.status}`);
  return res.json() as Promise<ServerInfo[]>;
}

export async function getServerDetail(apiKey: string, workspaceId: string, serverId: string): Promise<ServerInfo> {
  const res = await fetch(`${DASHBOARD_URL}/workspaces/${workspaceId}/servers/${serverId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Failed to fetch server: ${res.status}`);
  return res.json() as Promise<ServerInfo>;
}

export async function getAlerts(apiKey: string, workspaceId: string): Promise<AlertEvent[]> {
  const res = await fetch(`${DASHBOARD_URL}/workspaces/${workspaceId}/alert-events`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Failed to fetch alerts: ${res.status}`);
  return res.json() as Promise<AlertEvent[]>;
}

export async function resolveAlert(apiKey: string, workspaceId: string, eventId: string, ruleId: string): Promise<void> {
  const res = await fetch(`${DASHBOARD_URL}/workspaces/${workspaceId}/alerts/${ruleId}/events/${eventId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ isResolved: true }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Failed to resolve alert: ${res.status}`);
}

export async function execOnServer(apiKey: string, workspaceId: string, serverId: string, command: string): Promise<ExecResult> {
  const res = await fetch(`${DASHBOARD_URL}/workspaces/${workspaceId}/servers/${serverId}/exec`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ command }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Exec failed: ${res.status}`);
  return res.json() as Promise<ExecResult>;
}

export function formatServerStatus(server: ServerInfo): string {
  const online = server.isOnline ? "🟢" : "🔴";
  const cpu = server.latestCpuPercent ? `${parseFloat(server.latestCpuPercent).toFixed(1)}%` : "?";
  const mem = server.latestMemTotal
    ? `${formatBytes(server.latestMemUsed || 0)} / ${formatBytes(server.latestMemTotal)}`
    : "?";
  return `${online} <b>${server.name}</b>\n   CPU: ${cpu} | Mem: ${mem}`;
}
