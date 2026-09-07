import crypto from "node:crypto";
import type {
  PanelAdapter,
  PanelAdapterKind,
  PanelBindingOverview,
  PanelCertificate,
  PanelCertsData,
  PanelConnectionConfig,
  PanelCronTask,
  PanelCronTasksData,
  PanelDatabase,
  PanelDatabasesData,
  PanelFtpUser,
  PanelFtpUsersData,
  PanelNetworkStats,
  PanelSectionResult,
  PanelSecurityScan,
  PanelSite,
  PanelSitesData,
  PanelSystemStats,
  PanelTestResult,
} from "./types";

/** 面板协议层错误：错误信息面向用户，不泄露内部细节 */
export class PanelRequestError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "PanelRequestError";
  }
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 ProberX-PanelLink/1.0";

const REQUEST_TIMEOUT_MS = 12_000;

function md5(value: string): string {
  return crypto.createHash("md5").update(value).digest("hex");
}

function normalizeBaseUrl(raw: string): string {
  let url = (raw ?? "").trim();
  if (!url) throw new PanelRequestError("面板地址不能为空");
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) throw new Error("empty host");
    return url.replace(/\/+$/, "");
  } catch {
    throw new PanelRequestError("面板地址格式不正确，示例：http://1.2.3.4:8888");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** 部分面板会把载荷包在 {status,msg,data} 里，去掉这一层包装 */
function unwrapPayload(raw: unknown): unknown {
  if (isObject(raw) && "data" in raw && "msg" in raw && "status" in raw) return raw.data;
  return raw;
}

/** 抽取行数组：兼容“直接数组”和“{data:[...]}”两种返回 */
function extractRows(raw: unknown): unknown[] {
  const payload = unwrapPayload(raw);
  if (Array.isArray(payload)) return payload;
  if (isObject(payload) && Array.isArray(payload.data)) return payload.data as unknown[];
  return [];
}

function pickString(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

async function callPanel(
  config: PanelConnectionConfig,
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const baseUrl = normalizeBaseUrl(config.panelUrl);
  if (!config.apiKey?.trim()) throw new PanelRequestError("请先填写面板 API 密钥");
  const requestTime = String(Math.floor(Date.now() / 1000));
  const requestToken = md5(requestTime + md5(config.apiKey.trim()));
  const form = new URLSearchParams({ request_time: requestTime, request_token: requestToken, ...params });

  let res: Response;
  try {
    res = await fetch(new URL(path, baseUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
        "User-Agent": BROWSER_UA,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError"
      ? "连接面板超时，请检查地址、端口与网络"
      : "无法连接面板，请检查地址、端口与网络";
    throw new PanelRequestError(message);
  }

  if (!res.ok) throw new PanelRequestError(`面板请求失败（HTTP ${res.status}）`, res.status);
  const text = await res.text();
  if (!text.trim()) return {};
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PanelRequestError("面板返回了无法解析的数据");
  }
  if (isObject(json) && (json.status === false || json.status === "false")) {
    const msg = pickString(json, ["msg", "message", "error"], "面板拒绝了请求，请检查 API 密钥与 IP 白名单");
    throw new PanelRequestError(msg);
  }
  return json;
}

function parseExpiry(cert: Record<string, unknown>): { expiresAt: string | null; daysLeft: number | null } {
  const endtime = toNumber(cert.endtime) ?? toNumber(cert.end_time);
  const DAY_MS = 86_400_000;
  if (endtime !== null) {
    if (Math.abs(endtime) < 40_000) {
      // 剩余天数
      const expiresAt = new Date(Date.now() + Math.round(endtime) * DAY_MS);
      return { expiresAt: expiresAt.toISOString(), daysLeft: Math.round(endtime) };
    }
    // unix 秒时间戳
    const date = new Date(endtime * 1000);
    if (!Number.isNaN(date.getTime())) {
      return { expiresAt: date.toISOString(), daysLeft: Math.ceil((date.getTime() - Date.now()) / DAY_MS) };
    }
  }
  const notAfter = pickString(cert, ["notAfter", "not_after", "endtime_text", "expireDate"]);
  if (notAfter) {
    const date = new Date(notAfter.replace(" ", "T") + (notAfter.includes("Z") ? "" : "Z"));
    if (!Number.isNaN(date.getTime())) {
      return { expiresAt: date.toISOString(), daysLeft: Math.ceil((date.getTime() - Date.now()) / DAY_MS) };
    }
  }
  return { expiresAt: null, daysLeft: null };
}

async function fetchSystem(config: PanelConnectionConfig): Promise<PanelSystemStats> {
  const raw = await callPanel(config, "/system", { action: "GetSystemTotal" });
  const obj = (unwrapPayload(raw) ?? {}) as Record<string, unknown>;
  const memTotal = toNumber(obj.memTotal) ?? toNumber(obj.mem_total);
  const memFree = toNumber(obj.memFree) ?? toNumber(obj.mem_free);
  const memBuffers = toNumber(obj.memBuffers) ?? toNumber(obj.mem_buffers) ?? 0;
  const memCached = toNumber(obj.memCached) ?? toNumber(obj.mem_cached) ?? 0;
  const memUsedExplicit = toNumber(obj.memUsed) ?? toNumber(obj.mem_used);
  const memUsedBytes = memUsedExplicit ?? (memTotal !== null && memFree !== null
    ? Math.max(0, memTotal - memFree - memBuffers - memCached)
    : null);
  return {
    os: pickString(obj, ["os", "system", "osName", "sys"], "未知系统"),
    panelVersion: pickString(obj, ["version", "panelVersion", "panel_version"]),
    hostname: pickString(obj, ["hostname", "host_name", "hostName"]),
    cpuPercent: toNumber(obj.cpuRealUsed) ?? toNumber(obj.cpuPercent) ?? toNumber(obj.cpu_used) ?? toNumber(obj.cpu),
    memTotalBytes: memTotal,
    memUsedBytes,
    diskTotalBytes: toNumber(obj.diskTotal) ?? toNumber(obj.disk_total),
    reportedAt: new Date().toISOString(),
  };
}

async function fetchSites(config: PanelConnectionConfig): Promise<PanelSitesData> {
  const raw = await callPanel(config, "/data", { action: "getData", table: "sites", type: "-1" });
  const rows = extractRows(raw);
  const list: PanelSite[] = rows
    .filter(isObject)
    .map((row) => {
      const status = String(row.status ?? "1").toLowerCase();
      return {
        id: pickString(row, ["id", "Id"]),
        name: pickString(row, ["name", "siteName", "sitename", "domain"]),
        rootPath: pickString(row, ["path", "root_path", "rootPath"]),
        enabled: !["0", "stop", "stopped", "false", "已停止"].includes(status),
      };
    })
    .filter((site) => site.name);
  return { total: list.length, list };
}

function normalizeCertificate(raw: unknown): PanelCertificate | null {
  if (!isObject(raw)) return null;
  const row = raw as Record<string, unknown>;
  const subject = pickString(row, ["subject", "domain", "commonName", "cn"]);
  const dnsRaw = row.dns;
  const domains = Array.isArray(dnsRaw)
    ? dnsRaw.map(String).map((s) => s.trim()).filter(Boolean)
    : typeof dnsRaw === "string" && dnsRaw.trim()
      ? dnsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  if (!domains.length && subject) domains.push(subject);
  if (!domains.length) return null;
  const { expiresAt, daysLeft } = parseExpiry(row);
  return {
    id: pickString(row, ["id", "Id", "cert_id"]),
    domains,
    issuer: pickString(row, ["issuer_O", "issuerO", "issuer", "ca"]),
    expiresAt,
    daysLeft,
  };
}

async function fetchCertificates(config: PanelConnectionConfig): Promise<PanelCertsData> {
  const raw = await callPanel(config, "/ssl", { action: "GetCertList" });
  const rows = extractRows(raw);
  const list = rows.map(normalizeCertificate).filter((cert): cert is PanelCertificate => cert !== null);
  const expired = list.filter((cert) => cert.daysLeft !== null && cert.daysLeft < 0).length;
  const expiringSoon = list.filter((cert) => cert.daysLeft !== null && cert.daysLeft >= 0 && cert.daysLeft <= 30).length;
  return { total: list.length, expired, expiringSoon, list };
}

/** 通过面板通用罗列接口拉取某类资源行 */
async function fetchTableRows(config: PanelConnectionConfig, table: string): Promise<Record<string, unknown>[]> {
  const raw = await callPanel(config, "/data", { action: "getData", table, type: "-1" });
  return extractRows(raw).filter(isObject) as Record<string, unknown>[];
}

/** 解析带单位或纯字节的容量值 */
function parseBytes(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  const match = /^([\d.]+)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib)?$/.exec(text);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
  };
  return Math.round(num * (multipliers[match[2] || "b"] ?? 1));
}

/** 面板行内 status 的通用“启用”判定 */
function isActiveStatus(value: unknown): boolean {
  const status = String(value ?? "1").toLowerCase();
  return !["0", "stop", "stopped", "false", "off", "已停止"].includes(status);
}

async function fetchDatabases(config: PanelConnectionConfig): Promise<PanelDatabasesData> {
  const rows = await fetchTableRows(config, "databases");
  const list: PanelDatabase[] = rows
    .map((row) => ({
      name: pickString(row, ["name", "database", "db_name", "username"]),
      engine: pickString(row, ["engine", "type", "db_type"]),
      sizeBytes: parseBytes(row.size ?? row.usage),
    }))
    .filter((db) => db.name);
  return { total: list.length, list };
}

async function fetchFtpUsers(config: PanelConnectionConfig): Promise<PanelFtpUsersData> {
  const rows = await fetchTableRows(config, "ftps");
  const list: PanelFtpUser[] = rows
    .map((row) => ({
      username: pickString(row, ["name", "username", "user"]),
      homePath: pickString(row, ["path", "home", "home_path", "dir"]),
      enabled: isActiveStatus(row.status),
    }))
    .filter((user) => user.username);
  return { total: list.length, list };
}

function pad2(value: string): string {
  return value.padStart(2, "0");
}

/** 根据面板的 cron 行字段拼一个易读的执行时间描述 */
function buildCronSchedule(row: Record<string, unknown>): string {
  const type = String(row.type ?? "").toLowerCase();
  const hour = pickString(row, ["where_hour", "whereHour"]);
  const minute = pickString(row, ["where_minute", "whereMinute"]);
  const step = pickString(row, ["where1", "where"]);
  const week = pickString(row, ["where_week", "whereWeek"]);
  const time = hour || minute ? `${pad2(hour || "00")}:${pad2(minute || "00")}` : "";
  if (step && (type.includes("minute") || ["0", ""].includes(type))) return `每 ${step} 分钟`;
  if (type.includes("hour") || type === "1") return minute ? `每小时 :${pad2(minute)}` : "每小时";
  if (type.includes("week") || type === "3") return `每周${week ? ` ${week}` : ""}${time ? ` ${time}` : ""}`;
  if (type.includes("month") || type === "4") return `每月${time ? ` ${time}` : ""}`;
  if (type.includes("day") || type === "2") return `每天${time ? ` ${time}` : ""}`;
  return time ? `按时间 ${time}` : "按计划";
}

function normalizeCronTask(raw: unknown): PanelCronTask | null {
  if (!isObject(raw)) return null;
  const row = raw as Record<string, unknown>;
  const name = pickString(row, ["name", "sName", "title"]);
  if (!name) return null;
  return {
    id: pickString(row, ["id", "Id"]),
    name,
    schedule: buildCronSchedule(row),
    enabled: isActiveStatus(row.status),
  };
}

async function fetchCronTasks(config: PanelConnectionConfig): Promise<PanelCronTasksData> {
  const raw = await callPanel(config, "/crontab", { action: "GetCrontab" });
  const list = extractRows(raw)
    .map(normalizeCronTask)
    .filter((task): task is PanelCronTask => task !== null);
  return { total: list.length, running: list.filter((task) => task.enabled).length, list };
}

async function fetchSecurityScan(config: PanelConnectionConfig): Promise<PanelSecurityScan> {
  const raw = await callPanel(config, "/warning", { action: "get_scan_bar" });
  const obj = (unwrapPayload(raw) ?? {}) as Record<string, unknown>;
  const statusText = pickString(obj, ["status", "state", "msg"], "");
  const finished = /完成|完毕|done|finish|ok/i.test(statusText);
  const scanning = !finished && /扫描|检查|进行|run|scan|working/i.test(statusText);
  const state: PanelSecurityScan["state"] =
    finished ? "done"
    : scanning ? "scanning"
    : obj.status === false || obj.status === "false" ? "idle"
    : "unknown";
  return {
    state,
    progressPercent: toNumber(obj.percentage) ?? toNumber(obj.percent),
    score: toNumber(obj.score),
    riskCount: toNumber(obj.count) ?? toNumber(obj.risk_count),
  };
}

async function fetchNetwork(config: PanelConnectionConfig): Promise<PanelNetworkStats> {
  const raw = await callPanel(config, "/system", { action: "GetNetWork" });
  const unwrapped = (unwrapPayload(raw) ?? {}) as Record<string, unknown>;
  const obj = isObject(unwrapped.network) ? (unwrapped.network as Record<string, unknown>) : unwrapped;
  const load = isObject(obj.load) ? (obj.load as Record<string, unknown>) : isObject(unwrapped.load) ? (unwrapped.load as Record<string, unknown>) : {};
  return {
    upRateKbps: toNumber(obj.up),
    downRateKbps: toNumber(obj.down),
    upTotalMb: toNumber(obj.upTotal) ?? toNumber(obj.up_total),
    downTotalMb: toNumber(obj.downTotal) ?? toNumber(obj.down_total),
    load1: toNumber(load.one) ?? toNumber(load.load1),
    load5: toNumber(load.five) ?? toNumber(load.load5),
    load15: toNumber(load.fifteen) ?? toNumber(load.load15),
  };
}

async function wrapSection<T>(fn: () => Promise<T>): Promise<PanelSectionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "采集失败" };
  }
}

