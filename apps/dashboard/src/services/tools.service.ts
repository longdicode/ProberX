import { getById } from "./server.service";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

// ── Agent resolution ──────────────────────────────────────────────

async function resolveAgent(workspaceId: string, serverId: string, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");
  return { host, port, agentSecret: server.agentSecret as string | undefined };
}

async function throwAgentError(res: Response): Promise<never> {
  let msg = `Agent returned status ${res.status}`;
  try {
    const body = await res.json();
    if (body && typeof body === "object" && "error" in body) msg = (body as { error: string }).error;
  } catch {}
  throw AppError.badRequest(msg);
}

// ── Core agent fetch helper ───────────────────────────────────────

type AgentFetchOpts = {
  method?: string;
  body?: unknown;
  timeout?: number;
  params?: Record<string, string>;
};

async function agentFetch<T = any>(
  workspaceId: string, serverId: string, path: string,
  opts: AgentFetchOpts, db: DbClient
): Promise<T> {
  const { host, port, agentSecret } = await resolveAgent(workspaceId, serverId, db);
  const qs = opts.params && Object.keys(opts.params).length
    ? "?" + new URLSearchParams(opts.params).toString()
    : "";
  const headers: Record<string, string> = {};
  if (opts.body) headers["Content-Type"] = "application/json";
  if (agentSecret) headers["Authorization"] = `Bearer ${agentSecret}`;
  const agentUrl = `http://${host}:${port}${path}${qs}`;
  if (agentSecret) console.log(`[tools] calling ${agentUrl} with token (len=${agentSecret.length})`);
  const res = await fetch(agentUrl, {
    method: opts.method ?? "GET",
    headers: Object.keys(headers).length ? headers : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeout ?? 10_000),
  });
  if (!res.ok) {
    console.log(`[tools] FAIL: ${agentUrl} status=${res.status} token=${agentSecret ? agentSecret.slice(0,8)+'...' : 'NONE'}`);
    throw await throwAgentError(res);
  }
  return res.json() as T;
}

// ── Convenience aliases ───────────────────────────────────────────

const GET = <T>(wid: string, sid: string, path: string, opts: Omit<AgentFetchOpts, "method"> = {}, db: DbClient) =>
  agentFetch<T>(wid, sid, path, { ...opts, method: "GET" }, db);

const POST = <T>(wid: string, sid: string, path: string, opts: Omit<AgentFetchOpts, "method"> = {}, db: DbClient) =>
  agentFetch<T>(wid, sid, path, { ...opts, method: "POST" }, db);

const DELETE = <T>(wid: string, sid: string, path: string, opts: Omit<AgentFetchOpts, "method"> = {}, db: DbClient) =>
  agentFetch<T>(wid, sid, path, { ...opts, method: "DELETE" }, db);

const PUT = <T>(wid: string, sid: string, path: string, opts: Omit<AgentFetchOpts, "method"> = {}, db: DbClient) =>
  agentFetch<T>(wid, sid, path, { ...opts, method: "PUT" }, db);

// ── systemd ───────────────────────────────────────────────────────

export const listServices = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/services", {}, db);

export const controlService = (wid: string, sid: string, body: { name: string; action: string }, db: DbClient) =>
  POST(wid, sid, "/tools/services", { body }, db);

export const serviceStatus = (wid: string, sid: string, name: string, db: DbClient) =>
  GET(wid, sid, `/tools/services/${encodeURIComponent(name)}`, {}, db);

// ── SSL ───────────────────────────────────────────────────────────

export const checkSSL = (wid: string, sid: string, body: { domain: string }, db: DbClient) =>
  POST(wid, sid, "/tools/ssl", { body, timeout: 15_000 }, db);

export const issueSSL = (wid: string, sid: string, body: { domain: string; email: string; webroot?: string }, db: DbClient) =>
  POST(wid, sid, "/tools/ssl/issue", { body, timeout: 120_000 }, db);

export const renewSSL = (wid: string, sid: string, body: { domain: string }, db: DbClient) =>
  POST(wid, sid, "/tools/ssl/renew", { body, timeout: 120_000 }, db);

// ── Logs ──────────────────────────────────────────────────────────

export const fetchLogs = (wid: string, sid: string, params: { unit?: string; lines?: number; since?: string }, db: DbClient) =>
  GET(wid, sid, "/tools/logs", { params: params as unknown as Record<string, string> }, db);

export const fetchLogFile = (wid: string, sid: string, params: { path: string; lines?: number }, db: DbClient) =>
  GET(wid, sid, "/tools/logs/file", { params: params as unknown as Record<string, string> }, db);

// ── Packages ──────────────────────────────────────────────────────

export const listPackages = (wid: string, sid: string, upgradableOnly: boolean, db: DbClient) =>
  GET(wid, sid, "/tools/packages", { params: { upgradable: String(upgradableOnly) }, timeout: 15_000 }, db);

export const upgradePackages = (wid: string, sid: string, db: DbClient) =>
  POST(wid, sid, "/tools/packages", { timeout: 120_000 }, db);

