// 周报/价值汇总：基于工作区最近 N 天的自主排查记录做统计，并用大模型生成中文运维周报。
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { diagnosisRuns } from "../db/schema/diagnosis-runs";
import { servers } from "../db/schema/servers";
import { chatComplete } from "./llm-client";
import type { DbClient } from "../db/index";
import type { DiagnosisStep } from "./diagnosis.service";
import { indexMemory } from "./memory.service";
import { resolveAiLlm } from "./ai-settings.service";

export interface WeeklyServerStat {
  id: string;
  name: string;
  runCount: number;
}

export interface WeeklyRootTopic {
  text: string;
  count: number;
}

export interface WeeklyDiskForecast {
  serverId: string;
  serverName: string;
  usedPct: number;
  growthPerDayPct: number;
  etaDays: number | null;
}

export interface WeeklyCpuTrend {
  serverId: string;
  serverName: string;
  olderAvgPct: number;
  newerAvgPct: number;
}

export interface WeeklyUptimeTrend {
  total: number;
  ok: number;
  uptimePct: number | null;
  uptimePrevPct: number | null;
  avgMs: number | null;
}

export interface WeeklyReport {
  windowDays: number;
  since: string;
  until: string;
  scope: "workspace" | "server";
  serverId: string | null;
  runCount: number;
  byStatus: Record<string, number>;
  autoCount: number;
  totalSteps: number;
  avgSteps: number;
  totalRepairs: number;
  totalRollbacks: number;
  totalRechecks: number;
  recoveredCount: number;
  stillFailingCount: number;
  totalRunMs: number;
  savedMinEstimate: number;
  rootTopics: WeeklyRootTopic[];
  servers: WeeklyServerStat[];
  prevRunCount: number;
  prevSuccessCount: number;
  prevFailedCount: number;
  diskForecasts: WeeklyDiskForecast[];
  cpuTrends: WeeklyCpuTrend[];
  uptimeTotal: number;
  uptimeOk: number;
  uptimePct: number | null;
  uptimePrevPct: number | null;
  trendText: string;
  markdown: string;
  generatedAt: string;
}

function clampDays(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(90, n));
}

function isTool(s: DiagnosisStep, prefix: string): boolean {
  return (s.tool || "").startsWith(prefix);
}

function verdictOf(s: DiagnosisStep): "已恢复" | "仍异常" | "无法核实" | null {
  if ((s.tool || "") !== "复检结论") return null;
  const m = /判定：(已恢复|仍异常|无法核实)/.exec(s.stdout ?? "");
  return m ? (m[1] as "已恢复" | "仍异常" | "无法核实") : null;
}

