"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
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
import { MetricsCards } from "@/components/servers/metrics-cards";
import { ProcessList } from "@/components/servers/process-list";
import { FileManager } from "@/components/servers/file-manager";
import { ContainerList } from "@/components/servers/container-list";
import { TerminalComponent } from "@/components/terminal/terminal";
import { TerminalConnectionBar } from "@/components/terminal/terminal-connection-bar";
import { terminalWsClient } from "@/lib/terminal-ws";
import { getToken } from "@/lib/auth";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { useServerDetail } from "@/hooks/use-server-detail";
import { ArrowLeft, Server, Wifi, WifiOff, Terminal, Pencil, Trash2, Play, Pause, Rewind, FastForward } from "lucide-react";

export default function ServerDetailPage() {
  const params = useParams();
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const sid = params.id as string;

  const {
    server,
    serverLoading,
    serverError,
    isOnline,
    merged,
    chartData,
    playbackIndex,
    isPlaying,
    playbackSpeed,
    playbackSnapshot,
    metricRange,
    setMetricRange,
    startPlayback,
    stopPlayback,
    resetPlayback,
    setPlaybackIndex,
    setPlaybackSpeed,
    editOpen,
    setEditOpen,
    editForm,
    setEditForm,
    submitting,
    handleEdit,
    deleteTarget,
    setDeleteTarget,
    deleting,
    handleDelete,
    openEditDialog,
  } = useServerDetail(wid, sid);

  const { state: wsState } = useWebSocket();
  const [terminalState, setTerminalState] = useState<string>("disconnected");

  if (serverLoading) return <LoadingSkeleton />;
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

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Metrics Cards */}
      <MetricsCards merged={merged} />

      {/* Time range & playback controls */}
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-4 py-3 flex-wrap">
          <div className="flex gap-1">
            {["1h", "6h", "24h", "7d"].map((r) => (
              <Button key={r} size="sm" variant={metricRange === r ? "default" : "outline"} className="h-7 text-xs px-2.5" onClick={() => { setMetricRange(r); resetPlayback(); }}>
                {r}
              </Button>
            ))}
          </div>
          <div className="w-px h-6 bg-border" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPlaybackIndex(Math.max(0, playbackIndex - 1)); }} disabled={playbackIndex <= 0}>
            <Rewind className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => isPlaying ? stopPlayback() : startPlayback()} disabled={chartData.length === 0}>
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPlaybackIndex(Math.min(chartData.length - 1, playbackIndex + 1)); }} disabled={playbackIndex >= chartData.length - 1}>
            <FastForward className="w-3.5 h-3.5" />
          </Button>
          <select className="h-7 text-xs rounded border bg-transparent px-1.5" value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
            <option value={10}>10x</option>
          </select>
          <input
            type="range"
            min={0}
            max={Math.max(0, chartData.length - 1)}
            value={playbackIndex >= 0 ? playbackIndex : chartData.length - 1}
            onChange={(e) => { stopPlayback(); setPlaybackIndex(Number(e.target.value)); }}
            className="flex-1 min-w-[120px] h-1 accent-primary"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
            {playbackSnapshot ? new Date(playbackSnapshot.time!).toLocaleString() : chartData.length > 0 ? `${chartData.length} points` : "--"}
          </span>
        </CardContent>
      </Card>

      {/* Tabs */}
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
          <ProcessList workspaceId={wid!} serverId={sid} />
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

      {/* Edit Dialog */}
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