// ── Nginx ─────────────────────────────────────────────────────────

export const nginxStatus = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/nginx", {}, db);

export const nginxReload = (wid: string, sid: string, db: DbClient) =>
  POST(wid, sid, "/tools/nginx/reload", {}, db);

export const nginxConfig = (wid: string, sid: string, path: string | undefined, db: DbClient) =>
  GET(wid, sid, "/tools/nginx/config", { params: path ? { path } : {} }, db);

export const listVHosts = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/nginx/vhosts", {}, db);

export const createVHost = (wid: string, sid: string, body: { domain: string; target_port: string; web_root?: string; use_ssl?: boolean; ssl_email?: string }, db: DbClient) =>
  POST(wid, sid, "/tools/nginx/vhosts", { body, timeout: 30_000 }, db);

export const deleteVHost = (wid: string, sid: string, body: { domain: string }, db: DbClient) =>
  DELETE(wid, sid, "/tools/nginx/vhosts", { body, timeout: 15_000 }, db);

// ── Deploy ────────────────────────────────────────────────────────

export const listDeployTemplates = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/deploy/templates", {}, db);

export const listDeployments = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/deploy/list", { timeout: 15_000 }, db);

export const deployApp = (wid: string, sid: string, body: { template_id: string; app_name: string; env: Record<string, string> }, db: DbClient) =>
  POST(wid, sid, "/tools/deploy/deploy", { body, timeout: 120_000 }, db);

export const removeDeployment = (wid: string, sid: string, body: { appName: string }, db: DbClient) =>
  POST(wid, sid, "/tools/deploy/remove", { body, timeout: 60_000 }, db);

export const getDeploymentLogs = (wid: string, sid: string, appName: string, db: DbClient) =>
  GET(wid, sid, "/tools/deploy/logs", { params: { appName } }, db);

export const startDeployment = (wid: string, sid: string, body: { appName: string }, db: DbClient) =>
  POST(wid, sid, "/tools/deploy/start", { body, timeout: 30_000 }, db);

export const stopDeployment = (wid: string, sid: string, body: { appName: string }, db: DbClient) =>
  POST(wid, sid, "/tools/deploy/stop", { body, timeout: 30_000 }, db);

export const restartDeployment = (wid: string, sid: string, body: { appName: string }, db: DbClient) =>
  POST(wid, sid, "/tools/deploy/restart", { body, timeout: 30_000 }, db);

export const updateDeployment = (wid: string, sid: string, body: { appName: string }, db: DbClient) =>
  POST(wid, sid, "/tools/deploy/update", { body, timeout: 120_000 }, db);

export const getDeployProgress = (wid: string, sid: string, appName: string, db: DbClient) =>
  GET<{ logs: string }>(wid, sid, "/tools/deploy/progress", { params: { appName }, timeout: 5_000 }, db);

// ── Databases ─────────────────────────────────────────────────────

export const listDatabases = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/databases", {}, db);

export const installDatabase = (wid: string, sid: string, body: { type: string; version?: string; port: string; password?: string }, db: DbClient) =>
  POST(wid, sid, "/tools/databases", { body, timeout: 60_000 }, db);

export const removeDatabase = (wid: string, sid: string, body: { type: string }, db: DbClient) =>
  DELETE(wid, sid, "/tools/databases", { body, timeout: 30_000 }, db);

export const checkPorts = (wid: string, sid: string, body: { ports: string[] }, db: DbClient) =>
  POST<Record<string, boolean>>(wid, sid, "/tools/deploy/check-ports", { body }, db);

// ── Backups ───────────────────────────────────────────────────────

export const listBackups = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/backups", {}, db);

export const createFileBackup = (wid: string, sid: string, body: { source_path: string; name: string }, db: DbClient) =>
  POST(wid, sid, "/tools/backups/file", { body, timeout: 300_000 }, db);

export const createDBBackup = (wid: string, sid: string, body: { db_type: string; name: string }, db: DbClient) =>
  POST(wid, sid, "/tools/backups/db", { body, timeout: 120_000 }, db);

export const deleteBackup = (wid: string, sid: string, body: { name: string }, db: DbClient) =>
  DELETE(wid, sid, "/tools/backups", { body }, db);

export const restoreBackup = (wid: string, sid: string, body: { name: string }, db: DbClient) =>
  POST(wid, sid, "/tools/backups/restore", { body, timeout: 120_000 }, db);

// ── Cloud Backups ──────────────────────────────────────────────────

export const getCloudConfig = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/backups/cloud-config", {}, db);

export const updateCloudConfig = (wid: string, sid: string, body: Record<string, unknown>, db: DbClient) =>
  PUT(wid, sid, "/tools/backups/cloud-config", { body }, db);

export const uploadToCloud = (wid: string, sid: string, body: { name: string }, db: DbClient) =>
  POST(wid, sid, "/tools/backups/cloud/upload", { body, timeout: 300_000 }, db);