export async function testConnection(config: PanelConnectionConfig): Promise<PanelTestResult> {
  const startedAt = Date.now();
  try {
    const system = await fetchSystem(config);
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      panelVersion: system.panelVersion,
      os: system.os,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : "连接失败",
    };
  }
}

export async function fetchOverview(config: PanelConnectionConfig): Promise<PanelBindingOverview> {
  const [system, sites, certificates, databases, ftpUsers, cronTasks, securityScan, network] = await Promise.all([
    wrapSection(() => fetchSystem(config)),
    wrapSection(() => fetchSites(config)),
    wrapSection(() => fetchCertificates(config)),
    wrapSection(() => fetchDatabases(config)),
    wrapSection(() => fetchFtpUsers(config)),
    wrapSection(() => fetchCronTasks(config)),
    wrapSection(() => fetchSecurityScan(config)),
    wrapSection(() => fetchNetwork(config)),
  ]);
  return {
    system,
    sites,
    certificates,
    databases,
    ftpUsers,
    cronTasks,
    securityScan,
    network,
    checkedAt: new Date().toISOString(),
  };
}

export function createPanelAdapter(kind: PanelAdapterKind): PanelAdapter {
  switch (kind) {
    case "bt":
    case "aapanel":
      return {
        kind,
        label: kind === "bt" ? "BT（宝塔）" : "aaPanel",
        testConnection,
        fetchOverview,
      };
    default:
      throw new PanelRequestError(`暂不支持的面板类型：${kind as string}`);
  }
}
