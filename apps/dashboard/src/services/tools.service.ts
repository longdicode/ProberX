import { getById } from "./server.service";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

async function resolveAgent(workspaceId: string, serverId: string, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");
  return { host, port };
}

async function throwAgentError(res: Response): Promise<never> {
  let msg = `Agent returned status ${res.status}`;
  try {
    const body = await res.json();
    if (body && typeof body === "object" && "error" in body) msg = (body as { error: string }).error;
  } catch {}
  throw AppError.badRequest(msg);
}

// --- systemd ---

export async function listServices(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/services`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function controlService(workspaceId: string, serverId: string, body: { name: string; action: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function serviceStatus(workspaceId: string, serverId: string, name: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/services/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

// --- SSL ---

export async function checkSSL(workspaceId: string, serverId: string, body: { domain: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/ssl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

// --- Logs ---

export async function fetchLogs(workspaceId: string, serverId: string, params: { unit?: string; lines?: number; since?: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const qs = new URLSearchParams();
  if (params.unit) qs.set("unit", params.unit);
  if (params.lines) qs.set("lines", String(params.lines));
  if (params.since) qs.set("since", params.since);
  const res = await fetch(`http://${host}:${port}/tools/logs?${qs}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function fetchLogFile(workspaceId: string, serverId: string, params: { path: string; lines?: number }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const qs = new URLSearchParams();
  qs.set("path", params.path);
  if (params.lines) qs.set("lines", String(params.lines));
  const res = await fetch(`http://${host}:${port}/tools/logs/file?${qs}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

// --- Packages ---

export async function listPackages(workspaceId: string, serverId: string, upgradableOnly: boolean, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/packages?upgradable=${upgradableOnly}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function upgradePackages(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/packages`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

// --- Nginx ---

export async function nginxStatus(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/nginx`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function nginxReload(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/nginx/reload`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function nginxConfig(workspaceId: string, serverId: string, path: string | undefined, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const qs = path ? `?path=${encodeURIComponent(path)}` : "";
  const res = await fetch(`http://${host}:${port}/tools/nginx/config${qs}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

// --- Deploy ---

export async function listDeployTemplates(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/templates`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function listDeployments(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/list`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function deployApp(workspaceId: string, serverId: string, body: { template_id: string; app_name: string; env: Record<string, string> }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function removeDeployment(workspaceId: string, serverId: string, body: { appName: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function getDeploymentLogs(workspaceId: string, serverId: string, appName: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/logs?appName=${encodeURIComponent(appName)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function startDeployment(workspaceId: string, serverId: string, body: { appName: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function stopDeployment(workspaceId: string, serverId: string, body: { appName: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function restartDeployment(workspaceId: string, serverId: string, body: { appName: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function updateDeployment(workspaceId: string, serverId: string, body: { appName: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json();
}

export async function getDeployProgress(workspaceId: string, serverId: string, appName: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/progress?appName=${encodeURIComponent(appName)}`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json() as Promise<{ logs: string }>;
}

export async function checkPorts(workspaceId: string, serverId: string, body: { ports: string[] }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/tools/deploy/check-ports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await throwAgentError(res);
  return res.json() as Promise<Record<string, boolean>>;
}