export const downloadFromCloud = (wid: string, sid: string, body: { name: string }, db: DbClient) =>
  POST(wid, sid, "/tools/backups/cloud/download", { body, timeout: 300_000 }, db);

export const listCloudBackups = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/backups/cloud/list", {}, db);

export const deleteCloudBackup = (wid: string, sid: string, body: { name: string }, db: DbClient) =>
  DELETE(wid, sid, "/tools/backups/cloud", { body }, db);

export const syncCloudBackups = (wid: string, sid: string, db: DbClient) =>
  POST(wid, sid, "/tools/backups/cloud/sync", { timeout: 600_000 }, db);

export const cleanupCloudBackups = (wid: string, sid: string, body: { retention_days: number }, db: DbClient) =>
  POST(wid, sid, "/tools/backups/cloud/cleanup", { body, timeout: 120_000 }, db);

export const testCloudConnection = (wid: string, sid: string, db: DbClient) =>
  POST<{ status: string }>(wid, sid, "/tools/backups/cloud/test", { timeout: 15_000 }, db);

// ── Security ──────────────────────────────────────────────────────

export const auditSSH = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/security/ssh", {}, db);

export const portScan = (wid: string, sid: string, body: { target: string; ports?: string }, db: DbClient) =>
  POST(wid, sid, "/tools/security/portscan", { body, timeout: 60_000 }, db);

export const fail2banStatus = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/security/fail2ban", {}, db);

export const fail2banUnban = (wid: string, sid: string, body: { jail?: string; ip: string }, db: DbClient) =>
  POST(wid, sid, "/tools/security/fail2ban/unban", { body }, db);

export const fail2banBan = (wid: string, sid: string, body: { jail?: string; ip: string }, db: DbClient) =>
  POST(wid, sid, "/tools/security/fail2ban/ban", { body }, db);

// ── Shell AI ──────────────────────────────────────────────────────

export const generateShellCommand = (wid: string, sid: string, body: { prompt: string; provider: string; model?: string; api_key?: string; api_url?: string }, db: DbClient) =>
  POST<{ command: string; explanation?: string }>(wid, sid, "/tools/shell-ai/generate", { body, timeout: 45_000 }, db);

export const executeShellCommand = (wid: string, sid: string, body: { command: string; timeout?: number }, db: DbClient) =>
  POST<{ stdout: string; stderr: string; exit_code: number }>(wid, sid, "/tools/shell-ai/execute", { body, timeout: 60_000 }, db);

// ── Docker Images ──────────────────────────────────────────────────

export const listImages = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/images", {}, db);

export const pullImage = (wid: string, sid: string, body: { name: string }, db: DbClient) =>
  POST(wid, sid, "/images/pull", { body, timeout: 120_000 }, db);

export const deleteImage = (wid: string, sid: string, imageId: string, db: DbClient) =>
  agentFetch(wid, sid, `/images/${encodeURIComponent(imageId)}`, { method: "DELETE" }, db);

export const inspectImage = (wid: string, sid: string, imageId: string, db: DbClient) =>
  GET(wid, sid, `/images/${encodeURIComponent(imageId)}/json`, {}, db);

export const pruneImages = (wid: string, sid: string, db: DbClient) =>
  POST(wid, sid, "/images/prune", { timeout: 60_000 }, db);

// ── DNS ────────────────────────────────────────────────────────────

export const listDNSProviders = (wid: string, sid: string, db: DbClient) =>
  GET<string[]>(wid, sid, "/tools/dns/providers", {}, db);

export const getDNSConfig = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/dns/config", {}, db);

export const saveDNSConfig = (wid: string, sid: string, body: { provider: string; api_key: string; api_secret?: string }, db: DbClient) =>
  POST(wid, sid, "/tools/dns/config", { body }, db);

export const listDNSZones = (wid: string, sid: string, db: DbClient) =>
  GET(wid, sid, "/tools/dns/zones", {}, db);

export const listDNSRecords = (wid: string, sid: string, zoneId: string, db: DbClient) =>
  GET(wid, sid, "/tools/dns/records", { params: { zoneId }, timeout: 15_000 }, db);

export const createDNSRecord = (wid: string, sid: string, body: { zone_id: string; name: string; type: string; content: string; ttl: number; priority?: number }, db: DbClient) =>
  POST(wid, sid, "/tools/dns/records", { body, timeout: 15_000 }, db);

export const updateDNSRecord = (wid: string, sid: string, recordId: string, body: { zone_id: string; name: string; type: string; content: string; ttl: number; priority?: number }, db: DbClient) =>
  PUT(wid, sid, `/tools/dns/records/${encodeURIComponent(recordId)}`, { body, timeout: 15_000 }, db);

export const deleteDNSRecord = (wid: string, sid: string, recordId: string, zoneId: string, db: DbClient) =>
  DELETE(wid, sid, `/tools/dns/records/${encodeURIComponent(recordId)}`, { body: { zone_id: zoneId }, timeout: 15_000 }, db);
