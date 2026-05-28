"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricChart } from "@/components/servers/metric-chart";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers, useServerMetrics, type MetricSnapshot } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { useWebSocket } from "@/hooks/use-websocket";
import { formatBytes, formatPercent } from "@/lib/utils";
import { Cpu, MemoryStick, HardDrive, Network, ArrowLeft, Server, Wifi, WifiOff, Terminal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalComponent } from "@/components/terminal/terminal";
import { TerminalConnectionBar } from "@/components/terminal/terminal-connection-bar";
import { terminalWsClient } from "@/lib/terminal-ws";
import { FileManager } from "@/components/servers/file-manager";
import { ContainerList } from "@/components/servers/container-list";
import { getToken } from "@/lib/auth";

export default function ServerDetailPage() {
  const params = useParams();
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const sid = params.id as string;

  const { data: servers, isLoading: serverLoading, error: serverError } = useServers(wid);
  const server = servers?.find((s) => s.id === sid);
  const { data: metrics, isLoading: metricsLoading } = useServerMetrics(wid, sid);
  const { state: wsState, subscribe } = useWebSocket();
  const [liveMetric, setLiveMetric] = useState<MetricSnapshot | null>(null);
  const [liveOnline, setLiveOnline] = useState<boolean | null>(null);
  const [processes, setProcesses] = useState<{ pid: number; name: string; cpu_percent: number; mem_mb: number }[] | null>(null);
  const [procLoading, setProcLoading] = useState(false);
  const [terminalState, setTerminalState] = useState<string>("disconnected");
  const queryClient = useQueryClient();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", agentHost: "", agentPort: "9800" });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openEditDialog() {
    if (!server) return;
    const hostInfo = server.hostInfo as Record<string, unknown> | null;
    setEditForm({
      name: server.name,
      agentHost: (hostInfo?.agent_host as string) || "",
      agentPort: String(hostInfo?.agent_port ?? "9800"),
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!wid || !server) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: editForm.name };
      if (editForm.agentHost.trim()) body.agentHost = editForm.agentHost.trim();
      const port = parseInt(editForm.agentPort, 10);
      if (!isNaN(port)) body.agentPort = port;
      await api.patch(`/workspaces/${wid}/servers/${sid}`, body);
      queryClient.invalidateQueries({ queryKey: ["servers", wid] });
      toast.success(t("servers.serverUpdated"));
      setEditOpen(false);
    } catch (err) {
      console.error("edit server:", err);
      toast.error(err instanceof Error ? err.message : t("servers.updateFailed"));
    } finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!wid || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${wid}/servers/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["servers", wid] });
      toast.success(t("servers.serverDeleted"));
      router.push("/servers");
    } catch (err) {
      console.error("delete server:", err);
      toast.error(err instanceof Error ? err.message : t("servers.deleteFailed"));
    } finally { setDeleting(false); setDeleteTarget(null); }
  }

  useEffect(() => {
    const unsubMetrics = subscribe("metrics:update", (payload: unknown) => {
      const m = payload as { serverId: string } & MetricSnapshot;
      if (m?.serverId === sid) setLiveMetric(m as MetricSnapshot);
    });
    const unsubStatus = subscribe("server:status", (payload: unknown) => {
      const s = payload as { serverId: string; isOnline: boolean };
      if (s?.serverId === sid) setLiveOnline(s.isOnline);
    });
    return () => { unsubMetrics(); unsubStatus(); };
  }, [sid, subscribe]);

  if (serverLoading || metricsLoading) return <LoadingSkeleton />;
  if (serverError || !server) {
    return (
      <EmptyState
        icon={Server}
        title="Server not found"
        description="This server does not exist or you do not have access."
        action={{ label: "Back to Servers", href: "/servers" }}
      />
    );
  }

  const latestMetrics = metrics?.[0];
  const isOnline = liveOnline ?? server.isOnline;
  const merged = liveMetric ?? latestMetrics;
  const chartData = (metrics ?? []).slice().reverse().map((m) => ({
    time: new Date(m.time).toLocaleTimeString(),
    cpu: m.cpuPercent ? Number(m.cpuPercent) : 0,
    mem: m.memUsed && m.memTotal ? ((m.memUsed / m.memTotal) * 100).toFixed(1) : 0,
    net_in: m.netInBytes ? m.netInBytes / 1024 / 1024 : 0,
    net_out: m.netOutBytes ? m.netOutBytes / 1024 / 1024 : 0,
    gpu: m.gpuUtilPercent ? Number(m.gpuUtilPercent) : 0,
    gpu_temp: m.gpuTemp ? Number(m.gpuTemp) : 0,
  }));

  const cur = merged;
  const memUsage = cur?.memUsed && cur?.memTotal
    ? `${formatBytes(cur.memUsed)} / ${formatBytes(cur.memTotal)}`
    : "--";
  const diskUsage = cur?.diskUsed && cur?.diskTotal
    ? `${formatBytes(cur.diskUsed)} / ${formatBytes(cur.diskTotal)}`
    : "--";
  const netTraffic = cur
    ? `${formatBytes(cur.netInBytes ?? 0)} ↓ / ${formatBytes(cur.netOutBytes ?? 0)} ↑`
    : "--";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/servers"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{server.name}</h1>
            <ServerStatusBadge status={isOnline ? "online" : "offline"} />
            <button onClick={openEditDialog} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title={t("servers.editServer")}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setDeleteTarget({ id: sid, name: server.name })} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title={t("servers.deleteServer")}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1.5 ml-2 text-xs text-muted-foreground">
              {wsState === "connected" ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3" />}
              <span className="sr-only">{wsState}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {server.lastSeenAt
              ? t("servers.lastSeen", { time: new Date(server.lastSeenAt).toLocaleString() })
              : t("servers.lastSeenNever")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: t("servers.cpu"), value: cur?.cpuPercent ? `${cur.cpuPercent}%` : "--", icon: Cpu, sub: cur ? `${cur.cpuPercent ?? 0}%` : "--" },
          { label: t("servers.memory"), value: cur?.memUsed ? formatBytes(cur.memUsed) : "--", icon: MemoryStick, sub: memUsage },
          { label: t("servers.disk"), value: cur?.diskUsed ? formatBytes(cur.diskUsed) : "--", icon: HardDrive, sub: diskUsage },
          { label: t("servers.network"), value: cur?.netInBytes ? formatBytes(cur.netInBytes) : "--", icon: Network, sub: netTraffic },
          { label: t("servers.gpu"), value: cur?.gpuUtilPercent ? `${cur.gpuUtilPercent}%` : "--", icon: Cpu, sub: cur?.gpuTemp ? `${cur.gpuTemp}°C` : "--" },
        ].map(({ label, value, icon: Icon, sub }) => (
          <Card key={label} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
              <Icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">{t("servers.metrics")}</TabsTrigger>
          <TabsTrigger value="processes">{t("servers.processes")}</TabsTrigger>
          <TabsTrigger value="terminal">{t("servers.terminal")}</TabsTrigger>
          <TabsTrigger value="files">{t("servers.files")}</TabsTrigger>
          <TabsTrigger value="containers">{t("servers.containers")}</TabsTrigger>
        </TabsList>
        <TabsContent value="metrics" className="space-y-4 mt-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">{t("servers.cpuUsage")}</CardTitle></CardHeader>
            <CardContent className="h-64">
              <MetricChart data={chartData} dataKey="cpu" color="var(--chart-1)" />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">{t("servers.gpuUsage")}</CardTitle></CardHeader>
            <CardContent className="h-64">
              <MetricChart data={chartData} dataKey="gpu" color="var(--chart-4)" />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm">{t("servers.memoryUsage")}</CardTitle></CardHeader>
              <CardContent className="h-48">
                <MetricChart data={chartData} dataKey="mem" color="var(--chart-2)" />
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm">{t("servers.networkTraffic")}</CardTitle></CardHeader>
              <CardContent className="h-48">
                <MetricChart data={chartData} dataKey="net_in" color="var(--chart-3)" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="processes" className="mt-4">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{t("servers.processes")}</CardTitle>
              <Button variant="outline" size="sm" disabled={procLoading} onClick={async () => {
                setProcLoading(true);
                try {
                  const res = await api.get<{ pid: number; name: string; cpu_percent: number; mem_mb: number }[]>(`/workspaces/${wid}/servers/${sid}/processes`);
                  setProcesses(res);
                } catch { setProcesses([]); }
                finally { setProcLoading(false); }
              }}>{procLoading ? "Loading..." : t("servers.refresh")}</Button>
            </CardHeader>
            <CardContent>
              {!processes ? (
                <div className="py-8 text-center text-muted-foreground text-sm">{t("servers.clickToLoadProcesses")}</div>
              ) : processes.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">{t("servers.noProcesses")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50"><th className="text-left py-2 font-medium text-muted-foreground">PID</th><th className="text-left py-2 font-medium text-muted-foreground">{t("servers.processName")}</th><th className="text-right py-2 font-medium text-muted-foreground">CPU %</th><th className="text-right py-2 font-medium text-muted-foreground">{t("servers.memory")}</th></tr></thead>
                    <tbody>
                      {processes.map((p) => (
                        <tr key={p.pid} className="border-b border-border/30 last:border-0">
                          <td className="py-2 font-mono text-xs">{p.pid}</td>
                          <td className="py-2 truncate max-w-[200px]">{p.name}</td>
                          <td className="py-2 text-right font-mono text-xs">{p.cpu_percent.toFixed(1)}</td>
                          <td className="py-2 text-right font-mono text-xs">{p.mem_mb.toFixed(1)} MB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="terminal" className="mt-4">
          <TerminalConnectionBar
            state={terminalState}
            onReconnect={() => {
              const token = getToken();
              if (!current || !token) return;
              terminalWsClient.connect(sid, current.id, token);
            }}
          />
          <TerminalComponent
            serverId={sid}
            onStateChange={(s) => setTerminalState(s)}
          />
        </TabsContent>
        <TabsContent value="files" className="mt-4">
          <FileManager serverId={sid} />
        </TabsContent>
        <TabsContent value="containers" className="mt-4">
          <ContainerList serverId={sid} />
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("servers.editServer")}</DialogTitle>
            <DialogDescription>{t("servers.editServerDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("monitors.name")}</Label>
              <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="edit-host">{t("servers.agentHost")}</Label>
                <Input id="edit-host" value={editForm.agentHost} onChange={(e) => setEditForm({ ...editForm, agentHost: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-port">{t("servers.agentPort")}</Label>
                <Input id="edit-port" type="number" value={editForm.agentPort} onChange={(e) => setEditForm({ ...editForm, agentPort: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleEdit} disabled={submitting || !editForm.name.trim()}>
              {submitting ? "Saving..." : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`${t("servers.deleteServer")}: ${deleteTarget?.name}`}
        description={t("servers.deleteServerDesc")}
        confirmLabel={t("servers.deleteServer")}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
