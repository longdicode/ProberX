"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Server, Plus, Search, Copy, Pencil, Trash2, CheckSquare, XSquare, Terminal, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useServers } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function timeAgo(dateStr: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { n: mins });
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  return t("time.daysAgo", { n: days });
}

export default function ServersPage() {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const { current, setCurrent } = useWorkspaceStore();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const { data: servers, isLoading, error } = useServers(current?.id);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", agentHost: "", agentPort: "9800", installMode: "offline", sshHost: "", sshPort: "22", sshUsername: "root", sshPassword: "" });
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [installDone, setInstallDone] = useState(false);
  const [installOk, setInstallOk] = useState(false);
  const [installLog, setInstallLog] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<{ id: string; name: string; hostInfo: Record<string, unknown> } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; hostInfo: Record<string, unknown> } | null>(null);
  const [deleteUninstall, setDeleteUninstall] = useState(false);
  const [deleteSsh, setDeleteSsh] = useState({ host: "", port: "22", username: "root", password: "" });
  const [deleteLog, setDeleteLog] = useState<string | null>(null);
  const [deleteFinished, setDeleteFinished] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Batch operations
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCmd, setBatchCmd] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState<{ serverId: string; serverName: string; output: string; error?: string }[]>([]);

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function selectAll() { setSelected(new Set(filtered.map((s) => s.id))); }
  function clearSelection() { setSelected(new Set()); }

  async function runBatchCommand() {
    if (!current?.id || !batchCmd.trim()) return;
    setBatchRunning(true);
    setBatchResults([]);
    const targets = filtered.filter((s) => selected.has(s.id));
    const results = await Promise.all(targets.map(async (s) => {
      try {
        const res = await api.post<{ output: string }>(`/workspaces/${current.id}/servers/${s.id}/exec`, { command: batchCmd.trim(), timeout: 30 });
        return { serverId: s.id, serverName: s.name, output: res.output };
      } catch (err) {
        return { serverId: s.id, serverName: s.name, output: "", error: err instanceof Error ? err.message : "Failed" };
      }
    }));
    setBatchResults(results);
    toast.success(`Executed on ${results.length} server(s)`);
    setBatchRunning(false);
  }


  function resetDialog() {
    setOpen(false);
    setForm({ name: "", agentHost: "", agentPort: "9800", installMode: "offline", sshHost: "", sshPort: "22", sshUsername: "root", sshPassword: "" });
    setToken(null);
    setNewAgentId(null);
    setInstallStatus(null);
    setInstallLog(null);
    setInstallCommand(null);
    setInstallDone(false);
    setInstallOk(false);
    setEditingServer(null);
  }

  async function handleCreate() {
    if (!form.name.trim() || !current?.id) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: form.name, installMode: form.installMode };
      if (form.agentHost.trim()) body.agentHost = form.agentHost.trim();
      const port = parseInt(form.agentPort, 10);
      if (!isNaN(port)) body.agentPort = port;
      if (form.installMode === "online") {
        body.ssh = {
          host: form.sshHost.trim(),
          port: parseInt(form.sshPort, 10) || 22,
          username: form.sshUsername.trim() || "root",
          password: form.sshPassword,
        };
      }
      const res = await api.post<{ id: string; agentId: string; agentToken: string; name: string; installStatus?: string; installLog?: string; installCommand?: string }>(
        `/workspaces/${current.id}/servers`, body
      );
      setToken(res.agentToken);
      setNewAgentId(res.agentId);
      setInstallStatus(res.installStatus ?? null);
      setInstallLog(res.installLog ?? null);
      setInstallCommand(res.installCommand ?? null);
      setInstallDone(false);
      setInstallOk(false);
      if (form.installMode === "online" && res.id) {
        void streamInstallLog(res.id);
      }
      queryClient.invalidateQueries({ queryKey: ["servers", current.id] });
      toast.success(t("servers.serverCreated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.createFailed"));
      resetDialog();
    } finally { setSubmitting(false); }
  }

  async function streamInstallLog(serverId: string) {
    const token = getToken();
    if (!token || !current?.id) return;
    try {
      const url = `${API_BASE_URL}/workspaces/${current.id}/servers/${serverId}/install/log`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            if (typeof data.lines === "string") setInstallLog(data.lines);
            if (data.done) { setInstallDone(true); setInstallOk(!!data.success); }
          } catch { /* ignore malformed event */ }
        }
      }
    } catch { /* stream ended */ }
  }

  async function handleEdit() {
    if (!editingServer || !current?.id) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: form.name };
      if (form.agentHost.trim()) body.agentHost = form.agentHost.trim();
      const port = parseInt(form.agentPort, 10);
      if (!isNaN(port)) body.agentPort = port;
      await api.patch(`/workspaces/${current.id}/servers/${editingServer.id}`, body);
      queryClient.invalidateQueries({ queryKey: ["servers", current.id] });
      toast.success(t("servers.serverUpdated"));
      resetDialog();
    } catch {
      toast.error(t("servers.updateFailed"));
    } finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!current?.id || !deleteTarget) return;
    setDeleting(true);
    try {
      const body: Record<string, unknown> = {};
      if (deleteUninstall) {
        body.uninstall = true;
        body.ssh = {
          host: deleteSsh.host.trim(),
          port: parseInt(deleteSsh.port, 10) || 22,
          username: deleteSsh.username.trim() || "root",
          password: deleteSsh.password,
        };
      }
      const res = await api.delete<{ uninstallSuccess?: boolean; uninstallLog?: string } | undefined>(
        `/workspaces/${current.id}/servers/${deleteTarget.id}`, Object.keys(body).length ? body : undefined
      );
      queryClient.invalidateQueries({ queryKey: ["servers", current.id] });
      if (deleteUninstall && res) {
        setDeleteLog(res.uninstallLog || "");
        setDeleteFinished(true);
        setDeleteSuccess(!!res.uninstallSuccess);
        if (res.uninstallSuccess) toast.success("服务器已删除，Agent 已卸载");
        else toast.error("服务器已删除，但 Agent 卸载失败（查看日志）");
      } else {
        toast.success(t("servers.serverDeleted"));
        setDeleteTarget(null);
      }
    } catch (err) {
      console.error("delete server:", err);
      toast.error(err instanceof Error ? err.message : t("servers.deleteFailed"));
    } finally { setDeleting(false); }
  }

  function handleCopy() {
    if (!token) return;
    navigator.clipboard.writeText(token);
    toast.success("Copied!");
  }

  function openEdit(s: { id: string; name: string; hostInfo: Record<string, unknown> }) {
    const hostInfo = s.hostInfo as Record<string, unknown> | null;
    setForm({
      name: s.name,
      agentHost: (hostInfo?.agent_host as string) || "",
      agentPort: String(hostInfo?.agent_port ?? "9800"),
      installMode: "offline", sshHost: "", sshPort: "22", sshUsername: "root", sshPassword: "",
    });
    setEditingServer(s);
    setOpen(true);
  }

  if (wsLoading || isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("servers.title")}</h1>
        <EmptyState icon={Server} title="Failed to load servers" description="Could not connect to the server." />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("servers.title")}</h1>
        <EmptyState icon={Server} title="No workspace" description="Create a workspace to get started." action={{ label: "Create workspace", href: "/settings" }} />
      </div>
    );
  }

  const filtered = servers?.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("servers.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("servers.desc")}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" /> {t("servers.addServer")}</Button>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/30">
          <CheckSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{selected.size} server(s) selected</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={clearSelection}><XSquare className="w-4 h-4 mr-1" />Deselect</Button>
          <Button variant="ghost" size="sm" onClick={selectAll}>Select all</Button>
          <Button size="sm" onClick={() => setBatchOpen(true)}><Terminal className="w-4 h-4 mr-1.5" />Run Command</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Server} title={t("servers.noServers")}
          description={t("servers.noServersDesc")}
          action={{ label: t("servers.addServer"), onClick: () => setOpen(true) }} />
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("servers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Card key={s.id} className={`border-border/50 hover:border-primary/50 transition-colors group ${selected.has(s.id) ? "ring-2 ring-primary/50 border-primary" : ""}`}>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} className="rounded accent-primary shrink-0 mt-0.5" />
                    <Link href={`/servers/${s.id}`} className="flex-1 min-w-0">
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      <div className="flex gap-1 mt-1">{s.tags?.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}</div>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <ServerStatusBadge status={s.isOnline ? "online" : "offline"} />
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit({ id: s.id, name: s.name, hostInfo: s.hostInfo }); }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: s.id, name: s.name, hostInfo: s.hostInfo }); setDeleteUninstall(false); setDeleteLog(null); setDeleteFinished(false); setDeleteSuccess(false); setDeleteSsh({ host: (s.hostInfo?.agent_host as string) || "", port: "22", username: "root", password: "" }); }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardHeader>
                <Link href={`/servers/${s.id}`}>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-sm font-medium">{s.latestCpuPercent ? `${s.latestCpuPercent}%` : "--"}</div><div className="text-xs text-muted-foreground">{t("servers.cpu")}</div></div>
                      <div><div className="text-sm font-medium">{s.latestMemUsed ? formatBytes(s.latestMemUsed) : "--"}</div><div className="text-xs text-muted-foreground">{t("servers.mem")}</div></div>
                      <div><div className="text-sm font-medium">{s.lastSeenAt ? timeAgo(s.lastSeenAt, t) : "--"}</div><div className="text-xs text-muted-foreground">{t("servers.uptime")}</div></div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Batch command dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Batch Command</DialogTitle>
            <DialogDescription>Execute a command on {selected.size} selected server(s).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-cmd">Command</Label>
              <Input id="batch-cmd" value={batchCmd} onChange={(e) => setBatchCmd(e.target.value)} placeholder="uptime" disabled={batchRunning} />
            </div>
            {batchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {batchResults.map((r) => (
                  <div key={r.serverId} className={`rounded-lg border p-3 text-xs ${r.error ? "border-red-500/30 bg-red-500/5" : "border-border/50 bg-muted/30"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{r.serverName}</span>
                      {r.error ? <span className="text-red-400">{r.error}</span> : <span className="text-green-400">OK</span>}
                    </div>
                    {r.output && <pre className="whitespace-pre-wrap text-muted-foreground">{r.output}</pre>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchOpen(false); setBatchResults([]); }} disabled={batchRunning}>Close</Button>
            <Button onClick={runBatchCommand} disabled={batchRunning || !batchCmd.trim()}>
              {batchRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Terminal className="w-4 h-4 mr-1" />}
              {batchRunning ? "Running..." : "Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServer ? t("servers.editServer") : t("servers.createServer")}</DialogTitle>
            <DialogDescription>{editingServer ? t("servers.editServerDesc") : t("servers.createServerDesc")}</DialogDescription>
          </DialogHeader>

          {token ? (
            <div className="space-y-3">
              {(installStatus || installDone) && form.installMode === "online" && (
                <div className={`rounded-lg border p-3 ${installDone ? (installOk ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5") : "border-primary/30 bg-primary/5"}`}>
                  <div className="text-sm font-medium mb-1 flex items-center gap-2">
                    {!installDone ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在远程安装...</span>
                      </>
                    ) : installOk ? (
                      <span className="text-green-500">Agent 安装成功</span>
                    ) : (
                      <span className="text-red-500">Agent 安装失败</span>
                    )}
                  </div>
                  {installLog ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-background/60 p-2 rounded max-h-72 overflow-auto">{installLog}</pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">等待安装输出...</p>
                  )}
                </div>
              )}
              {installCommand && (
                <div className="space-y-1.5">
                  <Label className="text-xs">安装命令</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md break-all font-mono">{installCommand}</code>
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(installCommand || ""); toast.success("Copied!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
              {newAgentId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">AGENT_ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md break-all font-mono">{newAgentId}</code>
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(newAgentId); toast.success("Copied!"); }}><Copy className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">AGENT_TOKEN</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md break-all font-mono">{token}</code>
                  <Button variant="outline" size="sm" onClick={handleCopy}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("servers.copyAndSave")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sname">{t("monitors.name")}</Label>
                <Input id="sname" placeholder={t("servers.namePlaceholder")} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              {!editingServer && (
                <div className="space-y-2">
                  <Label>安装方式</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setForm({ ...form, installMode: "online" })}
                      className={`rounded-lg border p-3 text-left transition-colors ${form.installMode === "online" ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"}`}>
                      <div className="text-sm font-medium">在线安装</div>
                      <div className="text-xs text-muted-foreground mt-0.5">通过 SSH 自动远程安装 Agent</div>
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, installMode: "offline" })}
                      className={`rounded-lg border p-3 text-left transition-colors ${form.installMode === "offline" ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"}`}>
                      <div className="text-sm font-medium">离线安装</div>
                      <div className="text-xs text-muted-foreground mt-0.5">创建后手动复制命令到服务器安装</div>
                    </button>
                  </div>
                </div>
              )}
              {!editingServer && form.installMode === "online" && (
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="ssh-host">SSH 主机</Label>
                      <Input id="ssh-host" placeholder="192.168.1.100" value={form.sshHost}
                        onChange={(e) => setForm({ ...form, sshHost: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ssh-port">SSH 端口</Label>
                      <Input id="ssh-port" type="number" value={form.sshPort}
                        onChange={(e) => setForm({ ...form, sshPort: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="ssh-user">用户名</Label>
                      <Input id="ssh-user" value={form.sshUsername}
                        onChange={(e) => setForm({ ...form, sshUsername: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ssh-pass">密码</Label>
                      <Input id="ssh-pass" type="password" value={form.sshPassword}
                        onChange={(e) => setForm({ ...form, sshPassword: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="shost">{t("servers.agentHost")}</Label>
                  <Input id="shost" placeholder={t("servers.agentHostPlaceholder")} value={form.agentHost}
                    onChange={(e) => setForm({ ...form, agentHost: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sport">{t("servers.agentPort")}</Label>
                  <Input id="sport" type="number" value={form.agentPort}
                    onChange={(e) => setForm({ ...form, agentPort: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {token ? (
              <Button onClick={resetDialog} className="w-full">{t("common.confirm")}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={resetDialog}>{t("common.cancel")}</Button>
                <Button onClick={editingServer ? handleEdit : handleCreate}
                  disabled={submitting || !form.name.trim() || (form.installMode === "online" && (!form.sshHost.trim() || !form.sshPassword))}>
                  {submitting ? (editingServer ? "Saving..." : form.installMode === "online" ? "正在远程安装..." : t("servers.creating")) : (editingServer ? t("common.save") : form.installMode === "online" ? "创建并安装" : t("servers.createServer"))}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("servers.deleteServer")}: {deleteTarget?.name}</DialogTitle>
            <DialogDescription>{t("servers.deleteServerDesc")}</DialogDescription>
          </DialogHeader>
          {!deleteFinished ? (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={deleteUninstall}
                  onChange={(e) => setDeleteUninstall(e.target.checked)}
                  className="rounded accent-primary" />
                <span>同时卸载 Agent（SSH 执行卸载脚本）</span>
              </label>
              {deleteUninstall && (
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label>SSH 主机</Label>
                      <Input value={deleteSsh.host} onChange={(e) => setDeleteSsh({ ...deleteSsh, host: e.target.value })} placeholder="192.168.1.100" />
                    </div>
                    <div className="space-y-2">
                      <Label>SSH 端口</Label>
                      <Input type="number" value={deleteSsh.port} onChange={(e) => setDeleteSsh({ ...deleteSsh, port: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>用户名</Label>
                      <Input value={deleteSsh.username} onChange={(e) => setDeleteSsh({ ...deleteSsh, username: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>密码</Label>
                      <Input type="password" value={deleteSsh.password} onChange={(e) => setDeleteSsh({ ...deleteSsh, password: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={`rounded-lg border p-3 ${deleteSuccess ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <div className="text-sm font-medium mb-1">
                {deleteSuccess
                  ? <span className="text-green-500">服务器已删除，Agent 已卸载</span>
                  : <span className="text-red-500">Agent 卸载失败（服务器已删除）</span>}
              </div>
              {deleteLog && <pre className="text-xs font-mono whitespace-pre-wrap bg-background/60 p-2 rounded max-h-72 overflow-auto">{deleteLog}</pre>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {deleteFinished ? "完成" : t("common.cancel")}
            </Button>
            {!deleteFinished && (
              <Button variant="destructive" onClick={handleDelete}
                disabled={deleting || (deleteUninstall && (!deleteSsh.host.trim() || !deleteSsh.password))}>
                {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {deleting ? (deleteUninstall ? "正在卸载..." : "删除中...") : (deleteUninstall ? "卸载并删除" : t("servers.deleteServer"))}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
