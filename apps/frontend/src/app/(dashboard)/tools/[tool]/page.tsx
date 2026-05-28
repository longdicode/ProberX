"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers } from "@/hooks/use-api";
import type { Server } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, Wrench, Settings, Shield, FileText, Package, Globe, Rocket, Trash2, Eye, EyeOff, Play, Square, RotateCcw, RefreshCw, Server as ServerIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const toolMeta: Record<string, { titleKey: string; icon: typeof Wrench }> = {
  systemd: { titleKey: "tools.systemdTitle", icon: Settings },
  ssl: { titleKey: "tools.sslTitle", icon: Shield },
  logs: { titleKey: "tools.logsTitle", icon: FileText },
  packages: { titleKey: "tools.packagesTitle", icon: Package },
  nginx: { titleKey: "tools.nginxTitle", icon: Globe },
  deploy: { titleKey: "tools.deployTitle", icon: Rocket },
};

function ToolHeader({ meta, router, t, serverId, servers }: {
  meta: { titleKey: string; icon: typeof Wrench };
  router: ReturnType<typeof useRouter>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  serverId: string;
  servers: Server[];
}) {
  const currentServer = servers.find(s => s.id === serverId);

  function switchServer(newId: string | null) {
    if (!newId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("serverId", newId);
    router.push(window.location.pathname + "?" + params.toString());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" />{t("tools.backToTools")}
        </Button>
        <h1 className="text-xl font-semibold">{t(meta.titleKey)}</h1>
      </div>
      {currentServer && (
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border">
          <ServerIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{currentServer.name}</span>
          <ServerStatusBadge status={currentServer.isOnline ? "online" : "offline"} />
          <span className="text-xs text-muted-foreground">
            {(currentServer.hostInfo as Record<string, unknown>)?.os as string || ""}
          </span>
          {servers.length > 1 && (
            <Select value={serverId} onValueChange={switchServer}>
              <SelectTrigger size="sm" className="ml-auto w-40">
                <SelectValue placeholder={t("tools.switchServer")} />
              </SelectTrigger>
              <SelectContent>
                {servers.filter(s => s.isOnline && s.hostInfo).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);

  const serverId = searchParams.get("serverId");
  const toolId = use(params).tool;
  const meta = toolMeta[toolId];
  const onlineServers = servers?.filter(s => s.isOnline && s.hostInfo) ?? [];

  if (!meta) return <EmptyState icon={Wrench} title="Tool not found" description={`Unknown tool: ${toolId}`} />;

  if (!serverId) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/tools")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("tools.backToTools")}
        </Button>
        <EmptyState icon={meta.icon} title={t("tools.selectServer")} description={t("tools.selectServerDesc")} />
      </div>
    );
  }

  const endpoint = (path: string) => `/workspaces/${current?.id || ""}/servers/${serverId}${path}`;

  switch (toolId) {
    case "systemd": return <SystemdTool t={t} endpoint={endpoint} meta={meta} router={router} serverId={serverId} servers={onlineServers} />;
    case "ssl": return <SSLTool t={t} endpoint={endpoint} meta={meta} router={router} serverId={serverId} servers={onlineServers} />;
    case "logs": return <LogsTool t={t} endpoint={endpoint} meta={meta} router={router} serverId={serverId} servers={onlineServers} />;
    case "packages": return <PackagesTool t={t} endpoint={endpoint} meta={meta} router={router} serverId={serverId} servers={onlineServers} />;
    case "nginx": return <NginxTool t={t} endpoint={endpoint} meta={meta} router={router} serverId={serverId} servers={onlineServers} />;
    case "deploy": return <DeployTool t={t} endpoint={endpoint} meta={meta} router={router} serverId={serverId} servers={onlineServers} />;
    default: return <EmptyState icon={Wrench} title="Unknown tool" description={`Tool "${toolId}" not found`} />;
  }
}

// --- systemd ---
function SystemdTool({ t, endpoint, meta, router, serverId, servers }: any) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const fetchServices = useCallback(async () => {
    setLoading(true); setError("");
    try { setServices((await api.get<any[]>(endpoint("/tools/services"))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  async function control(name: string, action: string) {
    try {
      await api.post(endpoint("/tools/services"), { name, action });
      toast.success(`${action} ${name}: ok`);
      await fetchServices();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const filtered = services.filter((s) =>
    !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || (s.description || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : (
        <div className="space-y-3">
          <Input placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3">{t("tools.serviceName")}</th>
                  <th className="text-left p-3">{t("tools.state")}</th>
                  <th className="text-left p-3">{t("tools.description")}</th>
                  <th className="text-right p-3">{t("tools.serviceControl")}</th>
                </tr></thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.name} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{s.name}</td>
                      <td className="p-3"><Badge variant={s.active_state === "active" ? "default" : s.active_state === "failed" ? "destructive" : "secondary"} className="text-xs">{s.active_state}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{s.description || "--"}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          {s.active_state === "active" ? (
                            <><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => control(s.name, "stop")}><Square className="w-3 h-3 mr-1"/>{t("tools.stopService")}</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => control(s.name, "restart")}><RotateCcw className="w-3 h-3 mr-1"/>{t("tools.restartService")}</Button></>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => control(s.name, "start")}><Play className="w-3 h-3 mr-1"/>{t("tools.startService")}</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={4} className="text-center p-8 text-muted-foreground">No services</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// --- SSL ---
function SSLTool({ t, endpoint, meta, router, serverId, servers }: any) {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    if (!domain) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.post(endpoint("/tools/ssl"), { domain })); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3 max-w-lg">
        <Input placeholder={t("tools.domainPlaceholder")} value={domain}
          onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} />
        <Button onClick={check} disabled={loading}>{loading ? t("tools.checking") : t("tools.checkSSL")}</Button>
      </div>
      {error && <ErrorMsg msg={error} />}
      {result && (
        <Card className="max-w-lg">
          <CardContent className="p-4 space-y-2 text-sm">
            <Row t={t} label="tools.subject" value={result.subject} />
            <Row t={t} label="tools.issuer" value={result.issuer} />
            <Row t={t} label="tools.notBefore" value={result.not_before} />
            <Row t={t} label="tools.notAfter" value={result.not_after} />
            <div className="flex justify-between"><span className="text-muted-foreground">{t("tools.daysLeft")}</span>
              <Badge variant={result.days_left < 30 ? "destructive" : result.days_left < 60 ? "secondary" : "default"}>{result.days_left}</Badge></div>
            <Row t={t} label="tools.sans" value={result.sans} />
            <Row t={t} label="tools.fingerprint" value={<span className="font-mono text-xs">{result.fingerprint}</span>} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Logs ---
function LogsTool({ t, endpoint, meta, router, serverId, servers }: any) {
  const [unit, setUnit] = useState("");
  const [lines, setLines] = useState("100");
  const [since, setSince] = useState("");
  const [filePath, setFilePath] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"journal" | "file">("journal");

  async function fetchLogs() {
    setLoading(true); setError("");
    try {
      let data: any[];
      if (mode === "journal") {
        const qs = new URLSearchParams();
        if (unit) qs.set("unit", unit);
        qs.set("lines", lines);
        if (since) qs.set("since", since);
        data = await api.get<any[]>(endpoint(`/tools/logs?${qs}`));
      } else {
        const qs = new URLSearchParams();
        qs.set("path", filePath);
        qs.set("lines", lines);
        data = await api.get<any[]>(endpoint(`/tools/logs/file?${qs}`));
      }
      setEntries(data || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3 flex-wrap items-end max-w-2xl">
        <Button variant={mode === "journal" ? "default" : "outline"} size="sm" onClick={() => setMode("journal")}>journalctl</Button>
        <Button variant={mode === "file" ? "default" : "outline"} size="sm" onClick={() => setMode("file")}>File</Button>
        {mode === "journal" ? (
          <Input placeholder={t("tools.logUnit")} value={unit} onChange={(e) => setUnit(e.target.value)} className="w-48" />
        ) : (
          <Input placeholder={t("tools.logFile")} value={filePath} onChange={(e) => setFilePath(e.target.value)} className="w-64" />
        )}
        {mode === "journal" && <Input placeholder={t("tools.logSince")} value={since} onChange={(e) => setSince(e.target.value)} className="w-40" />}
        <Input type="number" value={lines} onChange={(e) => setLines(e.target.value)} className="w-20" />
        <Button onClick={fetchLogs} disabled={loading}>{loading ? "..." : t("tools.fetchLogs")}</Button>
      </div>
      {error && <ErrorMsg msg={error} />}
      {entries.length > 0 && (
        <Card>
          <CardContent className="p-2 max-h-[600px] overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {entries.map((e, i) => (
                <div key={i} className={cn("py-0.5", e.priority === "err" && "text-red-500")}>
                  {e.timestamp && <span className="text-muted-foreground mr-2">{e.timestamp}</span>}
                  {e.unit && <span className="text-primary mr-2">{e.unit}</span>}
                  {e.message}
                </div>
              ))}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Packages ---
function PackagesTool({ t, endpoint, meta, router, serverId, servers }: any) {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upgradableOnly, setUpgradableOnly] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const fetchPackages = useCallback(async () => {
    setLoading(true); setError("");
    try { setPackages((await api.get<any[]>(endpoint(`/tools/packages?upgradable=${upgradableOnly}`))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint, upgradableOnly]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  async function doUpgrade() {
    setUpgrading(true);
    try { await api.post(endpoint("/tools/packages")); toast.success(t("tools.upgradeComplete")); await fetchPackages(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setUpgrading(false); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3 items-center">
        <Button variant={upgradableOnly ? "default" : "outline"} size="sm" onClick={() => setUpgradableOnly(true)}>{t("tools.upgradable")}</Button>
        <Button variant={!upgradableOnly ? "default" : "outline"} size="sm" onClick={() => setUpgradableOnly(false)}>{t("tools.allPackages")}</Button>
        {upgradableOnly && <Button size="sm" variant="destructive" onClick={doUpgrade} disabled={upgrading}>{upgrading ? t("tools.upgrading") : t("tools.upgradeAll")}</Button>}
        <Button size="sm" variant="ghost" onClick={fetchPackages}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3">{t("tools.packageName")}</th>
                <th className="text-left p-3">{t("tools.packageVersion")}</th>
                {upgradableOnly && <th className="text-left p-3">New Version</th>}
              </tr></thead>
              <tbody>
                {packages.slice(0, 200).map((p, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{p.name}</td>
                    <td className="p-3 text-xs">{p.version || p.new_version}</td>
                    {upgradableOnly && <td className="p-3 text-xs font-mono">{p.new_version || "--"}</td>}
                  </tr>
                ))}
                {packages.length === 0 && <tr><td colSpan={3} className="text-center p-8 text-muted-foreground">No packages</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Nginx ---
function NginxTool({ t, endpoint, meta, router, serverId, servers }: any) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(false);
  const [config, setConfig] = useState<{ path: string; content: string } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError("");
      try { setStatus(await api.get(endpoint("/tools/nginx"))); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
      finally { setLoading(false); }
    })();
  }, [endpoint]);

  async function reload() {
    setReloading(true);
    try { await api.post(endpoint("/tools/nginx/reload")); toast.success(t("tools.reloaded")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setReloading(false); }
  }

  async function loadConfig(path?: string) {
    try {
      const qs = path ? `?path=${encodeURIComponent(path)}` : "";
      setConfig(await api.get(endpoint(`/tools/nginx/config${qs}`)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : status && !status.installed ? (
        <EmptyState icon={Globe} title={t("tools.nginxNotInstalled")} description="" />
      ) : status && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardContent className="p-4 flex items-center gap-4 flex-wrap">
              <Badge variant={status.installed ? "default" : "secondary"}>{t("tools.nginxInstalled")}: {String(!!status.installed)}</Badge>
              <Badge variant={status.active ? "default" : "secondary"}>{t("tools.nginxActive")}: {String(!!status.active)}</Badge>
              <span className="text-xs text-muted-foreground">{status.version}</span>
              <Button size="sm" onClick={reload} disabled={reloading}>{reloading ? t("tools.reloading") : t("tools.reload")}</Button>
            </CardContent>
          </Card>
          {status.config_files?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{t("tools.configFiles")}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {status.config_files.map((f: string, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{f}</td>
                        <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadConfig(f)}>View</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
          {status.vhosts?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{t("tools.vhosts")}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {status.vhosts.map((v: string, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{v}</td>
                        <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadConfig(v)}>View</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("tools.accessLog")}</span><span className="font-mono text-xs">{status.access_log || "--"}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("tools.errorLog")}</span><span className="font-mono text-xs">{status.error_log || "--"}</span></div>
          {config && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">{t("tools.configContent")}: {config.path}</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setConfig(null)}>Close</Button>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-96 overflow-auto">{config.content}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// --- Deploy ---
function DeployTool({ t, endpoint, meta, router, serverId, servers }: any) {
  const [tab, setTab] = useState<"templates" | "deployments">("templates");
  const [templates, setTemplates] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [deployLoading, setDeployLoading] = useState(true);
  const [deployError, setDeployError] = useState("");
  const [configOpen, setConfigOpen] = useState<any>(null);
  const [appName, setAppName] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<{ name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<{ name: string; action: string } | null>(null);
  const [memoryLimit, setMemoryLimit] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [progressLogs, setProgressLogs] = useState("");
  const [portStatus, setPortStatus] = useState<Record<string, boolean>>({});
  const [yamlContent, setYamlContent] = useState("");
  const [deployTarget, setDeployTarget] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const portTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTemplates = useCallback(async () => {
    try { setTemplates((await api.get<any[]>(endpoint("/tools/deploy/templates"))) || []); }
    catch { /* templates are hardcoded, should not fail */ }
  }, [endpoint]);

  const fetchDeployments = useCallback(async () => {
    setDeployLoading(true); setDeployError("");
    try { setDeployments((await api.get<any[]>(endpoint("/tools/deploy/list"))) || []); }
    catch (e) { setDeployError(e instanceof Error ? e.message : "Failed"); }
    finally { setDeployLoading(false); }
  }, [endpoint]);

  useEffect(() => { fetchTemplates(); fetchDeployments(); }, [fetchTemplates, fetchDeployments]);

  function openConfig(tmpl: any) {
    setConfigOpen(tmpl);
    setAppName(tmpl.id === "custom" ? "" : tmpl.id);
    const defaults: Record<string, string> = {};
    if (tmpl.default_env) for (const [k, v] of Object.entries(tmpl.default_env)) defaults[k] = v as string;
    setEnvValues(defaults);
    setMemoryLimit(tmpl.memory_limit || "");
    setCpuLimit(tmpl.cpu_limit || "");
    setYamlContent("");
    setProgressLogs("");
    setPortStatus({});
    setDeployTarget("");
  }

  async function doDeploy() {
    if (!configOpen || !appName) return;
    setSubmitting(true);
    setProgressLogs("");
    try {
      await api.post(endpoint("/tools/deploy/deploy"), {
        template_id: configOpen.id,
        app_name: appName,
        env: envValues,
        memory_limit: memoryLimit || undefined,
        cpu_limit: cpuLimit || undefined,
        yaml: configOpen.id === "custom" ? yamlContent : undefined,
      });
      toast.success(t("tools.deploySuccess", { name: appName }));
      setDeployTarget(appName);
      startPolling(appName);
    } catch (e) { toast.error(t("tools.deployFailed") + ": " + (e instanceof Error ? e.message : "")); }
    finally { setSubmitting(false); }
  }

  async function doRemove() {
    if (!removeTarget) return;
    const name = removeTarget.name;
    setRemoveTarget(null);
    setActionLoading({ name, action: "remove" });
    try {
      await api.post(endpoint("/tools/deploy/remove"), { appName: name });
      toast.success(t("tools.removed", { name }));
      setExpandedLogs(null);
      await fetchDeployments();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActionLoading(null); }
  }

  async function doAction(name: string, action: string) {
    setActionLoading({ name, action });
    try {
      await api.post(endpoint(`/tools/deploy/${action}`), { appName: name });
      toast.success(`${action} ${name}: ok`);
      await fetchDeployments();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActionLoading(null); }
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling(appName: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get<{ logs: string }>(endpoint(`/tools/deploy/progress?appName=${encodeURIComponent(appName)}`));
        if (data?.logs != null) setProgressLogs(data.logs);
      } catch { /* silent */ }
    }, 1500);
  }

  function checkPortsDebounced() {
    if (portTimerRef.current) clearTimeout(portTimerRef.current);
    portTimerRef.current = setTimeout(async () => {
      const ports = Object.values(envValues).filter((v) => /^\d+$/.test(v));
      if (ports.length === 0) return;
      try {
        const result = await api.post<Record<string, boolean>>(endpoint("/tools/deploy/check-ports"), { ports });
        setPortStatus(result || {});
      } catch { /* silent */ }
    }, 500);
  }

  // Stop polling on unmount
  useEffect(() => { return () => stopPolling(); }, []);

  async function toggleLogs(appName: string) {
    if (expandedLogs === appName) { setExpandedLogs(null); return; }
    setExpandedLogs(appName);
    try {
      const data = await api.get<{ logs: string }>(endpoint(`/tools/deploy/logs?appName=${encodeURIComponent(appName)}`));
      setLogContent((prev) => ({ ...prev, [appName]: data?.logs || "" }));
    } catch { setLogContent((prev) => ({ ...prev, [appName]: "Failed to load logs" })); }
  }

  const iconMap: Record<string, typeof Rocket> = {
    "globe": Globe, "file-text": FileText, "git-branch": Package, "server": ServerIcon,
    "activity": Play, "bar-chart": Eye, "grid": Package, "refresh-cw": RefreshCw,
  };

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3">
        <Button variant={tab === "templates" ? "default" : "outline"} size="sm" onClick={() => setTab("templates")}>
          {t("tools.templates")}
        </Button>
        <Button variant={tab === "deployments" ? "default" : "outline"} size="sm" onClick={() => setTab("deployments")}>
          {t("tools.deployments")}
        </Button>
      </div>

      {/* Templates / App Store */}
      {tab === "templates" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Custom compose card */}
          <Card className="hover:border-primary/50 transition-colors border-dashed">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm">{t("tools.customCompose")}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("tools.customComposeDesc")}</p>
              <Button size="sm" className="w-full" variant="outline" onClick={() => openConfig({ id: "custom", name: t("tools.customCompose"), default_env: {} })}>
                {t("tools.deploy")}
              </Button>
            </CardContent>
          </Card>
          {templates.map((tmpl) => {
            const Icon = iconMap[tmpl.icon] || Package;
            return (
              <Card key={tmpl.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-sm">{tmpl.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                  <Button size="sm" className="w-full" onClick={() => openConfig(tmpl)}>
                    {t("tools.deploy")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Deployments */}
      {tab === "deployments" && (
        <>
          {deployLoading ? <PageSkeleton /> : deployError ? <ErrorMsg msg={deployError} /> : deployments.length === 0 ? (
            <EmptyState icon={Rocket} title={t("tools.deploymentsEmpty")} description="" />
          ) : (
            <div className="space-y-4">
              {deployments.map((d) => (
                <Card key={d.app_name}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-sm">{d.app_name}</span>
                        <Badge variant="secondary" className="text-xs">{d.template || "unknown"}</Badge>
                        <Badge variant={d.status === "running" ? "default" : d.status === "stopped" ? "secondary" : "destructive"} className="text-xs">
                          {d.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleLogs(d.app_name)}>
                          {expandedLogs === d.app_name ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                          {expandedLogs === d.app_name ? t("tools.hideLogs") : t("tools.viewLogs")}
                        </Button>
                        {d.status === "running" ? (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "stop")} disabled={actionLoading?.name === d.app_name}>
                            <Square className="w-3 h-3 mr-1" />{t("tools.stopService")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "start")} disabled={actionLoading?.name === d.app_name}>
                            <Play className="w-3 h-3 mr-1" />{t("tools.startService")}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "restart")} disabled={actionLoading?.name === d.app_name}>
                          <RotateCcw className="w-3 h-3 mr-1" />{t("tools.restartService")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "update")} disabled={actionLoading?.name === d.app_name}>
                          <RefreshCw className={cn("w-3 h-3 mr-1", actionLoading?.name === d.app_name && actionLoading?.action === "update" && "animate-spin")} />{t("tools.updateApp")}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setRemoveTarget({ name: d.app_name })} disabled={actionLoading?.name === d.app_name}>
                          <Trash2 className="w-3 h-3 mr-1" />
                          {t("tools.removeApp")}
                        </Button>
                      </div>
                    </div>
                    {d.containers?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {d.containers.map((c: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {c.name}: {c.state}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {d.created_at && <p className="text-xs text-muted-foreground">{t("tools.deployedAt")}: {new Date(d.created_at).toLocaleString()}</p>}
                    {expandedLogs === d.app_name && (
                      <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-80 overflow-auto">
                        {logContent[d.app_name] || "Loading..."}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Configure Deploy Dialog */}
      <Dialog open={!!configOpen} onOpenChange={(open) => { if (!open && !deployTarget) { setConfigOpen(null); stopPolling(); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t("tools.configureDeploy")}: {configOpen?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("tools.appName")}</label>
              <Input value={appName} onChange={(e) => setAppName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder={t("tools.appNamePlaceholder")} disabled={!!deployTarget} />
            </div>
            {configOpen?.id === "custom" && (
              <div>
                <label className="text-sm font-medium mb-1 block">{t("tools.customComposePlaceholder")}</label>
                <textarea
                  className="flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  placeholder={t("tools.customComposePlaceholder")}
                  disabled={!!deployTarget}
                />
              </div>
            )}
            {configOpen?.default_env && Object.keys(configOpen.default_env).length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">{t("tools.envConfig")}</label>
                <div className="space-y-2">
                  {Object.entries(configOpen.default_env).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex gap-2 items-center">
                      <span className="text-xs font-mono w-32 shrink-0">{key}</span>
                      <div className="flex-1 relative">
                        <Input
                          value={envValues[key] || ""}
                          onChange={(e) => { setEnvValues((prev) => ({ ...prev, [key]: e.target.value })); checkPortsDebounced(); }}
                          className={cn("h-8 text-xs", portStatus[envValues[key]] && "border-destructive")}
                          disabled={!!deployTarget}
                        />
                        {portStatus[envValues[key]] && (
                          <Badge variant="destructive" className="text-xs ml-2">{t("tools.portConflict", { port: envValues[key] })}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("tools.memoryLimit")}</label>
                <Input value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} placeholder="512m" className="h-8 text-xs" disabled={!!deployTarget} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("tools.cpuLimit")}</label>
                <Input value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} placeholder="1.0" className="h-8 text-xs" disabled={!!deployTarget} />
              </div>
            </div>
            {progressLogs && (
              <div>
                <label className="text-sm font-medium mb-1 block">{t("tools.deployLogs")}</label>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-60 overflow-auto">{progressLogs}</pre>
              </div>
            )}
          </div>
          <DialogFooter>
            {deployTarget ? (
              <Button variant="outline" onClick={() => { stopPolling(); setConfigOpen(null); fetchDeployments(); }}>
                {t("tools.hideProgress")}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfigOpen(null)}>{t("tools.cancel")}</Button>
                <Button onClick={doDeploy} disabled={submitting || !appName}>
                  {submitting ? t("tools.deploying") : t("tools.deploy")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={`${t("tools.removeAppTitle")}: ${removeTarget?.name}`}
        description={t("tools.removeAppDesc", { name: removeTarget?.name || "" })}
        confirmLabel={t("tools.removeApp")}
        onConfirm={doRemove}
        variant="destructive"
      />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{msg}</CardContent></Card>;
}

function Row({ t, label, value }: { t: any; label: string; value: any }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{t(label)}</span><span>{value || "--"}</span></div>;
}
