import { and, desc, eq, inArray, gte, sql } from "drizzle-orm";
import { inspectionReports } from "../db/schema/inspection-reports";
import { servers } from "../db/schema/servers";
import { alertRules } from "../db/schema/alert-rules";
import { alertEvents } from "../db/schema/alert-events";
import { AppError } from "../utils/errors";
import { chatComplete, extractJson } from "./llm-client";
import { executeShellCommand } from "./tools.service";
import { dispatchAlert } from "./notification-dispatcher";
import { maybeStartAutoDiagnosis } from "./diagnosis.service";
import type { DbClient } from "../db/index";
import { indexMemory } from "./memory.service";
import { resolveAiLlm } from "./ai-settings.service";

// Types

export interface InspectionFinding {
  level: "error" | "warning" | "info";
  category: string;
  title: string;
  detail: string;
  evidence: string;
  suggestion: string;
}

interface InspectionJson {
  health_score: number;
  summary: string;
  findings: InspectionFinding[];
}

export interface MetricsSummary {
  cpuAvg?: number;
  cpuMax?: number;
  memAvgPct?: number;
  memMaxPct?: number;
  diskAvgPct?: number;
  diskMaxPct?: number;
  load1Avg?: number;
  netInMB?: number;
  netOutMB?: number;
  gpuName?: string | null;
  gpuUtilAvg?: number;
}

export interface CollectResult {
  server: { id: string; name: string; host: string };
  metrics: MetricsSummary;
  probes: { total: number; ok: number; avgMs: number | null };
  unresolvedAlerts: Record<string, number>;
  cronFailures: number;
  liveOutput: string;
}

// Collection

const LIVE_COMMAND = [
  "echo '===== df -h ====='; df -h",
  "echo '===== free -m ====='; free -m",
  "echo '===== uptime ====='; uptime",
  "echo '===== loadavg ====='; cat /proc/loadavg",
  "echo '===== failed services ====='; systemctl --failed --no-pager | head -15",
  "echo '===== top cpu ====='; ps -eo pcpu,pmem,comm --sort=-pcpu | head -8",
  "echo '===== top mem ====='; ps -eo pmem,pcpu,comm --sort=-pmem | head -8",
].join("; ");

