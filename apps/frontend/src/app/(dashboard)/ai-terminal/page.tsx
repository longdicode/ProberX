"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { cn, formatDuration } from "@/lib/utils";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Clock,
  Container,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Info,
  Loader2,
  MemoryStick,
  Save,
  Send,
  Server,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

type Message = {
  id: string;
  role: "user" | "ai" | "system" | "command";
  content: string;
  command?: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  timestamp: number;
};

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const PROVIDERS: { value: string; label: string; dot: string }[] = [
  { value: "openai", label: "OpenAI", dot: "bg-emerald-400" },
  { value: "deepseek", label: "DeepSeek", dot: "bg-sky-400" },
  { value: "claude", label: "Claude", dot: "bg-orange-400" },
  { value: "custom", label: "自定义", dot: "bg-violet-400" },
];

const PROVIDER_DEFAULTS: Record<string, { model: string; url: string }> = {
  openai: { model: "gpt-4o-mini", url: "" },
  claude: { model: "claude-sonnet-4-6", url: "" },
  deepseek: { model: "deepseek-chat", url: "https://api.deepseek.com/v1" },
  custom: { model: "", url: "" },
};

const SUGGESTIONS: { icon: LucideIcon; label: string; prompt: string }[] = [
  { icon: HardDrive, label: "查看磁盘使用", prompt: "show disk usage" },
  { icon: Cpu, label: "CPU 占用", prompt: "check cpu usage and top processes" },
  { icon: Container, label: "Docker 容器", prompt: "list running docker containers" },
  { icon: MemoryStick, label: "内存使用", prompt: "show memory usage" },
  { icon: Globe, label: "Nginx 状态", prompt: "check nginx status" },
  { icon: Info, label: "系统信息", prompt: "show system info (os, kernel, uptime)" },
];

