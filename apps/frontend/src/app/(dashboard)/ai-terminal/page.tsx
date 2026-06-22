"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Terminal, Send, Bot, User, Server, Play, Square, AlertTriangle, Check, X, Loader2, Trash2, Cog } from "lucide-react";
import type { Server as ServerType } from "@/hooks/use-api";

type Message = {
  id: string;
  role: "user" | "ai" | "system" | "command";
  content: string;
  command?: string;
  output?: string;
  exitCode?: number;
  timestamp: number;
};

function genId() { return Math.random().toString(36).slice(2, 10); }

export default function AiTerminalPage() {
  const { t } = useLocale();
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);
  const [selectedServer, setSelectedServer] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("openai");
  const scrollRef = useRef<HTMLDivElement>(null);

  const onlineServers = (servers || []).filter(s => s.isOnline);
  const wid = current?.id || "";
  const sid = selectedServer;

  const endpoint = useCallback((path: string) => {
    if (!wid || !sid) return "";
    return `/workspaces/${wid}/servers/${sid}${path}`;
  }, [wid, sid]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);

  useEffect(() => {
    if (onlineServers.length > 0 && !sid) setSelectedServer(onlineServers[0].id);
  }, [onlineServers, sid]);

  async function handleSend() {
    const text = input.trim();
    if (!text || !sid) return;
    setInput("");
    setLoading(true);

    const userMsg: Message = { id: genId(), role: "user", content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      // 1. Generate command via AI
      const gen = await api.post<{ command: string; explanation?: string }>(
        endpoint("/tools/shell-ai/generate"),
        { prompt: text, provider, model: "", api_key: "", api_url: "" }
      );

      const aiMsg: Message = {
        id: genId(), role: "ai", content: gen.explanation || `Command: \`${gen.command}\``,
        command: gen.command, timestamp: Date.now()
      };
      setMessages(prev => [...prev, aiMsg]);

      // 2. Execute the command
      const cmdMsg: Message = { id: genId(), role: "command", content: `Executing...`, command: gen.command, timestamp: Date.now() };
      setMessages(prev => [...prev, cmdMsg]);
      setLoading(false);

      const exec = await api.post<{ stdout: string; stderr: string; exit_code: number }>(
        endpoint("/tools/shell-ai/execute"),
        { command: gen.command, timeout: 30 }
      );

      setMessages(prev => prev.map(m => m.id === cmdMsg.id ? {
        ...m, content: exec.stdout || exec.stderr || "(empty)", output: exec.stdout || exec.stderr, exitCode: exec.exit_code
      } : m));

    } catch (e) {
      setLoading(false);
      setMessages(prev => [...prev, {
        id: genId(), role: "system", content: e instanceof Error ? e.message : "Execution failed", timestamp: Date.now()
      }]);
    }
  }

  function clearChat() { setMessages([]); }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 py-4 px-1 shrink-0">
        <Terminal className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-semibold">{t("nav.aiTerminal")}</h1>
        <Select value={selectedServer} onValueChange={(v) => setSelectedServer(v || "")}>
          <SelectTrigger size="sm" className="w-48 ml-auto">
            <Server className="w-4 h-4 mr-1" />
            <SelectValue placeholder={t("tools.selectServer")} />
          </SelectTrigger>
          <SelectContent>
            {onlineServers.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={(v) => setProvider(v || "openai")}>
          <SelectTrigger size="sm" className="w-28">
            <Cog className="w-4 h-4 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="deepseek">DeepSeek</SelectItem>
            <SelectItem value="claude">Claude</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon-sm" onClick={clearChat} title="Clear chat">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-2 pr-2">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-20">
            <Terminal className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">{t("nav.aiTerminal")}</p>
            <p className="text-sm mt-1">Select a server and type a command in natural language.</p>
            <p className="text-xs mt-4 text-muted-foreground/60">Examples: "show disk usage", "list running docker containers", "check nginx status"</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">AI is thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="py-3 px-1 shrink-0 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={sid ? "Describe what you want to do..." : "Select a server first"}
            disabled={!sid || loading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!sid || !input.trim() || loading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") return (
    <div className="flex gap-3 justify-end">
      <Card className="max-w-[80%] bg-primary/10 border-primary/20">
        <CardContent className="p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4" />
            <span className="font-medium text-xs">You</span>
          </div>
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </CardContent>
      </Card>
    </div>
  );

  if (msg.role === "system") return (
    <div className="flex gap-3">
      <Card className="max-w-[80%] bg-destructive/10 border-destructive/20">
        <CardContent className="p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="font-medium text-xs text-destructive">Error</span>
          </div>
          <p className="whitespace-pre-wrap text-destructive">{msg.content}</p>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex gap-3">
      <Card className={cn("max-w-[85%]", msg.role === "command" ? "bg-muted/30 border-border/50" : "bg-card")}>
        <CardContent className="p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            {msg.role === "ai" ? <Bot className="w-4 h-4 text-primary" /> : <Terminal className="w-4 h-4 text-muted-foreground" />}
            <span className="font-medium text-xs">{msg.role === "ai" ? "AI" : "Command"}</span>
            {msg.exitCode !== undefined && (
              <span className={cn("text-xs ml-1", msg.exitCode === 0 ? "text-green-500" : "text-destructive")}>
                {msg.exitCode === 0 ? <Check className="w-3 h-3 inline" /> : <X className="w-3 h-3 inline" />}
              </span>
            )}
            {msg.role === "command" && !msg.output && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
          </div>
          {msg.command && (
            <code className="block bg-muted px-2 py-1 rounded text-xs mb-1 font-mono select-all">{msg.command}</code>
          )}
          {msg.output ? (
            <pre className="text-xs font-mono bg-black/30 text-green-400 p-2 rounded overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">{msg.output}</pre>
          ) : (
            <p className="whitespace-pre-wrap text-muted-foreground">{msg.content}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