function normTopic(v: string): string {
  return (v ?? "").toLowerCase().replace(/[\s，。；、：:,.!?！？()（）"'“”]/g, "");
}

function diceSim(a: string, b: string): number {
  const A = new Set<string>();
  const B = new Set<string>();
  for (let i = 0; i + 1 < a.length; i++) A.add(a.slice(i, i + 2));
  for (let i = 0; i + 1 < b.length; i++) B.add(b.slice(i, i + 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function clusterRootCauses(texts: string[]): WeeklyRootTopic[] {
  const buckets: { norm: string; text: string; count: number }[] = [];
  for (const t of texts) {
    const n = normTopic(t);
    if (!n) continue;
    const hit = buckets.find((b) => diceSim(n, b.norm) >= 0.5);
    if (hit) {
      hit.count += 1;
      if (t.length < hit.text.length) hit.text = t; // 保留更精炼的代表文本
    } else {
      buckets.push({ norm: n, text: t, count: 1 });
    }
  }
  return buckets
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((b) => ({ text: b.text.slice(0, 120), count: b.count }));
}

const WEEKLY_SYSTEM_PROMPT = `你是 ProberX 平台的资深运维负责人。系统会给你最近一段时间服务器“自主排查”的统计与摘要，
请生成一份简洁专业的【中文运维周报分析】（Markdown，300-450 字），包含：
- 【总体健康】：用一两句话概括故障排查量与恢复情况，语气客观。
- 【根因 TOP 与建议】：基于统计与根因摘要把最常见的问题类型排出来，给出可执行的运维建议。
- 【自动化闭环效果】：点评修复/回滚/复检的自动化闭环数据（只引用给定统计）。
- 【风险提示】：指出仍需人工关注的事项。
规则：只允许引用提供的统计数字与根因摘要，不要编造任何未提供的数据；不要输出表格；不要输出 JSON。`;

interface RawRun {
  id: string;
  serverId: string | null;
  trigger: string | null;
  status: string | null;
  rootCause: string | null;
  confidence: number | null;
  steps: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export async function buildWeekly(
  workspaceId: string,
  db: DbClient,
  opts: { days?: number; serverId?: string; onProgress?: (p: { label: string; detail?: string; current: number; total: number }) => void } = {}
): Promise<WeeklyReport> {
  const days = clampDays(opts.days);
  // AI 接口可配置到工作区设置；未启用时自动回退服务器环境变量
  const llm = await resolveAiLlm(db, workspaceId);
  const since = new Date(Date.now() - days * 86_400_000);
  const conds = [eq(diagnosisRuns.workspaceId, workspaceId), gte(diagnosisRuns.createdAt, since)];
  if (opts.serverId) conds.push(eq(diagnosisRuns.serverId, opts.serverId));
  const rows = (await db
    .select({
      id: diagnosisRuns.id,
      serverId: diagnosisRuns.serverId,
      trigger: diagnosisRuns.trigger,
      status: diagnosisRuns.status,
      rootCause: diagnosisRuns.rootCause,
      confidence: diagnosisRuns.confidence,
      steps: diagnosisRuns.steps,
      startedAt: diagnosisRuns.startedAt,
      finishedAt: diagnosisRuns.finishedAt,
      createdAt: diagnosisRuns.createdAt,
    })
    .from(diagnosisRuns)
    .where(and(...conds))
    .orderBy(desc(diagnosisRuns.createdAt))
    .limit(500)) as RawRun[];
  opts.onProgress?.({ label: "AI 运维周报", detail: `已读取近 ${days} 天 ${rows.length} 条记录，正在统计与趋势预测`, current: 1, total: 3 });

  const byStatus: Record<string, number> = {};
  let autoCount = 0;
  let totalSteps = 0;
  let totalRepairs = 0;
  let totalRollbacks = 0;
  let totalRechecks = 0;
  let recoveredCount = 0;
  let stillFailingCount = 0;
  let totalRunMs = 0;
  const serverIds = new Set<string>();
  const rootCauseTexts: string[] = [];
  const runSummaries: string[] = [];

  for (const r of rows) {
    byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
    if (r.trigger === "auto") autoCount += 1;
    if (r.serverId) serverIds.add(r.serverId);
    const steps = (Array.isArray(r.steps) ? r.steps : []) as DiagnosisStep[];
    totalSteps += steps.filter((s) => !isTool(s, "证据指纹")).length;
    let repairs = 0;
    let rollbacks = 0;
    let rechecks = 0;
    for (const s of steps) {
      if (isTool(s, "修复·")) repairs += 1;
      if (isTool(s, "回滚·")) rollbacks += 1;
      if (isTool(s, "复检·")) rechecks += 1;
      const v = verdictOf(s);
      if (v === "已恢复") recoveredCount += 1;
      if (v === "仍异常") stillFailingCount += 1;
    }
    totalRepairs += repairs;
    totalRollbacks += rollbacks;
    totalRechecks += rechecks;
    if (r.startedAt && r.finishedAt) {
      const ms = r.finishedAt.getTime() - r.startedAt.getTime();
      if (Number.isFinite(ms) && ms > 0 && ms < 24 * 3600_000) totalRunMs += ms;
    }
    if (r.status === "success" && r.rootCause) {
      rootCauseTexts.push(r.rootCause);
      const flags = [
        repairs ? `修复${repairs}` : "",
        rollbacks ? `回滚${rollbacks}` : "",
        rechecks ? `复检${rechecks}` : "",
      ].filter(Boolean).join("/");
      runSummaries.push(`- [${r.createdAt ? new Date(r.createdAt).toLocaleDateString("zh-CN") : ""}] 结论：${(r.rootCause || "").slice(0, 90)}${flags ? `（${flags}）` : ""}`);
    }
  }

  const idList = [...serverIds];
  const nameMap = new Map<string, string>();
  if (idList.length) {
    const srows = await db
      .select({ id: servers.id, name: servers.name })
      .from(servers)
      .where(and(eq(servers.workspaceId, workspaceId), inArray(servers.id, idList)));
    for (const s of srows) nameMap.set(s.id, s.name);
  }
  const serverStats: WeeklyServerStat[] = [];
  const byServer = new Map<string, number>();
  for (const r of rows) {
    if (!r.serverId) continue;
    byServer.set(r.serverId, (byServer.get(r.serverId) ?? 0) + 1);
  }
  for (const [sid, count] of byServer) {
    serverStats.push({ id: sid, name: nameMap.get(sid) ?? "未知服务器", runCount: count });
  }
  serverStats.sort((a, b) => b.runCount - a.runCount);

  const totalRunMin = totalRunMs / 60_000;
  const manualEstMin = totalSteps * 12; // 人工逐条定位平均每步约 12 分钟
  const savedMinEstimate = Math.max(0, Math.round(manualEstMin - totalRunMin));
  const trend = await buildTrend(workspaceId, db, {
    days,
    since,
    serverId: opts.serverId,
    runCount: rows.length,
    successCount: byStatus.success ?? 0,
    failedCount: byStatus.failed ?? 0,
  });

  const generatedAt = new Date().toISOString();
  const until = new Date();
  const header =
    `# ProberX AI 运维周报\n\n` +
    `- 统计周期：${since.toLocaleDateString("zh-CN")} ~ ${until.toLocaleDateString("zh-CN")}（最近 ${days} 天）\n` +
    `- 覆盖范围：${opts.serverId ? "单台服务器" : `全部 ${serverStats.length || "—"} 台服务器`}\n` +
    `- 生成时间：${generatedAt}\n\n` +
    `## 统计概览\n\n` +
    `- 自主排查 ${rows.length} 次（成功 ${byStatus.success ?? 0} / 失败 ${byStatus.failed ?? 0} / 停止 ${byStatus.stopped ?? 0} / 进行中 ${byStatus.running ?? 0}），其中自动触发 ${autoCount} 次\n` +
    `- 累计取证 ${totalSteps} 步（平均 ${rows.length ? (totalSteps / rows.length).toFixed(1) : 0} 步/次）\n` +
    `- 白名单修复 ${totalRepairs} 次 · 自动回滚 ${totalRollbacks} 次 · 自动复检 ${totalRechecks} 次\n` +
    `- 复检判定：已恢复 ${recoveredCount} 次 / 仍异常 ${stillFailingCount} 次\n` +
    `- 预估节省人工排查时间：约 ${savedMinEstimate} 分钟\n\n` +
    `## 根因摘要\n\n` +
    (rootCauseTexts.length
      ? rootCauseTexts.slice(0, 20).map((t) => `- ${t.slice(0, 120)}`).join("\n") + "\n\n"
      : `- 该周期内暂无已定位根因的排查记录\n\n`);

  // LLM 分析（失败或为空时使用确定性兜底段落）
  let aiAnalysis = "";
  const statsBrief =
    `统计：排查${rows.length}次，成功${byStatus.success ?? 0}/失败${byStatus.failed ?? 0}，自动触发${autoCount}次，` +
    `取证${totalSteps}步，修复${totalRepairs}次，回滚${totalRollbacks}次，复检${totalRechecks}次，` +
    `已恢复${recoveredCount}次，仍异常${stillFailingCount}次，预估节省${savedMinEstimate}分钟。\n\n根因摘要：\n` +
    rootCauseTexts.slice(0, 15).map((t) => `- ${t.slice(0, 120)}`).join("\n") +
    (trend.text
      ? `\n\n趋势与预测：\n${trend.text.replace(/^##[^\n]*\n+/, "")}`
      : "\n\n趋势与预测：（暂无充足趋势数据）");
  try {
    const raw = await chatComplete({
      system: WEEKLY_SYSTEM_PROMPT,
      user: statsBrief,
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0.3,
      maxTokens: 1600,
      timeoutMs: 120_000,
    });
    const clean = (raw ?? "").trim();
    if (clean.length >= 60) aiAnalysis = clean;
  } catch (err) {
    console.error("[weekly] LLM summary failed:", (err as Error).message);
  }
  if (!aiAnalysis) {
    const topics = clusterRootCauses(rootCauseTexts);
    aiAnalysis =
      `## 周报分析（自动生成）\n\n` +
      `- 该周期共完成 ${rows.length} 次自主排查，其中 ${byStatus.success ?? 0} 次成功定位根因` +
      (byStatus.failed ? `、${byStatus.failed} 次执行失败` : "") +
      `，整体取证 ${totalSteps} 步。\n` +
      (topics.length
        ? `- 高频根因类型：${topics.map((t) => `“${t.text.slice(0, 40)}”（${t.count} 次）`).join("、")}。建议优先针对上述类型补充监控与预防策略。\n`
        : `- 本期未见明显重复故障模式。\n`) +
      `- 自动化闭环：已执行修复 ${totalRepairs} 次、自动回滚 ${totalRollbacks} 次、自动复检 ${totalRechecks} 次，复检确认已恢复 ${recoveredCount} 次` +
      (stillFailingCount ? `；仍有 ${stillFailingCount} 次判定为异常，建议人工跟进` : "") +
      `。\n- 价值量化：按人工逐步排查估算，本周期约节省 ${savedMinEstimate} 分钟的人工排查时间。\n` +
      `- 风险提示：请关注仍在运行/失败的排查（${(byStatus.running ?? 0) + (byStatus.failed ?? 0)} 次）与“仍异常”的修复项，必要时人工介入。`;
  }

  opts.onProgress?.({ label: "AI 运维周报", detail: "统计与趋势完成，正在撰写 AI 分析", current: 2, total: 3 });
  const markdown = header + (trend.text ? trend.text + "\n\n" : "") + (aiAnalysis.includes("## 周报分析") || aiAnalysis.startsWith("#") ? aiAnalysis + "\n" : `## AI 周报分析\n\n${aiAnalysis}\n`);

  // 后台异步沉淀为可检索记忆（不阻塞响应）
  void indexMemory(db, {
    workspaceId,
    serverId: opts.serverId ?? null,
    sourceType: "weekly",
    sourceId: `weekly-${opts.serverId ?? "workspace"}-${days}-${since.toISOString().slice(0, 10)}`,
    title: `AI 运维周报 · 近 ${days} 天 · ${opts.serverId ? "目标服务器" : "全部服务器"}`,
    content: (markdown || "").slice(0, 4000),
  });

  return {
    windowDays: days,
    since: since.toISOString(),
    until: until.toISOString(),
    scope: opts.serverId ? "server" : "workspace",
    serverId: opts.serverId ?? null,
    runCount: rows.length,
    byStatus,
    autoCount,
    totalSteps,
    avgSteps: rows.length ? Math.round((totalSteps / rows.length) * 10) / 10 : 0,
    totalRepairs,
    totalRollbacks,
    totalRechecks,
    recoveredCount,
    stillFailingCount,
    totalRunMs,
    savedMinEstimate,
    rootTopics: clusterRootCauses(rootCauseTexts),
    servers: serverStats,
    prevRunCount: trend.prevRunCount,
    prevSuccessCount: trend.prevSuccessCount,
    prevFailedCount: trend.prevFailedCount,
    diskForecasts: trend.diskForecasts,
    cpuTrends: trend.cpuTrends,
    uptimeTotal: trend.uptime.total,
    uptimeOk: trend.uptime.ok,
    uptimePct: trend.uptime.uptimePct,
    uptimePrevPct: trend.uptime.uptimePrevPct,
    trendText: trend.text,
    markdown,
    generatedAt,
  };
}

interface TrendOpts {
  days: number;
  since: Date;
  serverId?: string;
  runCount: number;
  successCount: number;
  failedCount: number;
}

// 趋势与预测：环比上个周期 + 容量/负载趋势 + 外部拨测可用率（全部基于库内真实数据，数据不足则不下结论）
async function buildTrend(
  workspaceId: string,
  db: DbClient,
  opts: TrendOpts
): Promise<{
  prevRunCount: number;
  prevSuccessCount: number;
  prevFailedCount: number;
  diskForecasts: WeeklyDiskForecast[];
  cpuTrends: WeeklyCpuTrend[];
  uptime: WeeklyUptimeTrend;
  text: string;
}> {
  const empty = {
    prevRunCount: 0,
    prevSuccessCount: 0,
    prevFailedCount: 0,
    diskForecasts: [] as WeeklyDiskForecast[],
    cpuTrends: [] as WeeklyCpuTrend[],
    uptime: { total: 0, ok: 0, uptimePct: null, uptimePrevPct: null, avgMs: null } as WeeklyUptimeTrend,
    text: "",
  };
  const { days, since, serverId, runCount, successCount } = opts;
  const dayMs = 86_400_000;
  const prevSince = new Date(since.getTime() - days * dayMs);
  const mid = new Date(since.getTime() + (days * dayMs) / 2);
  const prevIso = prevSince.toISOString();
  const sinceIso = since.toISOString();
  const midIso = mid.toISOString();
  const scoped = serverId ? sql`AND s.id = ${serverId}` : sql``;
  const scopedRuns = serverId ? sql`AND server_id = ${serverId}` : sql``;
  const num = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  try {
    // 1) 上周期（同样长度）自主排查量
    const prevRows = (
      (await db.execute(sql`
        SELECT status, count(*)::int AS n
        FROM diagnosis_runs
        WHERE workspace_id = ${workspaceId} ${scopedRuns}
          AND created_at >= ${prevIso}::timestamptz
          AND created_at < ${sinceIso}::timestamptz
        GROUP BY status
      `)).rows ?? []
    ) as { status: string | null; n: number }[];
    const prevStatus: Record<string, number> = {};
    for (const r of prevRows) prevStatus[r.status ?? "unknown"] = Number(r.n ?? 0);
    const prevTotal = Object.values(prevStatus).reduce((a, b) => a + b, 0);

    // 2) 磁盘使用趋势（前后半程均值差 → 日增速 → 写满 ETA）
    const diskRows = (
      (await db.execute(sql`
        SELECT s.id AS server_id, s.name AS name,
               count(*) FILTER (WHERE ms.time < ${midIso}::timestamptz)::int AS older_n,
               count(*) FILTER (WHERE ms.time >= ${midIso}::timestamptz)::int AS newer_n,
               round(avg(CASE WHEN ms.time < ${midIso}::timestamptz THEN ms.disk_used::float / nullif(ms.disk_total, 0) * 100 END)::numeric, 1)::float AS older_pct,
               round(avg(CASE WHEN ms.time >= ${midIso}::timestamptz THEN ms.disk_used::float / nullif(ms.disk_total, 0) * 100 END)::numeric, 1)::float AS newer_pct
        FROM metric_snapshots ms
        JOIN servers s ON s.id = ms.server_id
        WHERE s.workspace_id = ${workspaceId} ${scoped}
          AND ms.time >= ${sinceIso}::timestamptz
        GROUP BY s.id, s.name
      `)).rows ?? []
    ) as Record<string, unknown>[];
    const halfDays = days / 2;
    const diskForecasts: WeeklyDiskForecast[] = [];
    for (const r of diskRows) {
      const olderN = num(r.older_n) ?? 0;
      const newerN = num(r.newer_n) ?? 0;
      const olderPct = num(r.older_pct);
      const newerPct = num(r.newer_pct);
      if (olderN < 3 || newerN < 3 || olderPct == null || newerPct == null) continue;
      const growth = (newerPct - olderPct) / halfDays;
      const eta = growth > 0.15 ? Math.ceil((100 - newerPct) / growth) : null;
      diskForecasts.push({
        serverId: String(r.server_id),
        serverName: String(r.name ?? "未知服务器"),
        usedPct: Math.round(newerPct),
        growthPerDayPct: Math.round(growth * 10) / 10,
        etaDays: eta != null && eta > 0 ? eta : null,
      });
    }
    diskForecasts.sort((a, b) => (a.etaDays ?? 9999) - (b.etaDays ?? 9999) || b.usedPct - a.usedPct);

    // 3) CPU 负载趋势（仅提示显著变化）
    const cpuRows = (
      (await db.execute(sql`
        SELECT s.id AS server_id, s.name AS name,
               count(*) FILTER (WHERE ms.time < ${midIso}::timestamptz)::int AS older_n,
               count(*) FILTER (WHERE ms.time >= ${midIso}::timestamptz)::int AS newer_n,
               round(avg(CASE WHEN ms.time < ${midIso}::timestamptz THEN ms.cpu_percent END)::numeric, 1)::float AS older_cpu,
               round(avg(CASE WHEN ms.time >= ${midIso}::timestamptz THEN ms.cpu_percent END)::numeric, 1)::float AS newer_cpu
        FROM metric_snapshots ms
        JOIN servers s ON s.id = ms.server_id
        WHERE s.workspace_id = ${workspaceId} ${scoped}
          AND ms.time >= ${sinceIso}::timestamptz
        GROUP BY s.id, s.name
      `)).rows ?? []
    ) as Record<string, unknown>[];
    const cpuTrends: WeeklyCpuTrend[] = [];
    for (const r of cpuRows) {
      const olderN = num(r.older_n) ?? 0;
      const newerN = num(r.newer_n) ?? 0;
      const olderCpu = num(r.older_cpu);
      const newerCpu = num(r.newer_cpu);
      if (olderN < 3 || newerN < 3 || olderCpu == null || newerCpu == null) continue;
      if (Math.abs(newerCpu - olderCpu) < 8) continue;
      cpuTrends.push({
        serverId: String(r.server_id),
        serverName: String(r.name ?? "未知服务器"),
        olderAvgPct: Math.round(olderCpu),
        newerAvgPct: Math.round(newerCpu),
      });
    }

    // 4) 外部拨测可用率趋势（工作区级监控探针）
    const probeRows = (
      (await db.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE pr.is_success)::int AS ok,
               count(*) FILTER (WHERE pr.time < ${midIso}::timestamptz)::int AS older_n,
               count(*) FILTER (WHERE pr.is_success AND pr.time < ${midIso}::timestamptz)::int AS older_ok,
               round(avg(pr.response_ms))::int AS avg_ms
        FROM probe_results pr
        JOIN monitor_tasks mt ON mt.id = pr.task_id
        WHERE mt.workspace_id = ${workspaceId}
          AND pr.time >= ${sinceIso}::timestamptz
      `)).rows ?? []
    ) as Record<string, unknown>[];
    const pr = probeRows[0] ?? {};
    const total = num(pr.total) ?? 0;
    const ok = num(pr.ok) ?? 0;
    const olderN = num(pr.older_n) ?? 0;
    const olderOk = num(pr.older_ok) ?? 0;
    const uptime: WeeklyUptimeTrend = {
      total,
      ok,
      uptimePct: total >= 20 ? Math.round((ok / total) * 1000) / 10 : null,
      uptimePrevPct: olderN >= 10 ? Math.round((olderOk / olderN) * 1000) / 10 : null,
      avgMs: num(pr.avg_ms),
    };

    // 5) 确定性「趋势与预测」段落
    const lines: string[] = [];
    if (prevTotal > 0) {
      const delta = runCount - prevTotal;
      const pct = Math.round((delta / prevTotal) * 100);
      const d = successCount - (prevStatus.success ?? 0);
      lines.push(`- 排查量环比上周期（前 ${days} 天）：${runCount} 次 / 上周期 ${prevTotal} 次（${delta >= 0 ? "+" : ""}${delta}，${pct >= 0 ? "+" : ""}${pct}%）`);
      lines.push(
        d === 0
          ? `- 成功定位次数与上周期持平（${successCount} 次）`
          : `- 成功定位 ${successCount} 次（上周期 ${prevStatus.success ?? 0} 次，${d > 0 ? "增加" : "减少"} ${Math.abs(d)} 次）`
      );
    } else if (runCount > 0) {
      lines.push(`- 上周期无排查记录，本周期排查 ${runCount} 次，活动量上升`);
    }
    for (const f of diskForecasts.slice(0, 2)) {
      if (f.etaDays != null) {
        lines.push(`- 【容量预警】${f.serverName} 磁盘使用率已 ${f.usedPct}%（日均增长约 ${f.growthPerDayPct}%），按当前增速预计约 ${f.etaDays} 天后写满，建议提前清理或扩容`);
      } else if (f.usedPct >= 85) {
        lines.push(`- ${f.serverName} 磁盘使用率已达 ${f.usedPct}%，增速平缓（${f.growthPerDayPct}%/天），建议日常巡检关注`);
      } else {
        lines.push(`- ${f.serverName} 磁盘使用率 ${f.usedPct}%，日均增速 ${f.growthPerDayPct >= 0 ? "+" : ""}${f.growthPerDayPct}%，暂无写满风险`);
      }
    }
    for (const c of cpuTrends.slice(0, 2)) {
      const up = c.newerAvgPct >= c.olderAvgPct;
      lines.push(
        up
          ? `- ${c.serverName} CPU 均值由 ${c.olderAvgPct}% 升至 ${c.newerAvgPct}%，负载上行，建议关注是否需要扩容或排查`
          : `- ${c.serverName} CPU 均值由 ${c.olderAvgPct}% 回落至 ${c.newerAvgPct}%，负载下行，趋于缓解`
      );
    }
    if (uptime.uptimePct != null) {
      const fails = total - ok;
      lines.push(
        `- 外部拨测可用率 ${uptime.uptimePct.toFixed(1)}%（本周期 ${total} 次${fails ? `，${fails} 次失败` : ""}` +
          (uptime.uptimePrevPct != null ? `；上周期 ${uptime.uptimePrevPct.toFixed(1)}%` : "") +
          (uptime.avgMs != null ? `，平均响应 ${uptime.avgMs}ms` : "") +
          `）`
      );
    }

    return {
      prevRunCount: prevTotal,
      prevSuccessCount: Number(prevStatus.success ?? 0),
      prevFailedCount: Number(prevStatus.failed ?? 0),
      diskForecasts: diskForecasts.slice(0, 3),
      cpuTrends: cpuTrends.slice(0, 3),
      uptime,
      text: lines.length ? `## 趋势与预测\n\n${lines.join("\n")}\n` : "",
    };
  } catch (err) {
    console.error("[weekly] trend computation failed:", (err as Error).message);
    return empty;
  }
}