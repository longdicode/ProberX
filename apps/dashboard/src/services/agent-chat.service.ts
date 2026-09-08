import { chatComplete } from "./llm-client";
import { generateReport } from "./inspection.service";
import { startDiagnosis, getRun } from "./diagnosis.service";
import { buildWeekly } from "./weekly.service";
import { generateShellCommand, executeShellCommand } from "./tools.service";
import * as workflowSvc from "./workflow.service";
import { recallMemory, memorySourceLabel, indexMemory, latestMemoryByType } from "./memory.service";
import { EXPERT_BY_ID, isExpertAgent, routeExpert, matchExpertByName } from "./expert-agents";
import type { ExpertAgentId } from "./expert-agents";
import { resolveAiLlm } from "./ai-settings.service";
import type { ResolvedAiLlm } from "./ai-settings.service";
import type { DbClient } from "../db/index";
import type { MemoryHit } from "./memory.service";

// Agent registry

export const AGENTS = [
  { id: "assistant", name: "通用助手", desc: "日常问答与运维知识", icon: "Sparkles", color: "#6366f1" },
  { id: "inspection", name: "AI 巡检", desc: "健康巡检与风险报告", icon: "Stethoscope", color: "#10b981" },
  { id: "diagnosis", name: "自主排查", desc: "多步取证定位根因", icon: "Workflow", color: "#8b5cf6" },
  { id: "terminal", name: "AI 终端", desc: "自然语言生成并执行命令", icon: "Terminal", color: "#f59e0b" },
  { id: "weekly", name: "AI 运维周报", desc: "自然语言汇总周期运维与价值", icon: "BarChart3", color: "#0ea5e9" },
] as const;

export type AgentId = "assistant" | "inspection" | "diagnosis" | "terminal" | "workflow" | "weekly" | ExpertAgentId;

const SYSTEM_PROMPTS: Partial<Record<AgentId, string>> = {
  assistant: `你是 ProberX 的智能运维助手。用户会向你咨询服务器运维、Linux 命令、网络、容器、网站等方面的问题。
系统已开启智能路由：需要巡检、故障排查、执行命令或运行工作流时，会自动调用对应能力并直接执行，无需用户切换，也无需你建议切换。
你的职责：
1. 对需要查证服务器或网站实际情况的问题，直接说明你将执行什么操作，不要凭空编造结论。
2. 回答保持简洁、专业，优先给出可执行的结论或下一步。
3. 命令执行、巡检、排查、工作流的执行过程与结果由系统展示，你只需简要衔接即可。`,
  inspection: `你是 ProberX 的 AI 巡检专家。当用户要求巡检服务器或询问服务器健康状况时，你负责启动巡检流程并解读结果。
规则：
1. 直接确认已为用户发起巡检，简要说明将采集哪些指标（CPU/内存/磁盘/负载/进程/服务/监控探针）。
2. 不要捏造健康数据，等待巡检结果返回后再解读。
3. 回复保持简短（60 字内）。`,
  diagnosis: `你是 ProberX 的自主排障专家。当用户描述一个故障现象（如磁盘满、504、CPU 高）时，你负责启动多步取证排查并汇报进展。
规则：
1. 直接确认已发起自主排查，说明会通过只读命令逐步取证。
2. 不要捏造排查结果，等待时间线返回后再总结根因。
3. 回复保持简短（60 字内）。`,
  terminal: `你是 ProberX 的 AI 终端助手。用户会用自然语言描述想做的操作（如"查看磁盘使用"），你负责生成并执行对应 shell 命令。
规则：
1. 直接执行，不要询问确认（只读命令安全）。
2. 命令必须安全、只读优先；涉及修改的命令先向用户说明风险。`,
  weekly: `你是 ProberX 的运维汇报助手。用户会要求生成某段时间的「AI 运维周报」，或用自然语言询问该周期的运维情况（如"这周怎么样""有什么风险"）。
你会自动汇总周期内的自主排查记录并生成周报统计，然后基于真实统计用简洁、自然的中文向用户汇报，不假装执行了实时巡检或排查，不编造数据。`,
};

// In-memory task store

export interface AgentStep {
  id: string;
  tool: string;
  kind?: string;
  args?: string;
  status: "running" | "done" | "error";
  output?: string;
  exitCode?: number;
  startedAt: number;
  finishedAt?: number;
}

