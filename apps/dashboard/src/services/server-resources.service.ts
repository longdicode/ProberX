import { desc, eq } from "drizzle-orm";
import { getById } from "./server.service";
import { metricSnapshots } from "../db/schema/metric-snapshots";
import type { DbClient } from "../db/index";
import { AppError } from "../utils/errors";
import type {
  PanelCertificate,
  PanelCertsData,
  PanelCronTask,
  PanelCronTasksData,
  PanelDatabase,
  PanelDatabasesData,
  PanelNetworkStats,
  PanelSectionResult,
  PanelSecurityScan,
  PanelService,
  PanelServicesData,
  PanelSite,
  PanelSitesData,
  PanelSystemStats,
  ServerResourceOverview,
} from "./panels/types";

/**
 * 服务器资源总览 —— ProberX Agent 原生采集。
 * 数据全部来自已部署的 Agent（metrics / nginx / ssl / databases / services /
 * security 等只读接口 + 固定只读命令），不依赖宝塔等任何控制面板。
 */

interface AgentContext {
  host: string;
  port: number;
  token?: string;
}

interface AgentMetrics {
  cpu_percent?: number;
  mem_total?: number;
  mem_used?: number;
  disk_total?: number;
  disk_used?: number;
  net_in_bytes?: number;
  net_out_bytes?: number;
  load_1?: number;
  load_5?: number;
  load_15?: number;
}

const AGENT_DEFAULT_PORT = 9800;
const AGENT_TIMEOUT_MS = 10_000;

async function resolveAgent(workspaceId: string, serverId: string, db: DbClient): Promise<AgentContext> {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = (server.hostInfo ?? {}) as Record<string, unknown>;
  const host = hostInfo.agent_host as string | undefined;
  if (!host) {
    throw AppError.badRequest("该服务器尚未安装/连接 ProberX Agent，无法直采资源数据");
  }
  return {
    host,
    port: (hostInfo.agent_port as number) ?? AGENT_DEFAULT_PORT,
    token: server.agentSecret as string | undefined,
  };
}

async function agentFetch<T>(
  ctx: AgentContext,
  path: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;

  let res: Response;
  try {
    res = await fetch(`http://${ctx.host}:${ctx.port}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? AGENT_TIMEOUT_MS),
    });
  } catch {
    throw new Error("无法连接 ProberX Agent，请检查服务器是否在线");
  }

  if (!res.ok) {
    let msg = `Agent 返回错误（HTTP ${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // ignore parse failures
    }
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Agent 返回了无法解析的数据");
  }
}

/** 执行固定的只读命令（命令为内置常量，不接受任何用户输入） */
async function execReadOnly(ctx: AgentContext, command: string, timeoutMs = 8_000): Promise<string> {
  const result = await agentFetch<{ output: string; exit_code: number; error?: string }>(
    ctx,
    "/exec",
    { method: "POST", body: { command, timeout_ms: timeoutMs }, timeoutMs: timeoutMs + 2_000 },
  );
  if (result.exit_code !== 0) {
    throw new Error(result.error || result.output?.trim() || `命令执行失败（exit ${result.exit_code}）`);
  }
  return result.output ?? "";
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "采集失败");
  if (/no such file|not found|command not found|only supported|permission denied/i.test(raw)) {
    return "该模块在服务器上不可用（组件未安装或权限不足）";
  }
  return raw;
}

async function wrapSection<T>(fn: () => Promise<T>): Promise<PanelSectionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

// ── 系统 ────────────────────────────────────────────────────────────

const SYSTEM_INFO_SCRIPT = [
  '( . /etc/os-release 2>/dev/null && echo "os=${PRETTY_NAME}" ) || echo "os=$(uname -sr)"',
  'echo "host=$(hostname)"',
  'echo "kernel=$(uname -r)"',
].join("\n");

