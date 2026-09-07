"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Bot, CheckCircle2, Eye, EyeOff, FlaskConical, KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { useLocale } from "@/stores/locale-store";
import { api } from "@/lib/api-client";

interface Props {
  workspaceId: string;
}

interface AiSettings {
  enabled: boolean;
  provider: string;
  apiUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
  effective: {
    provider: string;
    apiUrl: string;
    model: string;
    apiKeyConfigured: boolean;
    source: "workspace" | "env";
  };
}

interface AiTestResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  apiUrl: string;
  reply?: string;
  error?: string;
}

const PROVIDERS: { value: string; label: string; dot: string; model: string; url: string }[] = [
  { value: "openai", label: "OpenAI", dot: "bg-emerald-400", model: "gpt-4o-mini", url: "" },
  { value: "deepseek", label: "DeepSeek", dot: "bg-sky-400", model: "deepseek-chat", url: "https://api.deepseek.com/v1" },
  { value: "claude", label: "Claude", dot: "bg-orange-400", model: "claude-sonnet-4-6", url: "" },
  { value: "proberx", label: "ProberX-Coder", dot: "bg-emerald-400", model: "proberx-coder", url: "http://127.0.0.1:11434/v1" },
  { value: "custom", label: "自定义", dot: "bg-violet-400", model: "", url: "" },
];

export function AiSettingsCard({ workspaceId: wid }: Props) {
  const { t } = useLocale();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [apiUrl, setApiUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [effective, setEffective] = useState<AiSettings["effective"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [formError, setFormError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);
  const [showKey, setShowKey] = useState(false);

  async function load() {
    if (!wid) return;
    setLoading(true);
    try {
      const res = await api.get<AiSettings>(`/workspaces/${wid}/ai-settings`);
      setEnabled(res.enabled);
      setProvider(res.provider || "deepseek");
      setApiUrl(res.apiUrl || "");
      setModel(res.model || "");
      setApiKey("");
      setKeyConfigured(res.apiKeyConfigured);
      setKeyHint(res.apiKeyHint);
      setEffective(res.effective);
      setTestResult(null);
    } catch { /* toast handled by api client */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid]);

  function handleProviderChange(v: string) {
    setProvider(v);
    const preset = PROVIDERS.find((p) => p.value === v);
    if (preset) {
      if (preset.model) setModel(preset.model);
      if (preset.url) setApiUrl(preset.url);
    }
  }

  async function handleSave() {
    if (!wid || saving) return;
    setSaving(true);
    setFormError("");
    setSavedFlash(false);
    try {
      const res = await api.put<AiSettings>(`/workspaces/${wid}/ai-settings`, {
        enabled,
        provider,
        apiUrl: apiUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
        clearApiKey: false,
      });
      applyView(res);
      setApiKey("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearKey() {
    if (!wid) return;
    setFormError("");
    try {
      const res = await api.put<AiSettings>(`/workspaces/${wid}/ai-settings`, { clearApiKey: true });
      applyView(res);
      setApiKey("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "清除失败");
    }
  }

  async function handleTest() {
    if (!wid || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<AiTestResult>(`/workspaces/${wid}/ai-settings/test`, {
        enabled,
        provider,
        apiUrl: apiUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, latencyMs: 0, model: "", apiUrl: "", error: err instanceof Error ? err.message : "测试失败" });
    } finally {
      setTesting(false);
    }
  }

  function applyView(res: AiSettings) {
    setEnabled(res.enabled);
    setProvider(res.provider || "deepseek");
    setApiUrl(res.apiUrl || "");
    setModel(res.model || "");
    setKeyConfigured(res.apiKeyConfigured);
    setKeyHint(res.apiKeyHint);
    setEffective(res.effective);
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="w-4 h-4" />
          {t("settings.aiAgent")}
          {enabled ? (
            <Badge variant="secondary" className="text-[10px]">{t("settings.aiEnabledBadge")}</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("settings.aiDisabledBadge")}</Badge>
          )}
        </CardTitle>
        <CardDescription>{t("settings.aiAgentDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 px-4 py-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">{t("settings.aiAgentEnabled")}</div>
            <div className="text-xs text-muted-foreground">{t("settings.aiAgentEnabledDesc")}</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
        </div>

        {loading ? (
          <div className="py-3 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("settings.aiProvider")}</Label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  disabled={!enabled}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model-id" disabled={!enabled} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">API URL</Label>
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" disabled={!enabled} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">API Key</Label>
                  {keyConfigured && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <KeyRound className="w-3 h-3" />
                      {keyHint ?? t("settings.aiKeyConfigured")}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={keyConfigured ? t("settings.aiKeyEmptyMeansKeep") : t("settings.aiApiKeyPlaceholder")}
                    disabled={!enabled}
                    className="pr-10 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    disabled={!enabled}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? "hide" : "show"}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {effective && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t("settings.aiCurrentEffective")}：</span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn_dot(effective.source)} />
                  {effective.provider === "env" ? t("settings.aiFromEnv") : `${effective.provider} · ${t("settings.aiFromWorkspace")}`}
                </span>
                <div className="mt-1 break-all">
                  {effective.model} · {effective.apiUrl}
                  {effective.apiKeyConfigured ? "" : ` · ${t("settings.aiNoApiKey")}`}
                </div>
              </div>
            )}

            {formError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />{formError}
              </div>
            )}

            {testResult && (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${testResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
                <div>
                  <div>{testResult.ok ? t("settings.aiTestOk") : t("settings.aiTestFail")} · {testResult.latencyMs}ms</div>
                  <div className="break-all opacity-90">
                    {testResult.ok ? (testResult.reply ? `${testResult.model} · ${testResult.reply}` : `${testResult.model} · ${testResult.apiUrl}`) : testResult.error}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={!enabled || saving || loading}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : savedFlash ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                {savedFlash ? t("settings.aiSaved") : t("settings.aiSave")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || loading}>
                {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1" />}
                {t("settings.aiTest")}
              </Button>
              {keyConfigured && enabled && (
                <Button size="sm" variant="ghost" onClick={handleClearKey} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-1" />{t("settings.aiClearKey")}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function cn_dot(source: "workspace" | "env"): string {
  return `size-2 shrink-0 rounded-full ${source === "workspace" ? "bg-sky-400" : "bg-muted-foreground"}`;
}