async function collect(
  workspaceId: string,
  serverId: string,
  db: DbClient,
  hours = 24
): Promise<CollectResult> {
  const [server] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
    .limit(1);
  if (!server) throw AppError.notFound("Server", serverId);

  const hostInfo = (server.hostInfo as Record<string, unknown>) ?? {};
  const host = (hostInfo.agent_host as string) || "";

  // 1) Time-series metrics (24h)
  const metricsRows = await db.execute(sql`
    SELECT
      round(avg(cpu_percent))::int AS cpu_avg,
      max(cpu_percent)::int AS cpu_max,
      round(avg(mem_used::float / nullif(mem_total, 0) * 100))::int AS mem_avg_pct,
      round(max(mem_used::float / nullif(mem_total, 0) * 100))::int AS mem_max_pct,
      round(avg(disk_used::float / nullif(disk_total, 0) * 100))::int AS disk_avg_pct,
      round(max(disk_used::float / nullif(disk_total, 0) * 100))::int AS disk_max_pct,
      round(avg(load_1), 2) AS load1_avg,
      round(greatest(0, max(net_in_bytes) - min(net_in_bytes))::float / 1048576)::int AS net_in_mb,
      round(greatest(0, max(net_out_bytes) - min(net_out_bytes))::float / 1048576)::int AS net_out_mb,
      max(gpu_name) AS gpu_name,
      round(avg(gpu_util_percent))::int AS gpu_util_avg
    FROM metric_snapshots
    WHERE server_id = ${serverId} AND time >= now() - make_interval(hours => ${hours})
  `);
  const m = (metricsRows.rows[0] ?? {}) as Record<string, unknown>;
  const metrics: MetricsSummary = {
    cpuAvg: m.cpu_avg as number | undefined,
    cpuMax: m.cpu_max as number | undefined,
    memAvgPct: m.mem_avg_pct as number | undefined,
    memMaxPct: m.mem_max_pct as number | undefined,
    diskAvgPct: m.disk_avg_pct as number | undefined,
    diskMaxPct: m.disk_max_pct as number | undefined,
    load1Avg: m.load1_avg as number | undefined,
    netInMB: m.net_in_mb as number | undefined,
    netOutMB: m.net_out_mb as number | undefined,
    gpuName: (m.gpu_name as string) || null,
    gpuUtilAvg: m.gpu_util_avg as number | undefined,
  };

  // 2) Probes (monitors) in workspace, last 24h
  const probeRows = await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE pr.is_success)::int AS ok,
           round(avg(pr.response_ms))::int AS avg_ms
    FROM probe_results pr
    JOIN monitor_tasks mt ON mt.id = pr.task_id
    WHERE mt.workspace_id = ${workspaceId} AND pr.time >= now() - make_interval(hours => ${hours})
  `);
  const pr = probeRows.rows[0] ?? {};
  const probes = {
    total: (pr as any).total ?? 0,
    ok: (pr as any).ok ?? 0,
    avgMs: (pr as any).avg_ms ?? null,
  };

  // 3) Unresolved alert events by severity
  const alertRows = await db.execute(sql`
    SELECT ae.severity, count(*)::int AS n
    FROM alert_events ae
    JOIN alert_rules ar ON ar.id = ae.rule_id
    WHERE ar.workspace_id = ${workspaceId}
      AND ae.is_resolved = false
      AND ae.created_at >= now() - make_interval(hours => ${hours})
    GROUP BY ae.severity
  `);
  const unresolvedAlerts: Record<string, number> = {};
  for (const r of alertRows.rows as { severity: string; n: number }[]) {
    unresolvedAlerts[r.severity] = r.n;
  }

  // 4) Cron failures in workspace, last 24h
  const cronRows = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM cron_executions ce
    JOIN cron_jobs cj ON cj.id = ce.job_id
    WHERE cj.workspace_id = ${workspaceId}
      AND ce.status IN ('failed', 'error', 'timeout')
      AND ce.created_at >= now() - make_interval(hours => ${hours})
  `);
  const cronFailures = Number((cronRows.rows[0] as any)?.n ?? 0);

  // 5) Live diagnostics via the agent (best-effort)
  let liveOutput = "(agent diagnostic unavailable)";
  if (host && server.isOnline) {
    try {
      const res = await executeShellCommand(workspaceId, serverId, { command: LIVE_COMMAND, timeout: 30 }, db);
      liveOutput = res.stdout || res.stderr || "(empty output)";
    } catch (err) {
      liveOutput = `(agent diagnostic failed: ${(err as Error).message})`;
    }
  }

  return {
    server: { id: server.id, name: server.name, host },
    metrics,
    probes,
    unresolvedAlerts,
    cronFailures,
    liveOutput: liveOutput.slice(0, 8000),
  };
}

// LLM analysis

const SYSTEM_PROMPT = `你是 ProberX 平台的资深 Linux 运维专家，负责生成服务器健康巡检报告。
根据提供的「历史指标摘要」「监控探测」「告警」「定时任务」「实时诊断」数据，只依据数据本身分析，严禁编造数值。
输出严格的 JSON（不要 Markdown 代码块，不要任何多余文字），结构如下：
{
  "health_score": 0到100的整数,
  "summary": "总体健康结论，中文，2到4句话",
  "findings": [
    {
      "level": "error 或 warning 或 info",
      "category": "cpu|memory|disk|network|service|security|probe|cron|other",
      "title": "简短标题",
      "detail": "问题描述，1到2句话",
      "evidence": "引用的具体数据（必须来自提供的数据）",
      "suggestion": "可执行的具体建议（可含命令）"
    }
  ]
}
规则：level=error 表示已发生的故障；level=warning 表示风险或阈值临近；level=info 表示正常观察或建议优化。
findings 至少 3 条、最多 12 条。health_score 与 findings 严重程度一致（有 error 则低于 70，多个 error 适当更低）。`;