const CMD_SUGGESTIONS = [
  "df -h",
  "free -m",
  "uptime",
  "docker ps",
  "systemctl status nginx",
  "top -bn1 | head -20",
];

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function AiTerminalPage() {
  const { t } = useLocale();
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);
  const [selectedServer, setSelectedServer] = useState("");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"ai" | "cmd">("ai");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [cfgProvider, setCfgProvider] = useState("openai");
  const [cfgModel, setCfgModel] = useState("");
  const [cfgApiKey, setCfgApiKey] = useState("");
  const [cfgApiUrl, setCfgApiUrl] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const apiKeyManuallySet = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onlineServers = (servers || []).filter((s) => s.isOnline);
  const wid = current?.id || "";
  const sid = selectedServer;
  const currentServer = onlineServers.find((s) => s.id === sid);
  const activeProvider = PROVIDERS.find((p) => p.value === cfgProvider) || PROVIDERS[0];

  const endpoint = useCallback(
    (path: string) => {
      if (!wid || !sid) return "";
      return `/workspaces/${wid}/servers/${sid}${path}`;
    },
    [wid, sid]
  );

  useEffect(() => {
    if (!wid || !sid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ provider: string; model: string; api_key: string; api_url: string }>(
          endpoint("/tools/shell-ai/settings")
        );
        if (cancelled || !res) return;
        if (res.provider) setCfgProvider(res.provider);
        if (res.model) setCfgModel(res.model);
        if (res.api_url) setCfgApiUrl(res.api_url);
        if (res.api_key) setCfgApiKey(res.api_key);
      } catch {
        /* no saved config yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wid, sid, endpoint]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (onlineServers.length > 0 && !sid) setSelectedServer(onlineServers[0].id);
  }, [onlineServers, sid]);

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || !sid || loading) return;
    setInput("");
    setLoading(true);
    inputRef.current?.focus();

    // 命令模式：直接执行输入的命令
    if (mode === "cmd") {
      await runCommand(content.replace(/^\$+\s*/, ""));
      return;
    }

    const userMsg: Message = { id: genId(), role: "user", content, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    const startedAt = Date.now();
    try {
      const gen = await api.post<{ command: string; explanation?: string }>(
        endpoint("/tools/shell-ai/generate"),
        {
          prompt: content,
          provider: cfgProvider,
          model: cfgModel || undefined,
          api_key: apiKeyManuallySet.current ? cfgApiKey : undefined,
          api_url: cfgApiUrl || undefined,
        }
      );

      const aiMsg: Message = {
        id: genId(),
        role: "ai",
        content: gen.explanation || `Command: \`${gen.command}\``,
        command: gen.command,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      const cmdMsg: Message = {
        id: genId(),
        role: "command",
        content: "Executing...",
        command: gen.command,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, cmdMsg]);
      setLoading(false);

      const exec = await api.post<{ stdout: string; stderr: string; exit_code: number }>(
        endpoint("/tools/shell-ai/execute"),
        { command: gen.command, timeout: 30 }
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === cmdMsg.id
            ? {
                ...m,
                content: exec.stdout || exec.stderr || "(empty)",
                output: exec.stdout || exec.stderr,
                exitCode: exec.exit_code,
                durationMs: Date.now() - startedAt,
              }
            : m
        )
      );
    } catch (e) {
      setLoading(false);
      const raw = e instanceof Error ? e.message : "Execution failed";
      const friendly = /api_key is required/i.test(raw)
        ? "AI 尚未配置 API Key，请点击右上角 ⚙ 完成配置"
        : raw;
      setMessages((prev) => [
        ...prev,
        {
          id: genId(),
          role: "system",
          content: friendly,
          timestamp: Date.now(),
        },
      ]);
    }
  }

  async function runCommand(cmd: string) {
    const startedAt = Date.now();
    const cmdMsg: Message = {
      id: genId(),
      role: "command",
      content: "Executing...",
      command: cmd,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, cmdMsg]);
    try {
      const exec = await api.post<{ stdout: string; stderr: string; exit_code: number }>(
        endpoint("/tools/shell-ai/execute"),
        { command: cmd, timeout: 30 }
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === cmdMsg.id
            ? {
                ...m,
                content: exec.stdout || exec.stderr || "(empty)",
                output: exec.stdout || exec.stderr,
                exitCode: exec.exit_code,
                durationMs: Date.now() - startedAt,
              }
            : m
        )
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Execution failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === cmdMsg.id
            ? { ...m, content: raw, output: raw, exitCode: -1, durationMs: Date.now() - startedAt }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleCfgProviderChange(v: string | null) {
    if (!v) return;
    setCfgProvider(v);
    setCfgModel(PROVIDER_DEFAULTS[v]?.model || "");
    setCfgApiUrl(PROVIDER_DEFAULTS[v]?.url || "");
  }

  async function saveAiConfig() {
    if (!wid || !sid || savingConfig) return;
    setSavingConfig(true);
    setConfigError("");
    try {
      await api.put(endpoint("/tools/shell-ai/settings"), {
        provider: cfgProvider,
        model: cfgModel || undefined,
        api_key: apiKeyManuallySet.current ? cfgApiKey : undefined,
        api_url: cfgApiUrl || undefined,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      setConfigOpen(false);
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingConfig(false);
    }
  }

  function clearChat() {
    setMessages([]);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border/60 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-indigo-500 to-fuchsia-500 shadow-lg shadow-primary/30">
              <Terminal className="size-4 text-white" />
            </div>
            <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full border-2 border-background bg-emerald-400" />
            </span>
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold">{t("nav.aiTerminal")}</h1>
            <p className="text-xs text-muted-foreground">
              {onlineServers.length > 0 ? (
                <>
                  <span className="font-medium text-emerald-500">{onlineServers.length}</span> 台服务器在线
                </>
              ) : (
                "暂无在线服务器"
              )}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select value={selectedServer} onValueChange={(v) => setSelectedServer(v || "")}>
            <SelectTrigger size="sm" className="w-44 sm:w-52">
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              <Server className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder="选择服务器" />
            </SelectTrigger>
            <SelectContent>
              {onlineServers.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">没有在线服务器</div>
              )}
              {onlineServers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span className="truncate">{s.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mode === "ai" && (
          <Select value={cfgProvider} onValueChange={handleCfgProviderChange}>
            <SelectTrigger size="sm" className="w-28">
              <span className={cn("size-2 shrink-0 rounded-full", activeProvider.dot)} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-1.5 shrink-0 rounded-full", p.dot)} />
                    {p.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}

          {mode === "ai" && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfigOpen(true)}
            title="AI 配置"
            aria-label="AI 配置"
          >
            <Settings2 className="size-4" />
          </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={clearChat} title="清空对话" aria-label="清空对话">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 ? (
            <EmptyState mode={mode} onPick={(p) => handleSend(p)} online={onlineServers.length > 0} />
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
          {loading && (
            <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>AI 正在生成命令并执行…</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/60 px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 pl-3 shadow-sm transition-all",
              "focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10"
            )}
          >
            <div className="flex shrink-0 items-center gap-1 rounded-xl bg-muted/80 p-1">
              <button
                type="button"
                onClick={() => setMode("ai")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  mode === "ai" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sparkles className="size-3.5" />
                AI
              </button>
              <button
                type="button"
                onClick={() => setMode("cmd")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  mode === "cmd" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Terminal className="size-3.5" />
                命令
              </button>
            </div>
            {currentServer && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="max-w-24 truncate">{currentServer.name}</span>
              </span>
            )}
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                sid
                  ? mode === "cmd"
                    ? "输入 Shell 命令，例如：ls -la"
                    : "用自然语言描述你想做的事，例如「查看磁盘使用」…"
                  : "请先选择一台在线服务器"
              }
              disabled={!sid || loading}
              className="h-auto flex-1 border-0 bg-transparent px-1 py-2.5 text-[0.95rem] shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              onClick={() => handleSend()}
              disabled={!sid || !input.trim() || loading}
              size="icon"
              className="size-9 shrink-0 rounded-xl bg-gradient-to-br from-primary to-indigo-600 shadow-md shadow-primary/30 hover:opacity-90 dark:from-indigo-500 dark:to-fuchsia-600"
              aria-label="发送"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
            {mode === "cmd"
              ? "命令将在所选服务器上直接执行 · Enter 执行 · 仅对在线服务器生效"
              : "AI 会根据描述生成 Shell 命令并自动执行 · Enter 发送 · 仅对在线服务器生效"}
          </p>
        </div>
      </div>

      {/* AI 配置弹窗 */}
      <Dialog open={configOpen} onOpenChange={(v) => { setConfigOpen(v); if (!v) setConfigError(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-primary" />
              AI 配置
            </DialogTitle>
            <DialogDescription>
              配置 AI 生成 Shell 命令所用的模型与密钥，保存到当前服务器。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Provider</label>
                <Select value={cfgProvider} onValueChange={handleCfgProviderChange}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">模型</label>
                <Input
                  className="h-8 text-xs"
                  value={cfgModel}
                  onChange={(e) => setCfgModel(e.target.value)}
                  placeholder={PROVIDER_DEFAULTS[cfgProvider]?.model || "model-id"}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API Key</label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  className="h-8 pr-9 text-xs"
                  value={cfgApiKey}
                  onChange={(e) => {
                    apiKeyManuallySet.current = true;
                    setCfgApiKey(e.target.value);
                  }}
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}
                >
                  {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                已保存的密钥会以掩码显示，重新填写才会更新。
              </p>
            </div>

            {cfgProvider === "custom" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">API 地址</label>
                <Input
                  className="h-8 text-xs"
                  value={cfgApiUrl}
                  onChange={(e) => setCfgApiUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </div>
            )}

            {configError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="size-3.5 shrink-0" />
                {configError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={saveAiConfig} disabled={savingConfig}>
              {savingConfig ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : savedFlash ? (
                <Check className="size-3.5" />
              ) : (
                <Save className="size-3.5" />
              )}
              {savedFlash ? "已保存" : "保存配置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ mode, onPick, online }: { mode: "ai" | "cmd"; onPick: (prompt: string) => void; online: boolean }) {
  if (mode === "cmd") {
    return (
      <div className="flex flex-col items-center pt-8 text-center sm:pt-12">
        <div className="relative mb-6">
          <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/30">
            <Terminal className="size-8 text-white" />
          </div>
        </div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Terminal className="size-4 text-emerald-500" />
          直接输入命令执行
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          在下方输入 Shell 命令，按 Enter 即可在所选服务器上直接执行，无需 AI 参与。
        </p>

        <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {CMD_SUGGESTIONS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onPick(cmd)}
              disabled={!online}
              className={cn(
                "group flex flex-col items-start gap-2.5 rounded-xl border border-border/70 bg-card p-4 text-left transition-all",
                "hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:shadow-lg hover:shadow-emerald-500/10",
                "disabled:pointer-events-none disabled:opacity-40"
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-500 transition-transform group-hover:scale-110">
                <Terminal className="size-4" />
              </span>
              <span className="break-all font-mono text-xs">{cmd}</span>
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-emerald-500">
                执行 <ChevronRight className="size-3" />
              </span>
            </button>
          ))}
        </div>

        {!online && (
          <p className="mt-8 flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            当前工作区没有在线服务器，请先确认服务器上的 Agent 已启动
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center pt-8 text-center sm:pt-12">
      <div className="relative mb-6">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/25 blur-3xl" />
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-indigo-500 to-fuchsia-500 shadow-xl shadow-primary/30">
          <Terminal className="size-8 text-white" />
        </div>
      </div>
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Sparkles className="size-4 text-primary" />
        用自然语言控制你的服务器
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        AI 会理解你的意图，生成安全的 Shell 命令，并在所选服务器上自动执行。
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            disabled={!online}
            className={cn(
              "group flex flex-col items-start gap-2.5 rounded-xl border border-border/70 bg-card p-4 text-left transition-all",
              "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/10",
              "disabled:pointer-events-none disabled:opacity-40"
            )}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
              <Icon className="size-4" />
            </span>
            <span className="text-sm font-medium">{label}</span>
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-primary">
              试试看 <ChevronRight className="size-3" />
            </span>
          </button>
        ))}
      </div>

      {!online && (
        <p className="mt-8 flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5" />
          当前工作区没有在线服务器，请先确认服务器上的 Agent 已启动
        </p>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-primary to-indigo-600 px-4 py-2.5 text-sm text-white shadow-md shadow-primary/20">
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          <p className="mt-1 text-right text-[10px] text-white/60">{formatTime(msg.timestamp)}</p>
        </div>
      </div>
    );
  }

  if (msg.role === "system") {
    return (
      <div className="flex justify-start gap-3">
        <Avatar icon={AlertTriangle} className="bg-destructive/10 text-destructive" />
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm">
          <p className="font-medium text-destructive">执行失败</p>
          <p className="mt-1 whitespace-pre-wrap text-destructive/90">{msg.content}</p>
        </div>
      </div>
    );
  }

  if (msg.role === "command") {
    return <TerminalWindow msg={msg} />;
  }

  return (
    <div className="flex justify-start gap-3">
      <Avatar icon={Bot} className="bg-primary/10 text-primary" />
      <div className="max-w-[85%] space-y-2.5">
        {msg.content && (
          <p className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-card px-4 py-2.5 text-sm leading-relaxed">
            {msg.content}
          </p>
        )}
        {msg.command && <CommandBlock command={msg.command} />}
      </div>
    </div>
  );
}

function Avatar({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", className)}>
      <Icon className="size-4" />
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="group flex items-center gap-1.5 overflow-hidden rounded-xl border border-border bg-muted/60 pr-1">
      <code className="flex-1 truncate px-3 py-2 font-mono text-xs text-foreground">{command}</code>
      <Button variant="ghost" size="icon-xs" onClick={copy} title="复制命令" aria-label="复制命令">
        {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      </Button>
    </div>
  );
}

function TerminalWindow({ msg }: { msg: Message }) {
  const running = msg.exitCode === undefined;
  const success = msg.exitCode === 0;

  return (
    <div className="flex justify-start gap-3">
      <Avatar icon={Terminal} className="bg-muted text-muted-foreground" />
      <div className="min-w-0 max-w-[88%] flex-1 overflow-hidden rounded-xl border border-border bg-[#0d1117] shadow-lg shadow-black/20 dark:border-white/10">
        {/* macOS style title bar */}
        <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-3.5 py-2.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 flex items-center gap-1.5 truncate font-mono text-[11px] text-white/40">
            <Terminal className="size-3 shrink-0" />
            {msg.command ? truncate(msg.command, 44) : "bash"}
          </span>
          {msg.durationMs !== undefined && (
            <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] text-white/40">
              <Clock className="size-3" />
              {formatDuration(msg.durationMs)}
            </span>
          )}
        </div>

        <div className="px-4 py-3 font-mono text-[12.5px] leading-relaxed">
          <p className="break-all text-white/90">
            <span className="mr-2 select-none text-emerald-400">$</span>
            {msg.command}
          </p>
          {running ? (
            <p className="mt-2 flex items-center gap-2 text-white/50">
              <Loader2 className="size-3.5 animate-spin" />
              正在执行…
            </p>
          ) : msg.output ? (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-[12.5px] text-[#c9d1d9]">
              {msg.output}
            </pre>
          ) : null}
          {!running && (
            <div
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
                success ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"
              )}
            >
              {success ? <Check className="size-3" /> : <X className="size-3" />}
              {success ? "exit 0" : `exit ${msg.exitCode}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