function parseKeyValueLines(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    const idx = line.indexOf("=");
    if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

async function fetchSystem(ctx: AgentContext): Promise<PanelSystemStats> {
  const metrics = await agentFetch<AgentMetrics>(ctx, "/metrics");
  const meta = await execReadOnly(ctx, SYSTEM_INFO_SCRIPT)
    .then(parseKeyValueLines)
    .catch(() => ({} as Record<string, string>));
  return {
    os: meta.os || "Linux",
    panelVersion: meta.kernel || "",
    hostname: meta.host || "",
    cpuPercent: toNumber(metrics.cpu_percent),
    memTotalBytes: toNumber(metrics.mem_total),
    memUsedBytes: toNumber(metrics.mem_used),
    diskTotalBytes: toNumber(metrics.disk_total),
    reportedAt: new Date().toISOString(),
  };
}

// ── 站点（Nginx 虚拟主机） ──────────────────────────────────────────

interface NginxVHostRow {
  domain?: unknown;
  config_path?: unknown;
  enabled?: unknown;
  has_ssl?: unknown;
  target_port?: unknown;
}

async function fetchSites(ctx: AgentContext): Promise<PanelSitesData> {
  const rows = await agentFetch<NginxVHostRow[]>(ctx, "/tools/nginx/vhosts");
  const list: PanelSite[] = rows
    .map((row) => ({
      id: String(row.domain ?? row.config_path ?? ""),
      name: String(row.domain ?? ""),
      rootPath: String(row.config_path ?? ""),
      enabled: row.enabled !== false,
    }))
    .filter((site) => site.name);
  return { total: list.length, list };
}

// ── 证书（本机已安装证书） ──────────────────────────────────────────

interface InstalledCertRow {
  domain?: unknown;
  subject?: unknown;
  issuer?: unknown;
  not_before?: unknown;
  not_after?: unknown;
  days_left?: unknown;
  sans?: unknown;
}

function splitCsv(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchCertificates(ctx: AgentContext): Promise<PanelCertsData> {
  const rows = await agentFetch<InstalledCertRow[]>(ctx, "/tools/ssl/certs");
  const list: PanelCertificate[] = rows
    .map((row) => {
      const domains = Array.from(
        new Set([...splitCsv(row.subject), ...splitCsv(row.sans), ...splitCsv(row.domain)]),
      ).filter(Boolean);
      if (!domains.length) return null;
      const notAfter = typeof row.not_after === "string" ? row.not_after : "";
      return {
        id: String(row.domain ?? domains[0]),
        domains,
        issuer: String(row.issuer ?? ""),
        expiresAt: notAfter || null,
        daysLeft: toNumber(row.days_left),
      };
    })
    .filter((cert): cert is PanelCertificate => cert !== null);
  const expired = list.filter((cert) => cert.daysLeft !== null && cert.daysLeft < 0).length;
  const expiringSoon = list.filter((cert) => cert.daysLeft !== null && cert.daysLeft >= 0 && cert.daysLeft <= 30).length;
  return { total: list.length, expired, expiringSoon, list };
}

// ── 数据库（ProberX 管理 / Docker 实例） ───────────────────────────

interface DatabaseRow {
  name?: unknown;
  type?: unknown;
  version?: unknown;
  status?: unknown;
}

async function fetchDatabases(ctx: AgentContext): Promise<PanelDatabasesData> {
  const rows = await agentFetch<DatabaseRow[]>(ctx, "/tools/databases");
  const list: PanelDatabase[] = rows
    .map((row) => ({
      name: String(row.name ?? ""),
      engine: String(row.type ?? ""),
      sizeBytes: null,
    }))
    .filter((db) => db.name);
  return { total: list.length, list };
}

// ── 计划任务（系统 crontab，只读） ─────────────────────────────────

const CRON_SCRIPT = [
  "for u in $(ls /var/spool/cron/crontabs 2>/dev/null); do echo \"== $u\"; crontab -l -u \"$u\" 2>/dev/null; done",
  "for f in /etc/crontab /etc/cron.d/*; do [ -r \"$f\" ] && { echo \"== $f\"; cat \"$f\"; }; done",
].join("\n");

const CRON_LINE_RE = /^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/;

function parseCrontab(output: string): PanelCronTask[] {
  const list: PanelCronTask[] = [];
  let section = "system";
  let lastComment = "";
  let index = 0;
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("==")) {
      section = line.slice(2).trim() || "system";
      lastComment = "";
      continue;
    }
    if (line.startsWith("#")) {
      const comment = line.slice(1).trim();
      lastComment = /m h dom mon dow/i.test(comment) ? "" : comment;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const match = CRON_LINE_RE.exec(line);
    if (!match) continue;
    const command = match[2].trim();
    if (!command) continue;
    list.push({
      id: `${section}:${index++}`,
      name: (lastComment || command).slice(0, 64),
      schedule: match[1].replace(/\s+/g, " ").trim(),
      enabled: true,
    });
    lastComment = "";
  }
  return list;
}

async function fetchCronTasks(ctx: AgentContext): Promise<PanelCronTasksData> {
  const output = await execReadOnly(ctx, CRON_SCRIPT);
  const list = parseCrontab(output);
  return { total: list.length, running: list.filter((task) => task.enabled).length, list };
}

// ── 运行服务（systemd） ─────────────────────────────────────────────

interface ServiceRow {
  name?: unknown;
  load_state?: unknown;
  active_state?: unknown;
  sub_state?: unknown;
  description?: unknown;
}

async function fetchServices(ctx: AgentContext): Promise<PanelServicesData> {
  const rows = await agentFetch<ServiceRow[]>(ctx, "/tools/services");
  const list: PanelService[] = rows
    .map((row) => {
      const activeState = String(row.active_state ?? "").toLowerCase();
      const subState = String(row.sub_state ?? "").toLowerCase();
      const name = String(row.name ?? "");
      if (!name) return null;
      return {
        name,
        description: String(row.description ?? ""),
        active: activeState === "active",
        failed: activeState === "failed" || subState === "failed",
      };
    })
    .filter((svc): svc is PanelService => svc !== null);
  return {
    total: list.length,
    running: list.filter((svc) => svc.active).length,
    failed: list.filter((svc) => svc.failed).length,
    list,
  };
}

// ── 安全基线（SSH 审计 + fail2ban） ────────────────────────────────

interface SSHFindingRow {
  severity?: unknown;
  message?: unknown;
}

function isFail2banEnabled(raw: unknown): boolean {
  if (Array.isArray(raw)) {
    if (!raw.length) return false;
    return raw.some((item) => isObject(item) && (item as Record<string, unknown>).enabled !== false);
  }
  if (isObject(raw)) {
    if (typeof raw.enabled === "boolean") return raw.enabled;
    const jails = raw.jails ?? raw.list;
    return Array.isArray(jails) && jails.length > 0;
  }
  return false;
}

async function fetchSecurityScan(ctx: AgentContext): Promise<PanelSecurityScan> {
  const findings = await agentFetch<SSHFindingRow[]>(ctx, "/tools/security/ssh");
  let fail2banEnabled = false;
  try {
    const raw = await agentFetch<unknown>(ctx, "/tools/security/fail2ban");
    fail2banEnabled = isFail2banEnabled(raw);
  } catch {
    fail2banEnabled = false;
  }

  const severityOf = (finding: SSHFindingRow) => String(finding.severity ?? "").toLowerCase();
  const critical = findings.filter((f) => severityOf(f) === "critical").length;
  const high = findings.filter((f) => severityOf(f) === "high").length;
  const medium = findings.filter((f) => severityOf(f) === "medium").length;
  const low = findings.filter((f) => severityOf(f) === "low").length;
  let score = Math.max(0, 100 - critical * 20 - high * 8 - medium * 3 - low);
  if (!fail2banEnabled) score = Math.max(0, score - 6);
  const riskCount = critical + high + (fail2banEnabled ? 0 : 1);
  return { state: "done", progressPercent: null, score, riskCount };
}

// ── 实时网络与负载 ─────────────────────────────────────────────────

function bytesToMb(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value / (1024 * 1024));
}