function buildUserPrompt(c: CollectResult, hours: number): string {
  const mm = c.metrics;
  const lines: string[] = [];
  lines.push(`服务器：${c.server.name}（${c.server.host || "unknown"}），巡检窗口：近 ${hours} 小时`);
  lines.push("");
  lines.push("【历史指标摘要】");
  lines.push(`  CPU：平均 ${mm.cpuAvg ?? "N/A"}%，峰值 ${mm.cpuMax ?? "N/A"}%`);
  lines.push(`  内存：平均使用率 ${mm.memAvgPct ?? "N/A"}%，峰值 ${mm.memMaxPct ?? "N/A"}%`);
  lines.push(`  磁盘：平均使用率 ${mm.diskAvgPct ?? "N/A"}%，峰值 ${mm.diskMaxPct ?? "N/A"}%`);
  lines.push(`  负载(1min)：平均 ${mm.load1Avg ?? "N/A"}；流入 ${mm.netInMB ?? 0}MB / 流出 ${mm.netOutMB ?? 0}MB`);
  if (mm.gpuName) lines.push(`  GPU：${mm.gpuName}，平均利用率 ${mm.gpuUtilAvg ?? "N/A"}%`);
  lines.push("");
  lines.push("【监控探测（工作空间，近24h）】");
  lines.push(`  总探测 ${c.probes.total} 次，成功 ${c.probes.ok} 次，成功率 ${c.probes.total ? Math.round((c.probes.ok / c.probes.total) * 100) : 100}%，平均响应 ${c.probes.avgMs ?? "N/A"}ms`);
  lines.push("");
  lines.push("【未解决告警（近24h）】");
  const sev = Object.entries(c.unresolvedAlerts);
  lines.push(sev.length ? sev.map(([k, v]) => `  ${k}: ${v} 条`).join("\n") : "  无");
  lines.push("");
  lines.push("【定时任务失败（近24h）】");
  lines.push(`  失败 ${c.cronFailures} 次`);
  lines.push("");
  lines.push("【实时诊断输出（Agent 采集）】");
  lines.push(c.liveOutput.slice(0, 6000));
  return lines.join("\n");
}

// Report rendering

function renderMarkdown(c: CollectResult, report: InspectionJson): string {
  const l: string[] = [];
  l.push(`# ${c.server.name} 健康巡检报告`);
  l.push("");
  l.push(`- **健康评分**：${report.health_score ?? "N/A"} / 100`);
  l.push(`- **巡检范围**：近 24 小时指标 + Agent 实时诊断`);
  l.push("");
  l.push("## 总体结论");
  l.push("");
  l.push(report.summary || "暂无结论");
  l.push("");
  l.push("## 发现项");
  l.push("");
  if (!report.findings?.length) {
    l.push("_未发现明显问题。_");
  }
  for (const f of report.findings ?? []) {
    l.push(`### [${f.level.toUpperCase()}] ${f.title}`);
    l.push("");
    l.push(`- **类别**：${f.category}`);
    l.push(`- **详情**：${f.detail}`);
    l.push(`- **证据**：${f.evidence}`);
    l.push(`- **建议**：${f.suggestion}`);
    l.push("");
  }
  l.push("## 指标摘要");
  l.push("");
  l.push("| 指标 | 值 |");
  l.push("| --- | --- |");
  l.push(`| CPU 平均/峰值 | ${c.metrics.cpuAvg ?? "-"}% / ${c.metrics.cpuMax ?? "-"}% |`);
  l.push(`| 内存平均/峰值 | ${c.metrics.memAvgPct ?? "-"}% / ${c.metrics.memMaxPct ?? "-"}% |`);
  l.push(`| 磁盘平均/峰值 | ${c.metrics.diskAvgPct ?? "-"}% / ${c.metrics.diskMaxPct ?? "-"}% |`);
  l.push(`| 探测成功率 | ${c.probes.total ? `${Math.round((c.probes.ok / c.probes.total) * 100)}% (${c.probes.ok}/${c.probes.total})` : "-"} |`);
  l.push(`| 平均响应 | ${c.probes.avgMs ?? "-"} ms |`);
  l.push(`| 未解决告警 | ${Object.values(c.unresolvedAlerts).reduce((a, b) => a + b, 0) || 0} 条 |`);
  l.push(`| 定时任务失败 | ${c.cronFailures} 次 |`);
  l.push("");
  l.push(`_由 ProberX AI 巡检生成 · ${new Date().toLocaleString("zh-CN")}_`);
  return l.join("\n");
}