export interface AgentTask {
  id: string;
  workspaceId: string;
  serverId: string;
  agent: AgentId;
  message: string;
  status: "running" | "done" | "failed";
  kind: "text" | "inspection" | "diagnosis" | "terminal" | "workflow" | "weekly";
  steps: AgentStep[];
  text: string;
  linkHref?: string;
  error?: string;
  progress?: TaskProgress | null;
  createdAt: number;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface TaskProgress {
  label: string;
  detail?: string;
  current?: number;
  total?: number;
}

const tasks = new Map<string, AgentTask>();
const TASK_TTL_MS = 30 * 60 * 1000;

// periodic cleanup of stale tasks
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of tasks) {
    if (now - t.createdAt > TASK_TTL_MS) tasks.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

function stepId() { return Math.random().toString(36).slice(2, 10); }

function pushStep(task: AgentTask, tool: string, args?: string, kind?: string) {
  const s: AgentStep = { id: stepId(), tool, kind, args, status: "running", startedAt: Date.now() };
  task.steps.push(s);
  return s;
}
function endStep(step: AgentStep, status: "done" | "error", output?: string, exitCode?: number) {
  step.status = status;
  step.output = output;
  step.exitCode = exitCode;
  step.finishedAt = Date.now();
}

// 记忆检索步骤：召回历史相似记录并落到任务时间线（对话中可见“工具调用”）
async function recallAndStep(
  task: AgentTask,
  db: DbClient,
  query: string,
  opts: { workspaceId: string; serverId: string }
): Promise<{ hits: MemoryHit[]; text: string }> {
  const step = pushStep(task, "记忆检索", `检索相似历史：${query.slice(0, 60)}`, "memory");
  try {
    const hits = await recallMemory(db, { workspaceId: opts.workspaceId, serverId: opts.serverId, query, topK: 5, minScore: 0.32 });
    const text = hits.length
      ? hits
          .map((h, i) => `${i + 1}. [${memorySourceLabel(h.sourceType)}] ${h.title}（相似度 ${Math.round(h.similarity * 100)}%）`)
          .join("\n")
      : "未命中相似历史记录";
    endStep(step, "done", text, 0);
    return { hits, text };
  } catch (err) {
    endStep(step, "error", String((err as Error).message));
    return { hits: [], text: "" };
  }
}

function setProgress(task: AgentTask, p: TaskProgress) {
  task.progress = p;
}

// 站点盘点意图：问“这台服务器部署/运行了哪些网站/站点/虚拟主机”时走确定性盘点流程
function isSiteInventoryAsk(message: string): boolean {
  const m = message.trim();
  const hasTopic = /(网站|站点|虚拟主机|域名|web|服务端口)/i.test(m);
  const hasAsk = /(盘点|列出|有哪些|哪些|什么网站|什么站点|列表|清单|部署了哪些|运行了哪些|都部署|几个网站|几个站点|全部站点)/.test(m);
  if (!hasTopic || !hasAsk) return false;
  // 属于故障/监控语义时不要截胡（那些应走自主排查/巡检）
  if (/(打不开|无法访问|访问不了|504|502|500|宕机|异常|故障|原因|排查|监控|告警|健康|卡|慢|超时|拒绝)/i.test(m)) return false;
  return true;
}

// 确定性只读盘点脚本：兼容 Debian 标准 Nginx 与宝塔面板 vhost 布局
function buildSiteInventoryCommand(): string {
  return [
    'echo "===VHOST-CONF==="',
    'for d in /etc/nginx/sites-enabled /etc/nginx/conf.d /www/server/panel/vhost/nginx /www/server/nginx/conf/vhost /usr/local/nginx/conf/vhost; do',
    '  [ -d "$d" ] || continue',
    '  for f in "$d"/*; do',
    '    [ -f "$f" ] || continue',
    '    echo "## file: $f"',
    '    grep -E "server_name|listen |proxy_pass|root " "$f" 2>/dev/null | head -60',
    '  done',
    'done',
    'echo "===WWWROOT==="',
    'ls -1 /www/wwwroot 2>/dev/null',
    'echo "===DOCKER==="',
    'if command -v docker >/dev/null 2>&1; then docker ps --format "{{.Names}} | {{.Ports}} | {{.Image}}"; else echo "(no docker)"; fi',
    'echo "===LISTEN==="',
    'ss -tln 2>/dev/null | grep -E ":(80|443)\\b" | head -20',
  ].join("\n");
}

// 确定性兜底：LLM 汇总失败/空输出时，直接从 vhost 扫描数据解析站点清单
function fallbackSiteList(raw: string): string {
  const lines: string[] = [];
  let curFile = "";
  let names = new Set<string>();
  let listens: string[] = [];
  let proxies: string[] = [];
  let roots: string[] = [];
  const flush = () => {
    if (!curFile || names.size === 0) return;
    const parts = [`配置 ${curFile}`];
    parts.push(`域名: ${[...names].join(", ")}`);
    if (listens.length) parts.push(`监听: ${[...new Set(listens)].join(", ")}`);
    if (proxies.length) parts.push(`反代: ${[...new Set(proxies)].join(", ")}`);
    if (roots.length) parts.push(`目录: ${[...new Set(roots)].join(", ")}`);
    lines.push("- " + parts.join("；"));
  };
  for (const row of raw.split("\n")) {
    const fm = /^## file:\s*(.+)$/.exec(row.trim());
    if (fm) { flush(); curFile = fm[1]; names = new Set(); listens = []; proxies = []; roots = []; continue; }
    const nm = /^\s*server_name\s+(.+?);/.exec(row);
    if (nm) nm[1].split(/\s+/).filter(Boolean).forEach((d) => names.add(d));
    const lm = /^\s*listen\s+([^;]+);/.exec(row);
    if (lm) listens.push(lm[1].trim());
    const pm = /^\s*proxy_pass\s+([^;]+);/.exec(row);
    if (pm) proxies.push(pm[1].trim());
    const rm = /^\s*root\s+([^;]+);/.exec(row);
    if (rm) roots.push(rm[1].trim());
  }
  flush();
  const docker = (raw.match(/^[^\n]*\|\s*[0-9.]+:[0-9]+->[^\n]*$/gm) || []).slice(0, 12);
  const listen80 = /:80\b/.test(raw);
  const listen443 = /:443\b/.test(raw);
  const out: string[] = [];
  out.push(`共解析出 ${lines.length} 个站点配置。`);
  if (lines.length) out.push("\n- 站点列表：");
  lines.forEach((l) => out.push(`  ${l}`));
  out.push(`\n- 80/443 监听：${listen443 ? "443 已监听" : "443 未确认"}/${listen80 ? "80 已监听" : "80 未确认"}`);
  if (docker.length) out.push("\n- Docker 容器：\n  " + docker.join("\n  "));
  out.push("\n（AI 汇总暂不可用，以上为只读扫描自动解析结果）");
  return out.join("\n");
}

// 追问判定：“上次/刚才/再盘一次”等重复语义优先召回记忆，不重复执行完整扫描
function isInventoryRecallAsk(message: string): boolean {
  const m = message.trim();
  if (!/(盘点|站点|网站|域名|虚拟主机)/i.test(m)) return false;
  // 明确要最新状态时走新盘点
  if (/(最新|现在|实时|更新一下|重新盘点|重新扫描|再扫一遍|重新跑|重新执行)/.test(m)) return false;
  // 引用既往结果 / 重复触发词（不包含“哪些/列表盘点”等首次问法）
  return /(上次|刚才|上一次|最近一次|之前|回顾|再盘一次|再盘点一次|再来一次|盘点结果|结果里)/.test(m);
}

// 追问上次盘点结果：直接召回最近一次 inventory 记忆组织回答
async function runInventoryRecall(task: AgentTask, db: DbClient, mem: { title: string; content: string; updatedAt: Date }, llm: ResolvedAiLlm) {
  const wid = task.workspaceId;
  const sid = task.serverId;
  const history = task.history ?? [];
  task.agent = "assistant";
  task.kind = "text";
  setProgress(task, { label: "读取上次盘点", detail: "已命中记忆，正在组织回答", current: 1, total: 2 });
  const step = pushStep(task, "记忆检索", "最近一次站点盘点", "memory");
  endStep(step, "done", `命中记忆：${mem.title}（更新于 ${new Date(mem.updatedAt).toISOString().slice(0, 16).replace("T", " ")}）
${mem.content.slice(0, 1200)}`, 0);
  setProgress(task, { label: "正在思考", detail: "结合记忆与对话历史组织回答", current: 2, total: 2 });
  try {
    const ctx = history
      .slice(-8)
      .map((h) => `${h.role === "user" ? "用户" : "助手"}：${h.content.slice(0, 500)}`)
      .join("\n");
    const answer = await chatComplete({
      system:
        `你是 ProberX 的运维助手。用户正在追问最近一次「站点盘点」的结果。\n` +
        `请基于以下盘点记忆实话实说，不要编造不存在的站点；如果记忆中没有用户问的信息，直接说明并建议可以说「重新盘点」获取最新状态。\n` +
        `用户目前问的是：${task.message.slice(0, 300)}`,
      user: `【最近一次站点盘点记忆】
${mem.content.slice(0, 4000)}

${ctx ? `【近期对话】
${ctx}
` : ""}
请用简洁的中文回答，不需要重复完整清单。`,
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0.3,
      maxTokens: 1024,
      timeoutMs: 60_000,
    });
    task.text = (answer ?? "").trim() || mem.content;
  } catch (err) {
    endStep(step, "done", String((err as Error).message) + "（已直接展示记忆内容）", 0);
    task.text = mem.content;
  }
}

// 站点盘点主流程：多源扫描 -> AI 汇总清单 -> 沉淀为可检索记忆
async function runSiteInventory(task: AgentTask, db: DbClient, llm: ResolvedAiLlm) {
  const wid = task.workspaceId;
  const sid = task.serverId;
  task.kind = "terminal";
  task.agent = "terminal";
  setProgress(task, { label: "站点盘点", detail: "正在扫描 Nginx/宝塔站点、站点目录与 Docker 容器", current: 1, total: 3 });

  const scanStep = pushStep(task, "盘点站点配置", "只读扫描 vhost/站点目录/Docker/监听端口", "builtin");
  let raw = "";
  try {
    const exec = await executeShellCommand(wid, sid, { command: buildSiteInventoryCommand(), timeout: 60_000 }, db);
    raw = `${exec.stdout ?? ""}${exec.stderr ? "\n[stderr] " + exec.stderr : ""}`.slice(0, 8000);
    const fileCount = (raw.match(/^## file:/gm) || []).length;
    const confLines = (raw.match(/^\s*(server_name|listen |proxy_pass|root )/gm) || []).length;
    endStep(scanStep, "done", `发现站点配置文件 ${fileCount} 个、配置行 ${confLines} 条`, exec.exit_code ?? 0);
  } catch (err) {
    endStep(scanStep, "error", String((err as Error).message));
    task.status = "failed";
    task.error = String((err as Error).message);
    task.text = `站点盘点失败：${(err as Error).message}`;
    task.progress = null;
    return;
  }
  if (!raw.trim()) {
    endStep(scanStep, "error", "未读取到任何站点配置（可能无 Nginx/宝塔站点）");
    task.status = "done";
    task.text = "未在这台服务器上发现站点配置。可先确认是否已安装 Nginx 或宝塔面板。";
    task.progress = null;
    return;
  }

  setProgress(task, { label: "站点盘点", detail: "扫描完成，正在汇总站点清单", current: 2, total: 3 });
  const sumStep = pushStep(task, "AI 汇总站点清单", raw.length + " 字节原始数据", "llm");
  try {
    const summary = await chatComplete({
      system:
        `你是 ProberX 的“站点盘点”助手。用户想知道这台服务器上部署/运行了哪些网站。` +
        `你收到的是只读扫描原始数据，包括站点配置文件（## file: 之后是该文件的 server_name/listen/proxy_pass/root 配置行）、` +
        `/www/wwwroot 目录、Docker 容器与 80/443 监听。\n要求：\n` +
        `1. 只依据数据作答，不要编造；数据中没有的不要猜测。\n` +
        `2. 输出结构：先一句话总览（发现约 N 个站点配置/容器/监听），再分节列出：\n` +
        `   - 站点域名（server_name），标注监听端口、是否反代（proxy_pass 目标）或静态目录（root）；\n` +
        `   - Docker 中可能对外提供 Web 的容器；\n` +
        `   - 80/443 实际监听状态。\n` +
        `3. 用“- ”列表，正文 200-400 字，中文。`,
      user: `扫描数据：\n${raw.slice(0, 6000)}`,
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0.3,
      maxTokens: 8192,
      timeoutMs: 120_000,
    });
    const clean = (summary ?? "").trim();
    const fallback = clean || fallbackSiteList(raw);
    endStep(sumStep, "done", fallback, 0);
    task.text = fallback;

    // 沉淀为可检索记忆，方便之后问“上次盘点的站点”
    void indexMemory(db, {
      workspaceId: wid,
      serverId: sid,
      sourceType: "inventory",
      sourceId: task.id,
      title: "站点盘点",
      content: `${fallback}\n\n原始扫描：\n${raw.slice(0, 3000)}`,
    });
  } catch (err) {
    endStep(sumStep, "error", String((err as Error).message) + "（已用自动解析结果兜底）");
    task.text = fallbackSiteList(raw);
  }
  setProgress(task, { label: "站点盘点", detail: "盘点完成", current: 3, total: 3 });
}

export interface AgentChatInput {
  agent?: AgentId;
  workflowId?: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface RouteResult {
  agent: AgentId;
  workflowId?: string;
}

function extractWindowDays(message: string): number {
  const m = message.trim();
  const dayMatch = /(\d{1,3})\s*(天|日)/.exec(m);
  if (dayMatch) {
    const n = parseInt(dayMatch[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 90) return n;
  }
  if (/(月报|本月|这个月|一个月|近一个月)/.test(m)) return 30;
  if (/(季度|90\s*天|九十天)/.test(m)) return 90;
  return 7;
}

export function routeIntent(
  message: string,
  workflows: { id: string; name: string; trigger: string | null; enabled: boolean }[],
): RouteResult {
  const m = message.trim();
  const lower = m.toLowerCase();

  // 1) explicit workflow trigger keyword or name
  for (const wf of workflows) {
    if (!wf.enabled) continue;
    if (wf.trigger && lower.includes(wf.trigger.toLowerCase())) return { agent: "workflow", workflowId: wf.id };
  }
  const byName = workflows.find((w) => w.enabled && m.includes(w.name));
  if (byName) return { agent: "workflow", workflowId: byName.id };

  // 1.5) weekly ops report / natural-language weekly summary
  const weeklyAsk =
    /(周报|运维周报)/i.test(m) ||
    (/(本周|这周|过去\s*\d+\s*天|近\s*(\d+|几)\s*天|最近\s*(\d+|几)\s*天|近几天|这个月|本月|近一个月|上月)/.test(m) &&
      /(运维|服务器|故障|问题|风险|异常|情况|总结|汇总|报告|怎么样|正常)/.test(m));
  if (weeklyAsk && !/(排查|检查|巡检|体检|根因|为什么|怎么回事|原因|报错|504|502|500|宕机|卡死|磁盘满|内存不足|无法访问|打不开)/i.test(m)) {
    return { agent: "weekly" };
  }

  // 1.54) 名词/错误码解释类提问（不带故障语境）交通用助手，避免误触发诊断
  const pureMeaning =
    (/(是什么意思|是什么|啥意思|指什么|是什么东西)/.test(m) || /^(什么是|啥是)/.test(m)) &&
    !/(为什么|原因|怎么解决|怎么处理|怎么办|排查|怎么查|查一下|看看|我的|我们|本机|这台|服务器|网站|域名|故障|宕机|打不开|访问不了|挂了|超时|卡|慢|异常|报错|磁盘满|内存不足)/.test(m);
  if (pureMeaning) return { agent: "assistant" };

  // 1.55) 产品/能力咨询（“你能做什么/有哪些功能/介绍下XX”）不触发诊断或命令执行
  if (/(介绍下?|功能介绍|能做什么|能做哪些|有哪些功能|你们能|你可以|你能|支持哪些|助手列表)/.test(m) &&
      !/(报错|异常|打不开|无法访问|502|503|504|500|故障|宕机|优化|检查|看看|分析|扫描|磁盘满|内存不足|卡|慢|挂了)/.test(m)) {
    return { agent: "assistant" };
  }

  // 1.6) 点名直呼专项助手（用/切换到/找 XX 助手）
  const namedExpert = matchExpertByName(m);
  if (namedExpert) return { agent: namedExpert };

  // 1.7) 专项诊断助手自动路由（13 个专家：网站/数据库/流量/安全/后门扫描/服务器/计划任务/文件/FTP/SSL/日志/DNS/性能）
  const exp = routeExpert(m);
  if (exp) return { agent: exp };

  // 2) inspection / health check
  if (/(巡检|体检|健康检查|健康评分|健康报告|健康状态|健康状况|健康度|健康吗|检查一下服务器|服务器健康|服务器怎么样|正常吗|是否正常|正常不)/.test(m)) {
    return { agent: "inspection" };
  }

  // 3) diagnosis / root cause
  if (/(排查|根因|为什么|怎么回事|原因|504|502|500|网关超时|挂了|打不开|无法访问|磁盘满|内存不足|内存不够|cpu 高|cpu高|负载高|宕机|卡死|超时|异常|报错)/i.test(m)) {
    return { agent: "diagnosis" };
  }

  // 4) terminal / commands
  if (/(查看|查询|查一下|看看|执行|运行|命令|端口|进程|安装|重启|删除|清理|日志|docker|kill|杀掉|杀死|分析.*(网站|域名|站点|页面|服务|配置|日志|文件|进程|端口|服务器)|(网站|域名|站点|页面).*(分析|类型|技术|框架|源码|搭建|抓取|爬取|curl)|curl)/i.test(m)) {
    return { agent: "terminal" };
  }

  // 5) 运维实操兜底：对象词+动作词都明确时交给能取证的助手，避免纯聊天回复“无法执行”
  const op = routeOperationalFallback(m);
  if (op) return op;

  return { agent: "assistant" };
}

// 强运维意图识别：知识问答/闲聊不参与兜底
const KNOWLEDGE_ASK = /^(什么是|啥是|是什么|解释一下|介绍一下|说明一下|有什么区别|怎么理解|工作原理|教程|哪个好|怎么选|如何安装|怎么用|用法|推荐|如何|怎么配置|怎么部署)/;
const OPERATION_DOMAIN = /(https?:\/\/)?[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])+/;
const OPERATION_VERB = /(看看|看一下|查一下|查查|检查|排查|诊断|分析|检测|扫描|查看|查询|访问|监控|为什么|怎么回事|什么情况|咋了|怎么了|是否正常|正常吗|正不正常|打不开|访问不了|挂了|挂了吗|白屏|报错|异常|很慢|很卡|卡顿|连不上|失败|没反应|跑不起来|状态|原因)/;
const OPERATION_OBJ = /(网站|站点|域名|网址|服务器|主机|服务|页面|接口|证书|数据库|mysql|redis|nginx|php|docker|容器|端口|进程|日志|磁盘|内存|cpu|负载|文件|任务|cron|ftp|dns|ssl|流量|带宽|备份|计划任务|定时任务|面板|宝塔|bt)/i;

function routeOperationalFallback(m: string): RouteResult | null {
  if (!m || m.length < 4) return null;
  if (KNOWLEDGE_ASK.test(m)) return null;
  const hasObj = OPERATION_OBJ.test(m) || OPERATION_DOMAIN.test(m);
  if (!hasObj || !OPERATION_VERB.test(m)) return null;
  if (OPERATION_DOMAIN.test(m) || /(网站|站点|域名|网址|页面|虚拟主机|首页)/i.test(m)) return { agent: "website-diag" };
  return { agent: "diagnosis" };
}

// 连续追问：短句或承接语沿用上一轮可执行能力，避免掉回“纯聊天不执行”
const FOLLOWUP_PREFIX = /^(那|那么|再|继续|然后|接着|还有|顺便|为啥|为什么|怎么会|结果|后面|之后|接下来|这个|那个|它|上面|所以|是不是|有没有)/;
function continuePreviousAgent(
  message: string,
  history: { role: string; content: string }[],
  workflows: { id: string; name: string; trigger: string | null; enabled: boolean }[]
): AgentId | null {
  const lastUser = [...(history ?? [])].reverse().find((h) => h.role === "user")?.content ?? "";
  if (!lastUser) return null;
  const prev = routeIntent(lastUser, workflows).agent;
  if (!prev || prev === "assistant" || prev === "weekly" || prev === "inspection" || prev === "workflow") return null;
  const m = (message ?? "").trim();
  if (!m) return null;
  if (m.length <= 12 || FOLLOWUP_PREFIX.test(m)) return prev;
  return null;
}

// 把最近几轮对话整理成“仅用于理解连续问题意图”的上下文（不作为取证证据）
function recentChatContext(history?: { role: "user" | "assistant"; content: string }[]): string {
  const h = (history ?? []).slice(-6);
  if (!h.length) return "";
  return h
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${(m.content ?? "").slice(0, 400)}`)
    .join("\n");
}

// 诊断/专家完成后生成自然语言总结（只引用真实结论与证据，失败则保留默认文案）
async function summarizeDiagnosisResult(
  task: AgentTask,
  db: DbClient,
  runId: string,
  llm: ResolvedAiLlm,
  label: string
): Promise<boolean> {
  try {
    const run = await getRun(task.workspaceId, runId, db);
    if (run.status !== "success") return false;
    const suggestions = (Array.isArray(run.suggestions) ? run.suggestions : []) as { title?: string; detail?: string }[];
    const sugText = suggestions
      .map((s) => `${s?.title ?? ""}：${s?.detail ?? ""}`)
      .join("\n")
      .slice(0, 1500);
    setProgress(task, { label: `${label}·总结`, detail: "取证完成，正在整理自然语言结论", current: 10, total: 10 });
    const step = pushStep(task, "自然语言总结", run.rootCause ? `根因：${run.rootCause.slice(0, 120)}` : "整理取证结论", "llm");
    const raw = await chatComplete({
      system:
        `你是 ProberX 的运维专家。用户刚完成一次「${label}」（白名单只读命令逐步取证），请把结论整理成给用户的自然语言总结。\n` +
        `要求：\n1. 只能使用下面提供的数据，禁止编造证据或步骤中没有的内容；\n` +
        `2. 第一句给出整体结论（含置信度，区分“已确认/大概率/待验证”），随后 3-6 条要点，每条以“- ”开头；\n` +
        `3. 明确区分“已确认事实”与“仍待验证”的内容，不要出现与证据冲突的断言；\n` +
        `4. 正文 200-280 字，末尾空一行写“完整取证时间线与证据可在「查看排查详情」中打开。”`,
      user:
        `用户原问题：${task.message.slice(0, 500)}\n\n根因结论：${run.rootCause ?? "（无）"}\n\n` +
        `证据与动态过程：\n${(run.evidence ?? "").slice(0, 2400)}\n\n修复/优化建议：\n${sugText || "（无）"}`,
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0.3,
      maxTokens: 2048,
      timeoutMs: 60_000,
    });
    const clean = (raw ?? "").trim();
    endStep(step, "done", clean || "（无输出）", 0);
    if (clean) task.text = clean;
    return !!clean;
  } catch (err) {
    const last = task.steps[task.steps.length - 1];
    if (last && last.tool === "自然语言总结" && last.status === "running") {
      endStep(last, "error", String((err as Error).message));
    }
    return false;
  }
}

export function startAgentChat(
  workspaceId: string,
  serverId: string,
  input: AgentChatInput,
  db: DbClient
): { taskId: string } {
  const task: AgentTask = {
    id: crypto.randomUUID(),
    workspaceId,
    serverId,
    agent: input.agent ?? "assistant",
    message: input.message,
    status: "running",
    kind: "text",
    steps: [],
    text: "",
    history: input.history,
    createdAt: Date.now(),
  };
  tasks.set(task.id, task);
  void runAgentTask(task, input, db);
  return { taskId: task.id };
}

export function getAgentTask(taskId: string, workspaceId: string): AgentTask | null {
  const t = tasks.get(taskId);
  if (!t || t.workspaceId !== workspaceId) return null;
  return t;
}

async function runAgentTask(task: AgentTask, input: AgentChatInput, db: DbClient) {
  const { message, history } = input;
  const wid = task.workspaceId;
  const sid = task.serverId;
  // AI 接口可配置到工作区设置；未启用时自动回退服务器环境变量
  const llm = await resolveAiLlm(db, wid);

  try {
    let agent = input.agent;
    let workflowId = input.workflowId;
    if (!workflowId) {
      const wfs = await workflowSvc.listWorkflows(wid, db);
      const routed = routeIntent(message, wfs as any);
      // 显式点选（CAP_CARDS/专家助手）优先；未点选时按意图自动路由
      agent = input.agent ?? routed.agent;
      workflowId = input.workflowId ?? routed.workflowId;
      // 连续追问：短句/承接语沿用上一轮可执行能力，避免掉回“纯聊天不执行”
      if (!input.agent && !workflowId && routed.agent === "assistant" && history && history.length) {
        const prev = continuePreviousAgent(message, history, wfs as any);
        if (prev) agent = prev;
      }
    }
    task.agent = agent ?? "assistant";

    // 站点盘点意图（无论路由到哪个 agent，都走确定性盘点）
    if (!workflowId && isSiteInventoryAsk(message)) {
      // 追问“上次/刚才/再盘一次”且已有盘点记忆时，直接召回记忆，不重复执行完整扫描
      const latestInv = await latestMemoryByType(db, { workspaceId: wid, serverId: sid, sourceType: "inventory" });
      if (latestInv && isInventoryRecallAsk(message)) {
        await runInventoryRecall(task, db, latestInv, llm);
      } else {
        await runSiteInventory(task, db, llm);
      }
      task.status = "done";
      task.progress = null;
      return;
    }

    if (workflowId) {
      task.kind = "workflow";
      const wf = await workflowSvc.getWorkflow(wid, workflowId, db);
      task.text = await workflowSvc.executeWorkflowSteps(wid, sid, wf as any, (s) => {
        task.steps.push({
          id: s.id,
          tool: s.name || s.tool,
          kind: s.kind,
          args: s.tool,
          status: s.status,
          output: s.output,
          exitCode: s.exitCode,
          startedAt: s.startedAt,
          finishedAt: s.finishedAt,
        });
      }, db);
    } else if (agent === "weekly") {
      task.kind = "weekly";
      const days = extractWindowDays(message);
      const scoped = /(这台|当前|本机|选中的)/.test(message);
      const scopeLabel = scoped ? "目标服务器" : "工作区全部服务器";
      const step = pushStep(task, "AI 运维周报", `汇总最近 ${days} 天自主排查记录 · ${scopeLabel}`, "agent");
      setProgress(task, { label: "AI 运维周报", detail: `正在汇总最近 ${days} 天记录并生成周报`, current: 1, total: 3 });
      let w: Awaited<ReturnType<typeof buildWeekly>>;
      try {
        w = await buildWeekly(wid, db, { days, serverId: scoped ? sid : undefined, onProgress: (p) => setProgress(task, p) });
      } catch (err) {
        endStep(step, "error", String((err as Error).message));
        task.status = "failed";
        task.error = String((err as Error).message);
        task.text = `周报生成失败：${(err as Error).message}`;
        return;
      }
      if (!w || w.runCount === 0) {
        endStep(step, "done", `最近 ${days} 天没有自主排查记录，暂无统计。`);
        task.status = "done";
        task.text = `近 ${days} 天还没有「自主排查」记录，暂时生成不了周报。可以先发起一次排查（例如“网站 504 帮我排查原因”），之后我就能按周期汇总运维情况与价值统计。`;
        return;
      }
      endStep(
        step,
        "done",
        `排查 ${w.runCount} 次（成功 ${w.byStatus.success ?? 0} / 失败 ${w.byStatus.failed ?? 0}）` +
          `· 取证 ${w.totalSteps} 步 · 修复/回滚/复检 ${w.totalRepairs}/${w.totalRollbacks}/${w.totalRechecks}` +
          `· 复检已恢复 ${w.recoveredCount} 次 · 预估节省约 ${w.savedMinEstimate} 分钟`,
        0
      );
      const askStep = pushStep(task, "自然语言解读", message, "llm");
      setProgress(task, { label: "自然语言解读", detail: "正在把周报整理成自然语言答复", current: 3, total: 3 });
      try {
        const raw = await chatComplete({
          system:
            `你是 ProberX 的运维汇报助手。你会收到一段周期的 AI 运维周报（Markdown 统计与根因摘要）。` +
            `请用自然、专业的中文回答用户关于该周期的提问；若用户只是要求生成周报，则主动总结运维情况。要求：` +
            `1. 直接回答，可带 3-5 条要点（每行以“- ”开头），正文 200-350 字；` +
            `2. 只引用周报中出现的数据与结论，不要编造；` +
            `3. 突出已恢复情况、仍存在的风险点与下一步建议；` +
            `4. 结尾用一行说明完整周报可在「自主排查 → AI 运维周报」中查看与导出。`,
          user: `用户问题：${message}\n\nAI 运维周报（最近 ${days} 天）：\n${w.markdown}`,
          apiUrl: llm.apiUrl,
          apiKey: llm.apiKey,
          model: llm.model,
          temperature: 0.35,
          maxTokens: 2048,
          timeoutMs: 60_000,
        });
        const clean = (raw ?? "").trim();
        endStep(askStep, "done", clean || "（无输出）", 0);
        task.text = clean || `周报已生成，见下方统计卡片（最近 ${days} 天）。`;
      } catch (err) {
        endStep(askStep, "error", String((err as Error).message));
        task.text =
          `已生成最近 ${days} 天的 AI 运维周报 ✅ 排查 ${w.runCount} 次（成功 ${w.byStatus.success ?? 0} / 失败 ${w.byStatus.failed ?? 0}），` +
          `取证 ${w.totalSteps} 步，修复/回滚/复检 ${w.totalRepairs}/${w.totalRollbacks}/${w.totalRechecks} 次，复检已恢复 ${w.recoveredCount} 次，` +
          `预估节省人工排查时间约 ${w.savedMinEstimate} 分钟。\n（自然语言解读暂不可用，请查看下方统计与完整周报）`;
      }
      task.linkHref = "/diagnoses";
    } else if (agent === "inspection") {
      task.kind = "inspection";
      setProgress(task, { label: "AI 巡检", detail: "正在采集 24h 指标与探针", current: 1, total: 3 });
      const step = pushStep(task, "AI 巡检", "采集 24h 指标并生成健康报告", "agent");
      const res = await generateReport(wid, sid, { title: "AI 智能体巡检", trigger: "manual", onProgress: (p) => setProgress(task, p) }, db);
      endStep(step, "done", `健康评分 ${res.healthScore ?? "—"} 分`, 0);
      task.text = `巡检完成 ✅ 该服务器健康评分 ${res.healthScore ?? "—"}/100。报告已生成，点击下方卡片查看完整发现与建议。`;
      task.linkHref = `/inspections/${res.id}`;
    } else if (agent === "diagnosis") {
      task.kind = "diagnosis";
      setProgress(task, { label: "自主排查", detail: "正在规划取证路径并召回历史相似案例", current: 0, total: 10 });
      const step = pushStep(task, "自主排查", "通过白名单只读命令逐步取证定位根因", "agent");
      const res = await startDiagnosis(
        wid,
        sid,
        {
          goal: message,
          title: "智能体自主排查",
          trigger: "manual",
          context: recentChatContext(history),
          onProgress: (p) => setProgress(task, { ...p, total: 10 }),
        },
        db
      );
      endStep(step, "done", `完成 ${res.steps ?? 0} 步取证`, 0);
      const memHits = ((res as { memoryHits?: MemoryHit[] }).memoryHits ?? []).slice(0, 5);
      if (memHits.length) {
        const memStep = pushStep(task, "记忆检索", `命中 ${memHits.length} 条历史相似案例`, "memory");
        endStep(
          memStep,
          "done",
          memHits
            .map((h, i) => `${i + 1}. [${memorySourceLabel(h.sourceType)}] ${h.title}（相似度 ${Math.round(h.similarity * 100)}%）`)
            .join("\n"),
          0
        );
      }
      task.linkHref = `/diagnoses/${res.id}`;
      const ok = await summarizeDiagnosisResult(task, db, res.id, llm, "自主排查");
      if (!ok) {
        task.text = `排查完成 ✅ 已执行 ${res.steps ?? 0} 步只读取证并定位根因。查看时间线卡片获取结论、置信度与修复建议。`;
      }
    } else if (isExpertAgent(agent)) {
      // 专项诊断助手：与自主排查同一引擎，但使用专项提示词 + 工具白名单
      const exp = EXPERT_BY_ID[agent];
      task.kind = "diagnosis";
      setProgress(task, { label: exp.name, detail: "正在规划专项取证并召回历史相似案例", current: 0, total: 10 });
      const step = pushStep(task, exp.name, "通过白名单只读命令逐步取证定位问题", "agent");
      const res = await startDiagnosis(
        wid,
        sid,
        {
          goal: message,
          title: `${exp.name}：${message.slice(0, 40)}`,
          trigger: "manual",
          expertId: exp.id,
          context: recentChatContext(history),
          onProgress: (p) => setProgress(task, { ...p, total: 10 }),
        },
        db
      );
      endStep(step, "done", `完成 ${res.steps ?? 0} 步取证`, 0);
      const memHits = ((res as { memoryHits?: MemoryHit[] }).memoryHits ?? []).slice(0, 5);
      if (memHits.length) {
        const memStep = pushStep(task, "记忆检索", `命中 ${memHits.length} 条历史相似案例`, "memory");
        endStep(
          memStep,
          "done",
          memHits
            .map((h, i) => `${i + 1}. [${memorySourceLabel(h.sourceType)}] ${h.title}（相似度 ${Math.round(h.similarity * 100)}%）`)
            .join("\n"),
          0
        );
      }
      task.linkHref = `/diagnoses/${res.id}`;
      const summarized = await summarizeDiagnosisResult(task, db, res.id, llm, exp.name);
      if (!summarized) {
        task.text = `${exp.name}已完成 ✅ 已执行 ${res.steps ?? 0} 步只读取证并定位问题。查看时间线卡片获取结论、置信度与修复建议。`;
      }
    } else if (agent === "terminal") {
      task.kind = "terminal";
      const genStep = pushStep(task, "生成命令", `意图：${message}`, "llm");
      let command = "";
      try {
        const gen = await generateShellCommand(wid, sid, {
          prompt: message,
          provider: llm.provider === "env" ? "deepseek" : llm.provider,
          model: llm.model || "deepseek-chat",
          api_key: llm.apiKey || undefined,
          api_url: llm.apiUrl || "https://api.deepseek.com/v1",
        }, db);
        command = gen.command;
        endStep(genStep, "done", command, 0);
      } catch (err) {
        endStep(genStep, "error", String((err as Error).message));
        task.status = "failed";
        task.error = String((err as Error).message);
        task.text = `命令生成失败：${(err as Error).message}`;
        return;
      }
            const execStep = pushStep(task, "执行命令", command, "shell");
      let output = "";
      let execOk = false;
      try {
        const exec = await executeShellCommand(wid, sid, { command, timeout: 30 }, db);
        output = (exec.stdout || exec.stderr || "(空输出)").slice(0, 4000);
        endStep(execStep, "done", output, exec.exit_code);
        execOk = true;
      } catch (err) {
        endStep(execStep, "error", String((err as Error).message));
        task.text = `命令执行失败：${(err as Error).message}`;
      }
      if (execOk) {
        const sumStep = pushStep(task, "分析结果", command, "llm");
        try {
          const summary = await chatComplete({
            system: "你是 ProberX 的运维智能体。根据用户问题与命令输出，用简洁、专业的中文给出结论。若输出不足以回答，说明观察到的关键信息并建议下一步。",
            user: `用户问题：${message}\n\n执行的命令：${command}\n\n命令输出：\n${output.slice(0, 3000)}`,
            apiUrl: llm.apiUrl,
            apiKey: llm.apiKey,
            model: llm.model,
            temperature: 0.3,
            maxTokens: 2048,
            timeoutMs: 60_000,
          });
          endStep(sumStep, "done", summary, 0);
          task.text = summary;
        } catch (err) {
          endStep(sumStep, "error", String((err as Error).message));
          task.text = `已执行 ✅ 命令退出码 0。输出见下方工具卡片。\n（结果分析失败：${(err as Error).message}）`;
        }
      }
    } else {
      // assistant: plain LLM chat
      const system = SYSTEM_PROMPTS.assistant ?? "";
      const mem = await recallAndStep(task, db, message, { workspaceId: wid, serverId: sid });
      setProgress(task, { label: "正在思考", detail: "结合记忆检索结果组织回答" });
      const msgs = [
        ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: message },
      ];
      const prompt = msgs.map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`).join("\n");
      const memoryCtx = mem.hits.length
        ? `\n\n【历史记忆 · 向量检索命中，仅供回答参考】\n${mem.hits
            .slice(0, 4)
            .map((h, i) => `${i + 1}. [${memorySourceLabel(h.sourceType)}] ${h.title}\n   ${h.content.slice(0, 240)}`)
            .join("\n")}\n仅当与用户问题相关时引用；不相关或信息不足时不要编造。`
        : "";
      const raw = await chatComplete({ system, user: prompt + memoryCtx, apiUrl: llm.apiUrl, apiKey: llm.apiKey, model: llm.model, temperature: 0.4, maxTokens: 8192, timeoutMs: 60_000 });
      task.text = raw;
    }
    task.status = "done";
    task.progress = null;
  } catch (err) {
    task.status = "failed";
    task.progress = null;
    task.error = String((err as Error).message);
    task.text = `任务执行失败：${(err as Error).message}`;
    const last = task.steps[task.steps.length - 1];
    if (last && last.status === "running") endStep(last, "error", task.error);
  }
}