async function fetchNetwork(ctx: AgentContext, db: DbClient, serverId: string): Promise<PanelNetworkStats> {
  const metrics = await agentFetch<AgentMetrics>(ctx, "/metrics");
  const rows = await db
    .select({
      time: metricSnapshots.time,
      netIn: metricSnapshots.netInBytes,
      netOut: metricSnapshots.netOutBytes,
    })
    .from(metricSnapshots)
    .where(eq(metricSnapshots.serverId, serverId))
    .orderBy(desc(metricSnapshots.time))
    .limit(2);

  const [cur, prev] = rows;
  let upRateKbps: number | null = null;
  let downRateKbps: number | null = null;
  if (
    cur && prev && cur.time && prev.time
    && cur.netOut != null && prev.netOut != null
    && cur.netIn != null && prev.netIn != null
  ) {
    const dtSec = (cur.time.getTime() - prev.time.getTime()) / 1000;
    if (dtSec > 0) {
      upRateKbps = Math.max(0, (cur.netOut - prev.netOut) / dtSec / 1024);
      downRateKbps = Math.max(0, (cur.netIn - prev.netIn) / dtSec / 1024);
    }
  }
  return {
    upRateKbps,
    downRateKbps,
    upTotalMb: bytesToMb(toNumber(metrics.net_out_bytes) ?? undefined),
    downTotalMb: bytesToMb(toNumber(metrics.net_in_bytes) ?? undefined),
    load1: toNumber(metrics.load_1),
    load5: toNumber(metrics.load_5),
    load15: toNumber(metrics.load_15),
  };
}

// ── 汇总 ────────────────────────────────────────────────────────────

export async function collectResourceOverview(
  db: DbClient,
  workspaceId: string,
  serverId: string,
): Promise<ServerResourceOverview> {
  const ctx = await resolveAgent(workspaceId, serverId, db);
  const [system, sites, certificates, databases, cronTasks, services, securityScan, network] = await Promise.all([
    wrapSection(() => fetchSystem(ctx)),
    wrapSection(() => fetchSites(ctx)),
    wrapSection(() => fetchCertificates(ctx)),
    wrapSection(() => fetchDatabases(ctx)),
    wrapSection(() => fetchCronTasks(ctx)),
    wrapSection(() => fetchServices(ctx)),
    wrapSection(() => fetchSecurityScan(ctx)),
    wrapSection(() => fetchNetwork(ctx, db, serverId)),
  ]);
  return {
    system,
    sites,
    certificates,
    databases,
    cronTasks,
    services,
    securityScan,
    network,
    checkedAt: new Date().toISOString(),
  };
}
