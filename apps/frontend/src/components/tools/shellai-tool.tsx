"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Check, Play, Terminal } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function ShellAITool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [timeout, setTimeoutVal] = useState("30");
  const [generating, setGenerating] = useState(false);
  const [generatedCmd, setGeneratedCmd] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ stdout: string; stderr: string; exit_code: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const hasSavedRef = useRef(false);
  const apiKeyManuallySet = useRef(false);

  // Load saved config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await api.get<{ provider: string; model: string; api_key: string; api_url: string }>(
          endpoint("/tools/shell-ai/settings")
        );
        if (res) {
          if (res.provider) setProvider(res.provider);
          if (res.model) setModel(res.model);
          if (res.api_url) setApiUrl(res.api_url);
          // api_key is returned masked (e.g. "sk-****"), only set if user hasn''t typed a new one
          if (!apiKeyManuallySet.current && res.api_key) {
            setApiKey(res.api_key);
          }
        }
      } catch {
        // No saved config yet, use defaults
      } finally {
        setConfigLoaded(true);
      }
    }
    loadConfig();
  }, []);

  // Auto-save config when settings change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveConfig = useCallback(() => {
    if (!configLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.put(endpoint("/tools/shell-ai/settings"), {
          provider,
          model: model || undefined,
          api_key: apiKeyManuallySet.current ? apiKey : undefined,
          api_url: apiUrl || undefined,
        });
        hasSavedRef.current = true;
      } catch {
        // Silently fail - config save is best-effort
      }
    }, 800);
  }, [provider, model, apiKey, apiUrl, configLoaded]);

  useEffect(() => {
    if (!configLoaded) return;
    saveConfig();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [provider, model, apiKey, apiUrl, configLoaded, saveConfig]);

  const handleProviderChange = (v: string) => {
    if (!v) return;
    setProvider(v);
    setModel(providerDefaults[v]?.model || "");
    setApiUrl(providerDefaults[v]?.url || "");
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    apiKeyManuallySet.current = true;
    setApiKey(e.target.value);
  };

  async function handleGenerate() {
    if (!prompt) return;
    setGenerating(true);
    setError("");
    setGeneratedCmd("");
    setExplanation("");
    setResult(null);
    try {
      const res = await api.post<{ command: string; explanation?: string }>(endpoint("/tools/shell-ai/generate"), {
        prompt,
        provider,
        model: model || undefined,
        api_key: apiKey || undefined,
        api_url: apiUrl || undefined,
      });
      setGeneratedCmd(res?.command || "");
      setExplanation(res?.explanation || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleExecute() {
    if (!generatedCmd) return;
    setExecuting(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post<{ stdout: string; stderr: string; exit_code: number }>(endpoint("/tools/shell-ai/execute"), {
        command: generatedCmd,
        timeout: parseInt(timeout, 10) || 30,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setExecuting(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const providerDefaults: Record<string, { model: string; url: string }> = {
    openai: { model: "gpt-4o-mini", url: "" },
    claude: { model: "claude-sonnet-4-6", url: "" },
    deepseek: { model: "deepseek-chat", url: "https://api.deepseek.com/v1" },
    custom: { model: "", url: "" },
  };

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />

      {/* AI Settings (collapsible) */}
      <Card>
        <button
          type="button"
          className="w-full flex items-center justify-between p-4 text-left"
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <span className="text-sm font-medium">{t("tools.shellaiSettings")}</span>
          {settingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {settingsOpen && (
          <CardContent className="space-y-3 pt-0">
            <p className="text-xs text-muted-foreground">{t("tools.shellaiConfigureProvider")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("tools.shellaiProvider")}</label>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="claude">Anthropic Claude</SelectItem>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="custom">{t("common.unknown")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("tools.shellaiModel")}</label>
                <Input className="h-8 text-xs" value={model} onChange={(e) => setModel(e.target.value)} placeholder={providerDefaults[provider]?.model || "model-id"} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.shellaiApiKey")}</label>
              <Input type="password" className="h-8 text-xs" value={apiKey} onChange={handleApiKeyChange} placeholder="sk-..." />
            </div>
            {provider === "custom" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("tools.shellaiApiUrl")}</label>
                <Input className="h-8 text-xs" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder={t("tools.shellaiApiUrlPlaceholder")} />
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Prompt Input */}
      <div className="space-y-3">
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("tools.shellaiPromptPlaceholder")}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
        />
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={generating || !prompt}>
            <Terminal className="w-4 h-4 mr-1" />
            {generating ? t("tools.shellaiGenerating") : t("tools.shellaiGenerate")}
          </Button>
          <div className="flex items-center gap-1 ml-auto">
            <label className="text-xs text-muted-foreground">{t("tools.shellaiTimeout")}</label>
            <Input type="number" className="w-16 h-7 text-xs" value={timeout} onChange={(e) => setTimeoutVal(e.target.value)} min="5" max="300" />
          </div>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}

      {/* Generated Command */}
      {generatedCmd && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("tools.shellaiGeneratedCommand")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <pre className="flex-1 text-sm font-mono bg-muted/30 p-3 rounded-md whitespace-pre-wrap overflow-x-auto">{generatedCmd}</pre>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            {explanation && <p className="text-xs text-muted-foreground"><strong>{t("tools.shellaiExplanation")}:</strong> {explanation}</p>}
            <div className="flex gap-2">
              <Button onClick={handleExecute} disabled={executing} variant="default" size="sm">
                <Play className="w-3 h-3 mr-1" />{executing ? t("tools.shellaiExecuting") : t("tools.shellaiExecute")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setGeneratedCmd(""); setExplanation(""); setResult(null); }}>
                {t("tools.shellaiCancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution Output */}
      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {t("tools.shellaiOutput")}
              <Badge variant={result.exit_code === 0 ? "default" : "destructive"} className="text-xs">
                {t("tools.shellaiExitCode")}: {result.exit_code}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.stdout && (
              <div>
                <label className="text-xs font-medium mb-1 block">stdout</label>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-96 overflow-auto">{result.stdout}</pre>
              </div>
            )}
            {result.stderr && (
              <div>
                <label className="text-xs font-medium mb-1 block text-destructive">{t("tools.shellaiStderr")}</label>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-destructive/10 text-destructive p-3 rounded-md max-h-48 overflow-auto">{result.stderr}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}