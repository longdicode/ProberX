"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers, useWorkflows, useWorkflowCatalog, type Workflow, type WorkflowStep } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot, Send, Loader2, ShieldCheck, CheckCircle2, XCircle,
  Mic, Volume2, VolumeX, History, Plus, Play, Pencil, Trash2, X,
  Workflow as WorkflowIcon, Server, Sparkles, ArrowRight, BarChart3, Stethoscope,
  Terminal as TerminalIcon, RefreshCw,
} from "lucide-react";

type AgentId = "assistant" | "inspection" | "diagnosis" | "terminal" | "workflow" | "weekly";
type MsgKind = "text" | "inspection" | "diagnosis" | "terminal" | "workflow" | "weekly";
type MsgStatus = "running" | "done" | "failed";

interface AgentStep {
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

interface Msg {
  id: string;
  agent: AgentId;
  role: "user" | "ai";
  content: string;
  kind: MsgKind;
  status: MsgStatus;
  steps?: AgentStep[];
  fullText?: string;
  linkHref?: string;
  error?: string;
  progress?: TaskProgress | null;
  createdAt: number;
  /** 从本地历史恢复的消息，跳过打字动画 */
  restored?: boolean;
}

interface TaskProgress {
  label?: string;
  detail?: string;
  current?: number;
  total?: number;
}

const AGENT_META: Record<AgentId, { name: string; cls: string }> = {
  assistant: { name: "通用问答", cls: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10" },
  inspection: { name: "AI 巡检", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  diagnosis: { name: "自主排查", cls: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  terminal: { name: "命令执行", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  weekly: { name: "AI 运维周报", cls: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  workflow: { name: "自定义工作流", cls: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" },
};

const QUICK_ACTIONS = [
  { label: "健康巡检", prompt: "检查服务器健康状况" },
  { label: "故障排查", prompt: "网站 504，帮我排查原因" },
  { label: "执行命令", prompt: "查看磁盘使用情况" },
  { label: "运维周报", prompt: "生成这周的 AI 运维周报" },
];

const SUGGESTIONS = ["检查服务器健康状况", "网站 504，帮我排查原因", "查看磁盘使用情况", "生成这周的 AI 运维周报"];

interface WeeklyReport {
  runCount: number;
  byStatus: Record<string, number>;
  autoCount: number;
  totalSteps: number;
  recoveredCount: number;
  stillFailingCount: number;
  savedMinEstimate: number;
  prevRunCount: number;
  diskForecasts: { serverName: string; usedPct: number; etaDays: number | null }[];
  uptimePct: number | null;
  uptimePrevPct: number | null;
}

const CAP_CARDS: {
  agent: AgentId;
  name: string;
  desc: string;
  prompt: string;
  icon: typeof Bot;
  hover: string;
  iconBox: string;
}[] = [
  {
    agent: "inspection",
    name: "AI 巡检",
    desc: "采集 24h 指标与探针，生成健康评分与风险报告",
    prompt: "检查服务器健康状况",
    icon: Stethoscope,
    hover: "hover:border-emerald-500/40",
    iconBox: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    agent: "diagnosis",
    name: "自主排查",
    desc: "自然语言故障 → 多步只读取证 → 定位根因与修复建议",
    prompt: "网站 504，帮我排查原因",
    icon: WorkflowIcon,
    hover: "hover:border-violet-500/40",
    iconBox: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
  {
    agent: "terminal",
    name: "AI 终端",
    desc: "一句话生成并执行 shell 命令，白名单只读安全执行",
    prompt: "查看磁盘使用情况",
    icon: TerminalIcon,
    hover: "hover:border-amber-500/40",
    iconBox: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  {
    agent: "weekly",
    name: "AI 运维周报",
    desc: "周期汇总 + 环比趋势 + 磁盘写满预测，自动生成周报",
    prompt: "生成这周的 AI 运维周报",
    icon: BarChart3,
    hover: "hover:border-sky-500/40",
    iconBox: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
];

const STEP_KIND_LABEL: Record<string, { label: string; cls: string }> = {
  mcp: { label: "MCP 工具", cls: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" },
  shell: { label: "命令", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  builtin: { label: "内置工具", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  llm: { label: "AI 生成", cls: "text-slate-400 border-slate-500/30 bg-slate-500/10" },
  memory: { label: "记忆检索", cls: "text-violet-400 border-violet-500/30 bg-violet-500/10" },
  agent: { label: "工具", cls: "text-slate-400 border-slate-500/30 bg-slate-500/10" },
};

interface StepDraft {
  id: string;
  kind: "builtin" | "shell" | "mcp";
  tool: string;
  name: string;
  args: string;
}

interface WfDraft {
  id?: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  steps: StepDraft[];
}

function genId() { return Math.random().toString(36).slice(2, 10); }
function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

// 对话历史本地持久化：按 workspace+server 维度分箱存储，刷新/切换服务器后恢复
const CHAT_STORAGE_PREFIX = "proberx_agent_history_v1";
function chatStorageKey(wid: string, sid: string) { return `${CHAT_STORAGE_PREFIX}:${wid}:${sid}`; }

function pruneMsg(m: Msg): Msg {
  const steps = (m.steps ?? [])
    .slice(0, 24)
    .map((s) => ({ ...s, output: s.output ? s.output.slice(0, 2000) : s.output }));
  return {
    ...m,
    content: m.content.slice(0, 8000),
    fullText: (m.fullText ?? "").slice(0, 8000),
    error: m.error ? m.error.slice(0, 1000) : undefined,
    steps,
  };
}

function loadChatHistory(wid: string, sid: string): Msg[] | null {
  try {
    const raw = window.localStorage.getItem(chatStorageKey(wid, sid));
    if (!raw) return null;
    const arr = JSON.parse(raw) as Msg[];
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((m) => m && m.role && m.status !== "running")
      .map((m) => ({ ...m, restored: true }));
  } catch { return null; }
}

function saveChatHistory(wid: string, sid: string, msgs: Msg[]) {
  try {
    window.localStorage.setItem(chatStorageKey(wid, sid), JSON.stringify(msgs.map(pruneMsg)));
  } catch { /* quota/private mode: ignore */ }
}

/** 把已完成的对话转成可发送给后端的 history（用户 + AI 最终回复） */
function buildChatHistory(msgs: Msg[]): { role: "user" | "assistant"; content: string }[] {
  return msgs
    .filter((m) => m.status === "done")
    .slice(-14)
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: (m.role === "user" ? m.content : m.fullText || m.content || "").slice(0, 1500),
    }))
    .filter((h) => h.content.trim().length > 0);
}

// Speech: voice input & read-aloud (TTS)

let speakingMsgId: string | null = null;
const speechListeners = new Set<() => void>();

function setSpeakingMsgId(id: string | null) {
  speakingMsgId = id;
  speechListeners.forEach((fn) => fn());
}

function useSpeakingMsgId() {
  const [id, setId] = useState(speakingMsgId);
  useEffect(() => {
    const fn = () => setId(speakingMsgId);
    speechListeners.add(fn);
    return () => { speechListeners.delete(fn); };
  }, []);
  return id;
}

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function speakMessage(id: string, text: string) {
  if (!speechSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  utter.rate = 1;
  const zhVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("zh"));
  if (zhVoice) utter.voice = zhVoice;
  utter.onend = () => setSpeakingMsgId(null);
  utter.onerror = () => setSpeakingMsgId(null);
  setSpeakingMsgId(id);
  window.speechSynthesis.speak(utter);
}

function ToolIcon({ kind }: { kind?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium shrink-0",
      STEP_KIND_LABEL[kind ?? ""]?.cls ?? STEP_KIND_LABEL.agent.cls
    )}>
      {STEP_KIND_LABEL[kind ?? ""]?.label ?? STEP_KIND_LABEL.agent.label}
    </span>
  );
}

function StepCard({ step }: { step: AgentStep }) {
  const running = step.status === "running";
  const failed = step.status === "error";
  return (
    <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/20">
        {running
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />
          : failed
            ? <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
        <span className="text-xs font-mono font-medium truncate">{step.tool}</span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {running && <span className="text-[10px] text-blue-400">进行中</span>}
          <ToolIcon kind={step.kind} />
        </span>
      </div>
      {step.output ? (
        <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all max-h-56 overflow-y-auto px-3 py-2 bg-muted/30 text-muted-foreground">
          {step.output}
        </pre>
      ) : failed ? (
        <p className="text-[11px] px-3 py-2 text-red-400">{step.args || "失败"}</p>
      ) : running ? (
        <p className="text-[11px] px-3 py-2 text-muted-foreground">{step.args || "进行中"}</p>
      ) : null}
    </div>
  );
}

function AiMessage({ msg }: { msg: Msg }) {
  const [display, setDisplay] = useState("");
  const [doneTyping, setDoneTyping] = useState(false);
  const speakId = useSpeakingMsgId();
  const speaking = speakId === msg.id;
  const text = msg.fullText || msg.content || "";
  const showCursor = msg.status === "running" && !msg.fullText;

  useEffect(() => {
    if (msg.status !== "done" || msg.restored) { setDisplay(text); setDoneTyping(msg.status === "done"); return; }
    if (!text) { setDisplay(""); setDoneTyping(true); return; }
    setDisplay("");
    setDoneTyping(false);
    let i = 0;
    const timer = setInterval(() => {
      i += 3;
      setDisplay(text.slice(0, i));
      if (i >= text.length) { clearInterval(timer); setDoneTyping(true); }
    }, 20);
    return () => clearInterval(timer);
  }, [text, msg.status]);

  const meta = AGENT_META[msg.agent] ?? AGENT_META.assistant;
  const speakable = doneTyping && !!text && speechSupported();

  const toggleSpeak = () => {
    if (speaking) { window.speechSynthesis.cancel(); setSpeakingMsgId(null); return; }
    speakMessage(msg.id, text);
  };

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-center gap-2">
        {msg.agent !== "assistant" && (
          <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium", meta.cls)}>
            <Sparkles className="h-3 w-3" />
            已自动调用 · {meta.name}
          </span>
        )}
        {speakable && (
          <button
            onClick={toggleSpeak}
            title={speaking ? "停止朗读" : "朗读"}
            className={cn(
              "inline-flex items-center justify-center rounded-md p-0.5 transition-colors",
              speaking ? "text-primary" : "text-muted-foreground/60 hover:text-foreground"
            )}
          >
            {speaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm whitespace-pre-wrap text-foreground">
        {display}
        {showCursor && <span className="inline-block w-[2px] h-[1em] align-middle bg-primary animate-pulse ml-0.5" />}
        {!display && msg.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin inline text-muted-foreground" />}
      </div>
      {msg.status === "running" && (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            <span className="font-medium text-foreground truncate">{msg.progress?.label ?? "任务执行中"}</span>
            {!!msg.progress?.total && msg.progress.current != null && (
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                {Math.min(msg.progress.current, msg.progress.total)}/{msg.progress.total}
              </span>
            )}
          </div>
          {msg.progress?.detail ? (
            <p className="text-xs text-muted-foreground leading-relaxed break-words">{msg.progress.detail}</p>
          ) : null}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-700",
                !msg.progress?.total && "animate-pulse"
              )}
              style={{
                width: msg.progress?.total
                  ? `${Math.max(6, Math.min(100, Math.round(((msg.progress.current ?? 0) / msg.progress.total) * 100)))}%`
                  : "45%",
              }}
            />
          </div>
        </div>
      )}
      {!!msg.steps?.length && (
        <div className="space-y-1.5">
          {msg.steps.map((s) => <StepCard key={s.id} step={s} />)}
        </div>
      )}
      {msg.status === "done" && msg.linkHref && (
        <Link href={msg.linkHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {msg.kind === "inspection"
            ? "查看完整巡检报告"
            : msg.kind === "weekly"
              ? "查看完整 AI 运维周报"
              : "查看排查详情"} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
      {msg.status === "failed" && (
        <p className="text-xs text-red-400 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />{msg.error || "任务失败"}</p>
      )}
    </div>
  );
}

function parseJsonArgs(raw: string): Record<string, unknown> {
  const s = raw.trim();
  if (!s) return {};
  try { return JSON.parse(s); } catch { return { _raw: s }; }
}

export default function AgentPage() {
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);
  const { data: workflows } = useWorkflows(current?.id);
  const { data: catalog } = useWorkflowCatalog(current?.id);
  const queryClient = useQueryClient();

  const [serverId, setServerId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const micSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  // workflow builder
  const [wfOpen, setWfOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<WfDraft>({ name: "", description: "", trigger: "", enabled: true, steps: [] });

  const onlineServers = (servers || []).filter((s) => s.isOnline);
  const wid = current?.id || "";

  // 工作台速览：AI 运维周报数据
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const loadWeekly = useCallback(async () => {
    if (!wid) return;
    setWeeklyLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${wid}/reports/weekly?days=7`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`周报加载失败 (${res.status})`);
      const data = (await res.json()) as WeeklyReport;
      setWeekly(data.runCount > 0 ? data : null);
    } catch {
      setWeekly(null);
    } finally {
      setWeeklyLoading(false);
    }
  }, [wid]);

  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wid) loadWeekly();
  }, [wid, loadWeekly]);
  useEffect(() => {
    // 每次对话结束后静默刷新速览，让周报数字跟着最新排查结果走
    if (wasLoadingRef.current && !loading) loadWeekly();
    wasLoadingRef.current = loading;
  }, [loading, loadWeekly]);

  useEffect(() => {
    if (onlineServers.length > 0 && !serverId) setServerId(onlineServers[0].id);
  }, [onlineServers, serverId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // 切换/初始化服务器时加载该服务器的对话历史（没有则保持空）
  useEffect(() => {
    if (!wid || !serverId) return;
    const saved = loadChatHistory(wid, serverId);
    setMessages(saved && saved.length ? saved : []);
  }, [wid, serverId]);

  // 对话更新后防抖存入 localStorage；清空时删除该服务器历史
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!wid || !serverId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (messages.length === 0) {
        try { window.localStorage.removeItem(chatStorageKey(wid, serverId)); } catch { /* ignore */ }
      } else {
        saveChatHistory(wid, serverId, messages);
      }
    }, 500);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [messages, wid, serverId]);

  const updateMsg = useCallback((id: string, patch: Partial<Msg>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const toggleMic = useCallback(() => {
    if (!micSupported) return;
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results || []).map((r: any) => r?.[0]?.transcript || "").join("");
      if (text) setInput((prev) => (prev ? prev.trimEnd() + text : text));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, micSupported]);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      if (speechSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  async function send(text?: string, agent?: AgentId) {
    const content = (text ?? input).trim();
    if (!content || !wid || !serverId || loading) return;
    setInput("");
    setLoading(true);
    inputRef.current?.focus();

    const userMsg: Msg = { id: genId(), agent: "assistant", role: "user", content, kind: "text", status: "done", createdAt: Date.now() };
    const aiMsg: Msg = { id: genId(), agent: "assistant", role: "ai", content: "", kind: "text", status: "running", createdAt: Date.now() };
    const history = buildChatHistory(messages);
    setMessages((prev) => [...prev, userMsg, aiMsg]);

    try {
      const res = await api.post<{ taskId: string }>(
        `/workspaces/${wid}/servers/${serverId}/agents/chat`,
        agent ? { message: content, agent, history } : { message: content, history }
      );
      const taskId = res.taskId;
      const poll = setInterval(async () => {
        try {
          const task = await api.get<{
            status: string; agent?: AgentId; kind: MsgKind; steps: AgentStep[]; text: string; linkHref?: string; error?: string; progress?: TaskProgress | null;
          }>(`/workspaces/${wid}/agents/chat/${taskId}`);
          updateMsg(aiMsg.id, {
            agent: task.agent ?? "assistant",
            status: task.status as MsgStatus,
            kind: task.kind,
            steps: task.steps,
            fullText: task.text || undefined,
            linkHref: task.linkHref,
            error: task.error,
            progress: task.progress ?? undefined,
          });
          if (task.status !== "running") {
            clearInterval(poll);
            setLoading(false);
          }
        } catch (err) {
          clearInterval(poll);
          setLoading(false);
          updateMsg(aiMsg.id, { status: "failed", error: (err as Error).message });
        }
      }, 1500);
    } catch (err) {
      setLoading(false);
      updateMsg(aiMsg.id, { status: "failed", error: (err as Error).message, content: `出错了：${(err as Error).message}` });
    }
  }

  // Workflow builder actions

  function openCreate() {
    setDraft({ name: "", description: "", trigger: "", enabled: true, steps: [] });
    setWfOpen(true);
  }

  function openEdit(wf: Workflow) {
    setDraft({
      id: wf.id,
      name: wf.name,
      description: wf.description ?? "",
      trigger: wf.trigger ?? "",
      enabled: wf.enabled,
      steps: (wf.steps ?? []).map((s) => ({
        id: s.id,
        kind: s.kind,
        tool: s.tool,
        name: s.name ?? "",
        args: s.kind === "shell" ? String(s.args?.command ?? "") : JSON.stringify(s.args ?? {}, null, 2),
      })),
    });
    setWfOpen(true);
  }

  function addStep() {
    setDraft((d) => ({ ...d, steps: [...d.steps, { id: genId(), kind: "builtin", tool: "", name: "", args: "" }] }));
  }

  function updateStep(id: string, patch: Partial<StepDraft>) {
    setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  }

  function removeStep(id: string) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) }));
  }

  async function saveWorkflow() {
    if (!wid) return;
    if (!draft.name.trim()) { toast.error("请填写工作流名称"); return; }
    if (draft.steps.length === 0) { toast.error("请至少添加一个步骤"); return; }
    for (const s of draft.steps) {
      if (!s.tool && s.kind !== "shell") { toast.error("选择工具"); return; }
    }
    setSaving(true);
    try {
      const steps = draft.steps.map((s) => ({
        id: s.id,
        kind: s.kind,
        tool: s.tool,
        name: s.name.trim() || undefined,
        args: s.kind === "shell"
          ? { command: s.args.trim() }
          : parseJsonArgs(s.args),
      })) as WorkflowStep[];
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        trigger: draft.trigger.trim(),
        enabled: draft.enabled,
        steps,
      };
      if (draft.id) {
        await api.put(`/workspaces/${wid}/workflows/${draft.id}`, body);
        toast.success("保存成功");
      } else {
        await api.post(`/workspaces/${wid}/workflows`, body);
        toast.success("创建成功");
      }
      setWfOpen(false);
      queryClient.invalidateQueries({ queryKey: ["workflows", wid] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkflow(wf: Workflow) {
    if (!wid || !window.confirm("删除该工作流？")) return;
    try {
      await api.delete(`/workspaces/${wid}/workflows/${wf.id}`);
      toast.success("删除成功");
      queryClient.invalidateQueries({ queryKey: ["workflows", wid] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  function runWorkflow(wf: Workflow) {
    send(`运行\uff1a${wf.name}`);
  }

  const selServer = onlineServers.find((s) => s.id === serverId);
  const inputCls = "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <div className="flex h-[calc(100vh-64px)] gap-4 p-4">
      {/* Left: server + quick actions + workflows */}
      <aside className="w-72 shrink-0 space-y-4 overflow-y-auto pr-1">
        <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />目标服务器
          </p>
          <Select value={serverId || undefined} onValueChange={(v) => v && setServerId(v)}>
            <SelectTrigger size="sm"><SelectValue placeholder="请选择" /></SelectTrigger>
            <SelectContent>
              {onlineServers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {onlineServers.length === 0 && <p className="text-[11px] text-muted-foreground">无在线服务器</p>}
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">快捷能力</p>
          <div className="grid grid-cols-1 gap-1.5">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.label}
                onClick={() => send(q.prompt)}
                disabled={!serverId || loading}
                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Send className="h-3 w-3 text-primary shrink-0" />
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="h-3.5 w-3.5 text-cyan-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">工作流</p>
            <Button size="xs" variant="outline" className="ml-auto" onClick={openCreate}>
              <Plus className="h-3 w-3 mr-0.5" />新建
            </Button>
          </div>
          {(workflows ?? []).length === 0 ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed">还没有工作流，点击“+ 新建”创建第一个</p>
          ) : (
            <div className="space-y-2">
              {(workflows ?? []).map((wf) => (
                <div key={wf.id} className="rounded-lg border border-border bg-background/40 p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <WorkflowIcon className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span className="text-xs font-medium truncate">{wf.name}</span>
                    <span className={cn(
                      "ml-auto text-[10px] px-1.5 py-0.5 rounded border shrink-0",
                      wf.enabled ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-muted-foreground border-border bg-muted"
                    )}>
                      {wf.enabled ? "启用" : "停用"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {wf.trigger ? `触发\uff1a${wf.trigger}` : "无触发词"} · {(wf.steps ?? []).length} 步
                  </p>
                  <div className="flex gap-1">
                    <Button size="xs" variant="outline" className="flex-1" onClick={() => runWorkflow(wf)} disabled={loading || !serverId}>
                      <Play className="h-3 w-3 mr-1" />运行
                    </Button>
                    <Button size="xs" variant="ghost" className="px-2" onClick={() => openEdit(wf)} title="编辑">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="xs" variant="ghost" className="px-2 text-muted-foreground hover:text-red-400" onClick={() => deleteWorkflow(wf)} title="删除">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat */}
      <main className="flex-1 flex flex-col min-w-0 rounded-xl border border-border bg-card/30 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary shrink-0">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">运维智能体</p>
            <p className="text-xs text-muted-foreground truncate">一句话描述意图 · 支持巡检 / 排查 / 终端 / 周报 / 自定义工作流</p>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {selServer && (
              <Badge variant="outline" className="text-[11px] gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                {selServer.name} · 在线
              </Badge>
            )}
            <button
              onClick={() => { setMessages([]); setInput(""); }}
              disabled={loading}
              title="新对话（清空当前会话，回到工作台）"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 h-7 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5 text-primary" />新对话
            </button>
            <Link href="/diagnoses" className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 h-7 text-xs text-foreground hover:bg-muted transition-colors">
              <History className="h-3.5 w-3.5" />排查记录
            </Link>
            <Link href="/inspections" className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 h-7 text-xs text-foreground hover:bg-muted transition-colors">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />巡检报告
            </Link>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="min-h-full flex flex-col">
              <div className="mx-auto w-full max-w-4xl space-y-5 py-5">
                <div className="text-center space-y-1.5">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                    <Bot className="h-6 w-6" />
                  </div>
                  <h2 className="text-xl font-bold">运维智能体</h2>
                  <p className="text-sm text-muted-foreground">一句话描述意图，或直接点选能力 · 自动调用巡检 / 排查 / 终端 / 周报</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 items-start">
                  <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />快捷能力
                      </p>
                      <span className="text-[11px] text-muted-foreground">点按直达子智能体</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CAP_CARDS.map((c) => (
                        <button
                          key={c.agent}
                          disabled={!serverId || loading}
                          onClick={() => send(c.prompt, c.agent)}
                          className={cn(
                            "group flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-3 text-left transition-colors hover:shadow-sm disabled:opacity-50",
                            c.hover
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border shrink-0", c.iconBox)}>
                              <c.icon className="h-4 w-4" />
                            </span>
                            <span className="text-sm font-semibold">{c.name}</span>
                            <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" />安全模式：只读命令白名单执行，修复操作需人工确认
                    </p>
                  </section>

                  <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4 text-sky-400" />
                      <p className="text-sm font-semibold">本周运维速览</p>
                      <button
                        onClick={loadWeekly}
                        disabled={weeklyLoading}
                        title="刷新速览"
                        className="ml-auto p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", weeklyLoading && "animate-spin")} />
                      </button>
                    </div>
                    {weeklyLoading && !weekly ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
                        <Loader2 className="h-4 w-4 animate-spin text-sky-400" />正在汇总近 7 天数据…
                      </div>
                    ) : weekly ? (
                      <div className="space-y-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">自主排查</span>
                          <span className="font-semibold">
                            {weekly.runCount} 次
                            <span className="text-xs text-muted-foreground font-normal">
                              （成功 {weekly.byStatus.success ?? 0}
                              {weekly.byStatus.failed ? ` / 失败 ${weekly.byStatus.failed}` : ""}）
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">自动触发 / 取证</span>
                          <span className="font-semibold">{weekly.autoCount} 次 / {weekly.totalSteps} 步</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">复检已恢复 / 仍异常</span>
                          <span className="font-semibold">
                            <span className="text-emerald-500">{weekly.recoveredCount}</span>
                            {" / "}
                            {weekly.stillFailingCount > 0
                              ? <span className="text-red-400">{weekly.stillFailingCount}</span>
                              : "0"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">预估节省人工时间</span>
                          <span className="font-semibold text-emerald-500">约 {weekly.savedMinEstimate} 分钟</span>
                        </div>
                        {weekly.prevRunCount > 0 && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">排查环比上周期</span>
                            <span className={cn("font-semibold text-xs", weekly.runCount >= weekly.prevRunCount ? "text-violet-400" : "text-muted-foreground")}>
                              {weekly.runCount >= weekly.prevRunCount ? "+" : ""}{weekly.runCount - weekly.prevRunCount} 次（上周期 {weekly.prevRunCount}）
                            </span>
                          </div>
                        )}
                        {weekly.uptimePct != null && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">外网可用率</span>
                            <span className="font-semibold text-sky-400">{weekly.uptimePct}%</span>
                          </div>
                        )}
                        {weekly.diskForecasts.filter((f) => f.etaDays != null && f.etaDays <= 30).slice(0, 1).map((f) => (
                          <p key={f.serverName} className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 px-2.5 py-1.5">
                            ⚠ {f.serverName} 预计约 {f.etaDays} 天后写满（当前 {f.usedPct}%）
                          </p>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => send("帮我用自然语言总结这周的运维情况", "weekly")} disabled={!serverId || loading}>
                            <Sparkles className="h-3.5 w-3.5 mr-1" />智能体解读
                          </Button>
                          <Button size="sm" className="flex-1" onClick={() => send("生成这周的 AI 运维周报", "weekly")} disabled={!serverId || loading}>
                            <BarChart3 className="h-3.5 w-3.5 mr-1" />完整周报
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center space-y-2">
                        <p className="text-sm text-muted-foreground">近 7 天还没有排查记录</p>
                        <p className="text-xs text-muted-foreground/70">先点上方「AI 巡检 / 自主排查」，完成后这里会自动生成周报速览与趋势预测。</p>
                      </div>
                    )}
                  </section>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      disabled={!serverId || loading}
                      className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex gap-3 flex-row-reverse">
                    <div className="max-w-[75%] min-w-0 text-right">
                      <div className="rounded-lg bg-primary text-primary-foreground rounded-br-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap inline-block text-left">
                        {m.content}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{fmtTime(m.createdAt)}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <AiMessage msg={m} />
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60 px-4 py-3">
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[11px] text-muted-foreground/70 mr-0.5">快捷切换：</span>
              {CAP_CARDS.map((c) => (
                <button
                  key={c.agent}
                  onClick={() => send(c.prompt, c.agent)}
                  disabled={!serverId || loading}
                  title={c.desc}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 pl-1 pr-2.5 h-7 text-[11px] text-foreground transition-colors disabled:opacity-50", c.hover)}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", c.iconBox)}>
                    <c.icon className="h-3 w-3" />
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className={cn(
            "flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-3 shadow-sm",
            "focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10"
          )}>
            <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={listening ? "正在聆听，请说话…" : "描述意图，如：检查服务器健康 / 网站504排查 / 生成本周周报…"}
              disabled={!serverId || loading}
              className="flex-1 bg-transparent outline-none text-sm px-1 py-2 placeholder:text-muted-foreground/60"
            />
            {micSupported && (
              <button
                onClick={toggleMic}
                disabled={!serverId || loading}
                title={listening ? "停止录音" : "语音输入"}
                className={cn(
                  "size-9 shrink-0 rounded-lg inline-flex items-center justify-center transition-colors",
                  listening
                    ? "bg-red-500/15 text-red-400 animate-pulse"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                )}
              >
                {listening ? <span className="flex items-end gap-0.5 h-4">
                  {[0, 1, 2].map((i) => <span key={i} className="w-0.5 bg-red-400 rounded-full animate-pulse" style={{ height: `${6 + i * 3}px` }} />)}
                </span> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={!input.trim() || !serverId || loading}
              title="发消息给运维智能体"
              className="size-9 shrink-0 rounded-lg bg-primary text-primary-foreground inline-flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            已自动调用：巡检 / 排查 / 周报 / 命令 / 工作流，安全模式下仅执行只读操作
          </p>
        </div>
      </main>

      {/* Workflow builder */}
      <Dialog open={wfOpen} onOpenChange={setWfOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WorkflowIcon className="h-5 w-5 text-cyan-400" />创建工作流
            </DialogTitle>
            <DialogDescription>
              一句话描述意图，自动调用巡检 / 排查 / 命令 / 工作流
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>名称</Label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="名称" className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label>触发关键词</Label>
              <input value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} placeholder="可选，消息包含该词时自动运行此工作流" className={inputCls} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm">启用</span>
              <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>步骤 ({draft.steps.length})</Label>
                <Button size="xs" variant="outline" onClick={addStep}><Plus className="h-3 w-3 mr-1" />添加步骤</Button>
              </div>
              {draft.steps.length === 0 && (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border p-3 text-center">请至少添加一个步骤</p>
              )}
              {draft.steps.map((st, i) => (
                <div key={st.id} className="rounded-lg border border-border p-3 space-y-2 bg-background/40">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{i + 1}</span>
                    <Select value={st.kind} onValueChange={(v) => updateStep(st.id, { kind: v as StepDraft["kind"], tool: "" })}>
                      <SelectTrigger size="sm" className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="builtin">内置工具</SelectItem>
                        <SelectItem value="shell">Shell 命令</SelectItem>
                        <SelectItem value="mcp">MCP 工具</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="xs" variant="ghost" className="px-2 text-muted-foreground hover:text-red-400" onClick={() => removeStep(st.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {st.kind !== "shell" && (
                    <Select value={st.tool} onValueChange={(v) => updateStep(st.id, { tool: v ?? "" })}>
                      <SelectTrigger size="sm"><SelectValue placeholder="选择工具" /></SelectTrigger>
                      <SelectContent className="max-h-72 min-w-[30rem]">
                        {(st.kind === "mcp" ? (catalog?.mcp ?? []) : (catalog?.builtin ?? [])).map((t) => (
                          <SelectItem key={t.id} value={t.id} className="flex-col items-start py-1.5">
                            <span className="font-mono text-xs leading-snug">{t.name}</span>
                            <span className="text-muted-foreground text-xs leading-snug min-w-0 whitespace-normal">{t.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {st.kind === "shell" ? (
                    <div className="space-y-1">
                      <Label className="text-[11px]">命令内容</Label>
                      <input value={st.args} onChange={(e) => updateStep(st.id, { args: e.target.value })} placeholder="df -h" className={inputCls} />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-[11px]">JSON 参数（可选）</Label>
                      <textarea value={st.args} onChange={(e) => updateStep(st.id, { args: e.target.value })} rows={2} placeholder='{"name": "nginx"}' className={cn(inputCls, "font-mono text-xs")} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWfOpen(false)}>取消</Button>
            <Button onClick={saveWorkflow} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}