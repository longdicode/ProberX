"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Globe, FileText, Package, Server as ServerIcon, Play, Eye, RefreshCw, EyeOff, Square, RotateCcw, Trash2, Rocket } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function DeployTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
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
