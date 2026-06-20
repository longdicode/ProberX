"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Search, Package, Store, Globe, FileText, GitBranch, Server as ServerIcon,
  Activity, BarChart3, LayoutGrid, RefreshCw, Lock, MessageCircle,
  Cpu, Home, PenTool, Play, Square, RotateCcw, Trash2, Eye, EyeOff, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAppStore, type AppStoreEntry } from "@/hooks/use-api";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "CMS", label: "CMS" },
  { key: "DevOps", label: "DevOps" },
  { key: "Monitoring", label: "监控" },
  { key: "Tools", label: "工具" },
  { key: "AI", label: "AI" },
];

const iconMap: Record<string, typeof Package> = {
  "globe": Globe, "file-text": FileText, "git-branch": GitBranch,
  "server": ServerIcon, "activity": Activity, "bar-chart": BarChart3,
  "grid": LayoutGrid, "refresh-cw": RefreshCw, "lock": Lock,
  "message-circle": MessageCircle, "cpu": Cpu, "home": Home,
  "pen-tool": PenTool, "package": Package,
};

interface AppStorePanelProps {
  serverId: string;
  workspaceId: string;
}

export function AppStorePanel({ serverId, workspaceId }: AppStorePanelProps) {
  const { t } = useLocale();
  const [tab, setTab] = useState<"catalog" | "installed">("catalog");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  // Catalog
  const { data: storeEntries, isLoading } = useAppStore(workspaceId, { category, search });

  // Deploy dialog
  const [configureEntry, setConfigureEntry] = useState<AppStoreEntry | null>(null);
  const [appName, setAppName] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [memoryLimit, setMemoryLimit] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressLogs, setProgressLogs] = useState("");
  const [portStatus, setPortStatus] = useState<Record<string, boolean>>({});
  const [deployDone, setDeployDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const portTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deployments
  const [deployments, setDeployments] = useState<any[]>([]);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<{ name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<{ name: string; action: string } | null>(null);

  const ep = (path: string) => `/workspaces/${workspaceId}/servers/${serverId}${path}`;

  // Fetch deployments
  const fetchDeployments = useCallback(async () => {
    if (!serverId) return;
    setDeployLoading(true); setDeployError("");
    try {
      setDeployments((await api.get<any[]>(ep("/tools/deploy/list"))) || []);
    } catch (e) { setDeployError(e instanceof Error ? e.message : "Failed"); }
    finally { setDeployLoading(false); }
  }, [serverId, workspaceId]);

  useEffect(() => { if (tab === "installed") fetchDeployments(); }, [tab, fetchDeployments]);

  // Deploy dialog handlers
  const openDeploy = (entry: AppStoreEntry) => {
    const safe = entry.name.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
    setConfigureEntry(entry);
    setAppName(safe);
    setEnvValues(entry.defaultEnv || {});
    setMemoryLimit(entry.memoryLimit || "");
    setCpuLimit(entry.cpuLimit || "");
    setProgressLogs("");
    setPortStatus({});
    setDeployDone(false);
  };

  const checkPorts = useCallback(() => {
    if (portTimerRef.current) clearTimeout(portTimerRef.current);
    portTimerRef.current = setTimeout(async () => {
      const ports = Object.values(envValues).filter((v) => /^\d+$/.test(v));
      if (ports.length === 0) return;
      try {
        const result = await api.post<Record<string, boolean>>(ep("/tools/deploy/check-ports"), { ports });
        setPortStatus(result || {});
      } catch { /* silent */ }
    }, 500);
  }, [envValues, serverId]);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startPolling = (name: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get<{ logs: string }>(ep(`/tools/deploy/progress?appName=${encodeURIComponent(name)}`));
        if (data?.logs != null) setProgressLogs(data.logs);
      } catch { /* silent */ }
    }, 1500);
  };

  useEffect(() => { return () => stopPolling(); }, []);

  const doDeploy = async () => {
    if (!configureEntry || !appName || !serverId) return;
    setSubmitting(true); setProgressLogs("");
    try {
      await api.post(ep("/tools/deploy/deploy"), {
        template_id: "custom",
        app_name: appName,
        env: envValues,
        memory_limit: memoryLimit || undefined,
        cpu_limit: cpuLimit || undefined,
        yaml: configureEntry.composeYaml,
      });
      toast.success(`Deployed: ${appName}`);
      setDeployDone(true);
      startPolling(appName);
      fetchDeployments();
    } catch (e) { toast.error("Deploy failed: " + (e instanceof Error ? e.message : "")); }
    finally { setSubmitting(false); }
  };

  const doAction = async (name: string, action: string) => {
    setActionLoading({ name, action });
    try {
      await api.post(ep(`/tools/deploy/${action}`), { appName: name });
      toast.success(`${action} ${name}: ok`);
      await fetchDeployments();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActionLoading(null); }
  };

  const doRemove = async () => {
    if (!removeTarget) return;
    const name = removeTarget.name;
    setRemoveTarget(null);
    setActionLoading({ name, action: "remove" });
    try {
      await api.post(ep("/tools/deploy/remove"), { appName: name });
      toast.success(`Removed: ${name}`);
      setExpandedLogs(null);
      await fetchDeployments();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setActionLoading(null); }
  };

  const toggleLogs = async (appName: string) => {
    if (expandedLogs === appName) { setExpandedLogs(null); return; }
    setExpandedLogs(appName);
    try {
      const data = await api.get<{ logs: string }>(ep(`/tools/deploy/logs?appName=${encodeURIComponent(appName)}`));
      setLogContent((prev) => ({ ...prev, [appName]: data?.logs || "" }));
    } catch { setLogContent((prev) => ({ ...prev, [appName]: "Failed to load logs" })); }
  };

  if (isLoading) return <PageSkeleton />;

  const filtered = storeEntries || [];

  return (
    <div className="space-y-4">
      {/* Tabs + Search */}
      <div className="flex items-center gap-4 flex-wrap justify-between">
        <div className="flex gap-2">
          <Button variant={tab === "catalog" ? "default" : "outline"} size="sm" onClick={() => setTab("catalog")}>
            <Store className="w-3.5 h-3.5 mr-1" />应用目录
          </Button>
          <Button variant={tab === "installed" ? "default" : "outline"} size="sm" onClick={() => setTab("installed")}>
            <Rocket className="w-3.5 h-3.5 mr-1" />已安装
          </Button>
        </div>
        {tab === "catalog" && (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="搜索应用..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        )}
      </div>

      {/* Category tabs */}
      {tab === "catalog" && (
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <Button key={cat.key} variant={category === cat.key ? "default" : "outline"} size="sm" className="h-8 text-xs"
              onClick={() => setCategory(cat.key)}>{cat.label}</Button>
          ))}
        </div>
      )}

      {/* Catalog */}
      {tab === "catalog" && (
        filtered.length === 0 ? (
          <EmptyState icon={Store} title="没有匹配的应用" description="" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((entry) => {
              const Icon = iconMap[entry.icon] || Package;
              return (
                <Card key={entry.id} className="hover:border-primary/50 hover:shadow-sm transition-all group">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{entry.name}</span>
                          <Badge variant="secondary" className="text-xs">{entry.category}</Badge>
                        </div>
                        {entry.author && <p className="text-xs text-muted-foreground mt-0.5">by {entry.author}</p>}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{entry.description}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {entry.memoryLimit && <span>{entry.memoryLimit} mem</span>}
                      {entry.cpuLimit && <span>{entry.cpuLimit} CPU</span>}
                    </div>
                    <Button size="sm" className="w-full" onClick={() => openDeploy(entry)}>
                      <Rocket className="w-3.5 h-3.5 mr-1" />部署
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Installed */}
      {tab === "installed" && (
        deployLoading ? <PageSkeleton /> : deployError ? (
          <p className="text-sm text-destructive">{deployError}</p>
        ) : deployments.length === 0 ? (
          <EmptyState icon={Rocket} title="暂无已安装应用" description="浏览目录来部署您的第一个应用" />
        ) : (
          <div className="space-y-4">
            {deployments.map((d) => (
              <Card key={d.app_name}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{d.app_name}</span>
                      <Badge variant="secondary" className="text-xs">{d.template || "custom"}</Badge>
                      <Badge variant={d.status === "running" ? "default" : d.status === "stopped" ? "secondary" : "destructive"} className="text-xs">{d.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleLogs(d.app_name)}>
                        {expandedLogs === d.app_name ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                        {expandedLogs === d.app_name ? "隐藏" : "日志"}
                      </Button>
                      {d.status === "running" ? (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "stop")} disabled={actionLoading?.name === d.app_name}>
                          <Square className="w-3 h-3 mr-1" />停止
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "start")} disabled={actionLoading?.name === d.app_name}>
                          <Play className="w-3 h-3 mr-1" />启动
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "restart")} disabled={actionLoading?.name === d.app_name}>
                        <RotateCcw className="w-3 h-3 mr-1" />重启
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doAction(d.app_name, "update")} disabled={actionLoading?.name === d.app_name}>
                        <RefreshCw className={cn("w-3 h-3 mr-1", actionLoading?.name === d.app_name && actionLoading?.action === "update" && "animate-spin")} />更新
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setRemoveTarget({ name: d.app_name })} disabled={actionLoading?.name === d.app_name}>
                        <Trash2 className="w-3 h-3 mr-1" />卸载
                      </Button>
                    </div>
                  </div>
                  {d.containers?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {d.containers.map((c: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">{c.name}: {c.state}</Badge>
                      ))}
                    </div>
                  )}
                  {d.created_at && <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</p>}
                  {expandedLogs === d.app_name && (
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-80 overflow-auto">{logContent[d.app_name] || "Loading..."}</pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Deploy Dialog */}
      <Dialog open={!!configureEntry} onOpenChange={(open) => { if (!open && !deployDone) { setConfigureEntry(null); stopPolling(); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>配置部署: {configureEntry?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>应用名称</Label>
              <Input value={appName} onChange={(e) => setAppName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30))}
                placeholder="my-app" disabled={deployDone} />
            </div>
            {configureEntry?.defaultEnv && Object.keys(configureEntry.defaultEnv).length > 0 && (
              <div>
                <Label className="mb-2 block">环境变量</Label>
                <div className="space-y-2">
                  {Object.entries(configureEntry.defaultEnv).map(([key, val]) => (
                    <div key={key} className="flex gap-2 items-center">
                      <span className="text-xs font-mono w-28 shrink-0 truncate">{key}</span>
                      <div className="flex-1 flex items-center gap-1">
                        <Input value={envValues[key] || ""} onChange={(e) => { setEnvValues((prev) => ({ ...prev, [key]: e.target.value })); checkPorts(); }}
                          className={cn("h-8 text-xs", portStatus[envValues[key]] && "border-destructive")} disabled={deployDone} />
                        {portStatus[envValues[key]] && <Badge variant="destructive" className="text-xs shrink-0">占用</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>内存限制</Label>
                <Input value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} placeholder="512m" className="h-8 text-xs" disabled={deployDone} /></div>
              <div><Label>CPU 限制</Label>
                <Input value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} placeholder="1.0" className="h-8 text-xs" disabled={deployDone} /></div>
            </div>
            {progressLogs && (
              <div>
                <Label className="mb-1 block">部署进度</Label>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-60 overflow-auto">{progressLogs}</pre>
              </div>
            )}
          </div>
          <DialogFooter>
            {deployDone ? (
              <Button variant="outline" onClick={() => { stopPolling(); setConfigureEntry(null); }}>完成</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConfigureEntry(null)}>取消</Button>
                <Button onClick={doDeploy} disabled={submitting || !appName}>
                  {submitting ? "部署中..." : "部署"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm */}
      <ConfirmDialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={`卸载: ${removeTarget?.name}`} description={`确定要卸载 ${removeTarget?.name || ""} 吗？这将永久删除所有数据。`}
        confirmLabel="卸载" onConfirm={doRemove} variant="destructive" />
    </div>
  );
}