export function renderHtml(report: { title: string; healthScore: number | null; summary: string | null | undefined; findings: InspectionFinding[]; markdown: string | null | undefined; createdAt: string | null | undefined }): string {
  const score = report.healthScore ?? 0;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const findingHtml = (report.findings ?? [])
    .map((f) => {
      const c = f.level === "error" ? "#ef4444" : f.level === "warning" ? "#f59e0b" : "#3b82f6";
      return `<div style="border:1px solid #e5e7eb;border-left:4px solid ${c};border-radius:8px;padding:12px 16px;margin:10px 0">
        <div style="font-weight:600;color:${c}">[${f.level.toUpperCase()}] ${f.title}</div>
        <div style="margin-top:6px;color:#374151">${f.detail}</div>
        <div style="margin-top:4px;color:#6b7280;font-size:13px"><b>证据：</b>${f.evidence}</div>
        <div style="margin-top:4px;color:#6b7280;font-size:13px"><b>建议：</b>${f.suggestion}</div>
      </div>`;
    })
    .join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${report.title}</title>
<body style="font-family:-apple-system,'Segoe UI','PingFang SC',sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#111827">
<h1 style="font-size:22px">${report.title}</h1>
<div style="display:flex;gap:24px;align-items:center;margin:16px 0">
  <svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" stroke-width="12"/>
    <circle cx="60" cy="60" r="50" fill="none" stroke="${color}" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${(score / 100) * 314} 314"
      transform="rotate(-90 60 60)"/>
    <text x="60" y="62" text-anchor="middle" dominant-baseline="middle"
      fill="${color}" font-size="26" font-weight="700">${score}</text>
  </svg>
  <div><div style="font-size:14px;color:#6b7280">健康评分（满分 100）</div>
  <div style="font-size:13px;color:#6b7280;margin-top:4px">生成时间：${report.createdAt ?? ""}</div></div>
</div>
<h2 style="font-size:17px;margin-top:20px">总体结论</h2>
<p style="color:#374151;line-height:1.7">${report.summary ?? ""}</p>
<h2 style="font-size:17px;margin-top:24px">发现项（${(report.findings ?? []).length}）</h2>
${findingHtml}
<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
<pre style="background:#f9fafb;padding:16px;border-radius:8px;overflow:auto;font-size:13px;color:#374151">${(report.markdown ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
<p style="color:#9ca3af;font-size:12px;margin-top:16px">由 ProberX AI 巡检生成</p>
</body></html>`;
}

// Alert integration

async function ensureInspectionRule(workspaceId: string, db: DbClient) {
  const [existing] = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.workspaceId, workspaceId), eq(alertRules.metric, "ai_inspection")))
    .limit(1);
  if (existing) return existing;
  const [rule] = await db
    .insert(alertRules)
    .values({
      workspaceId,
      name: "AI 巡检报告",
      targetType: "server",
      metric: "ai_inspection",
      operator: "gte",
      threshold: "1",
      durationSec: 0,
      severity: "warning",
      isEnabled: true,
    })
    .returning();
  return rule;
}

async function pushFindings(workspaceId: string, serverId: string, report: InspectionJson, db: DbClient) {
  const critical = (report.findings ?? []).filter((f) => f.level === "error" || f.level === "warning");
  if (critical.length === 0) return;
  const rule = await ensureInspectionRule(workspaceId, db);
  if (!rule.isEnabled) return;
  const worst = critical[0].level === "error" ? "warning" : "warning";
  const message = `AI 巡检发现 ${critical.length} 项问题（评分 ${report.health_score}/100）：${critical.slice(0, 3).map((f) => f.title).join("；")}`;
  const [event] = await db
    .insert(alertEvents)
    .values({ ruleId: rule.id, serverId, severity: worst, message })
    .returning();
  await dispatchAlert(db, {
    workspaceId,
    eventId: event.id,
    ruleName: rule.name,
    severity: worst,
    message,
  });
}

// Core: generate a report

export async function generateReport(
  workspaceId: string,
  serverId: string,
  opts: { title?: string; hours?: number; trigger?: "manual" | "schedule"; onProgress?: (p: { label: string; detail?: string; current: number; total: number }) => void },
  db: DbClient
) {
  const hours = Math.min(Math.max(opts.hours ?? 24, 1), 168);
  const [server] = await db
    .select({ name: servers.name })
    .from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
    .limit(1);
  if (!server) throw AppError.notFound("Server", serverId);

  // AI 接口可配置到工作区设置；未启用时自动回退服务器环境变量
  const llm = await resolveAiLlm(db, workspaceId);
  const reportId = crypto.randomUUID();
  await db.insert(inspectionReports).values({
    id: reportId,
    workspaceId,
    serverId,
    title: opts.title || `${server.name} 健康巡检报告`,
    status: "running",
    trigger: opts.trigger ?? "manual",
  });

  try {
    const collected = await collect(workspaceId, serverId, db, hours);
    opts.onProgress?.({ label: "AI 巡检 · 指标采集", detail: "已完成 24h 指标采集，进入 AI 分析", current: 2, total: 3 });
    const userPrompt = buildUserPrompt(collected, hours);
    let raw = await chatComplete({ system: SYSTEM_PROMPT, user: userPrompt, apiUrl: llm.apiUrl, apiKey: llm.apiKey, model: llm.model, maxTokens: 8192, timeoutMs: 120_000 });
    let parsed: InspectionJson;
    try {
      parsed = extractJson<InspectionJson>(raw);
    } catch {
      // retry once: DeepSeek occasionally truncates long output, breaking JSON
      raw = await chatComplete({ system: SYSTEM_PROMPT + "\n再次强调：只输出一个完整合法的 JSON 对象，不要 Markdown，不要省略号。", user: userPrompt, apiUrl: llm.apiUrl, apiKey: llm.apiKey, model: llm.model, maxTokens: 8192, timeoutMs: 120_000 });
      parsed = extractJson<InspectionJson>(raw);
    }
    if (!Number.isFinite(parsed.health_score)) parsed.health_score = 60;
    parsed.health_score = Math.max(0, Math.min(100, Math.round(parsed.health_score)));
    if (!Array.isArray(parsed.findings)) parsed.findings = [];
    parsed.findings = parsed.findings.slice(0, 12);
    const markdown = renderMarkdown(collected, parsed);

    await db
      .update(inspectionReports)
      .set({
        status: "done",
        healthScore: parsed.health_score,
        summary: parsed.summary ?? "",
        findings: parsed.findings as unknown as Record<string, unknown>[],
        metricsSummary: collected.metrics as unknown as Record<string, unknown>,
        markdown,
        rawEvidence: collected.liveOutput.slice(0, 12000),
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(inspectionReports.id, reportId));

    await pushFindings(workspaceId, serverId, parsed, db).catch((e) => {
      console.error("[inspection] alert push failed:", (e as Error).message);
    });

    await maybeStartAutoDiagnosis(workspaceId, serverId, parsed.findings, db).catch((e) => {
      console.error("[inspection] auto diagnosis trigger failed:", (e as Error).message);
    });

    // 后台异步沉淀为可检索记忆（不阻塞响应）
    void indexMemory(db, {
      workspaceId,
      serverId,
      sourceType: "inspection",
      sourceId: reportId,
      title: (opts.title || `${server.name} 健康巡检报告`).slice(0, 200),
      content: `健康评分：${parsed.health_score}/100\n总结：${(parsed.summary ?? "").slice(0, 900)}\n\n${(markdown ?? "").slice(0, 3200)}`,
    });

    opts.onProgress?.({ label: "AI 巡检", detail: "正在生成健康报告", current: 3, total: 3 });
    return { id: reportId, status: "done" as const, healthScore: parsed.health_score };
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(inspectionReports)
      .set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date() })
      .where(eq(inspectionReports.id, reportId));
    throw err;
  }
}

// Queries

export async function listReports(workspaceId: string, db: DbClient, limit = 50, serverId?: string) {
  const conds = [eq(inspectionReports.workspaceId, workspaceId)];
  if (serverId) conds.push(eq(inspectionReports.serverId, serverId));
  return db
    .select({
      id: inspectionReports.id,
      serverId: inspectionReports.serverId,
      title: inspectionReports.title,
      trigger: inspectionReports.trigger,
      status: inspectionReports.status,
      healthScore: inspectionReports.healthScore,
      summary: inspectionReports.summary,
      findings: inspectionReports.findings,
      createdAt: inspectionReports.createdAt,
      finishedAt: inspectionReports.finishedAt,
      error: inspectionReports.error,
    })
    .from(inspectionReports)
    .where(and(...conds))
    .orderBy(desc(inspectionReports.createdAt))
    .limit(limit);
}

export async function getReport(workspaceId: string, reportId: string, db: DbClient) {
  const [row] = await db
    .select()
    .from(inspectionReports)
    .where(and(eq(inspectionReports.id, reportId), eq(inspectionReports.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw AppError.notFound("Inspection report", reportId);
  return row;
}

export async function deleteReport(workspaceId: string, reportId: string, db: DbClient) {
  const [row] = await db
    .delete(inspectionReports)
    .where(and(eq(inspectionReports.id, reportId), eq(inspectionReports.workspaceId, workspaceId)))
    .returning({ id: inspectionReports.id });
  if (!row) throw AppError.notFound("Inspection report", reportId);
  return row;
}