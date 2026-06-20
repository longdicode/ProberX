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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useServers } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
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
  const [form, setForm] = useState({ name: "", agentHost: "", agentPort: "9800" });
  const [token, setToken] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState<{ id: string; name: string; hostInfo: Record<string, unknown> } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
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

  useEffect(() => {
    if (!current && workspaces && workspaces.length > 0) setCurrent(workspaces[0]);
  }, [workspaces, current, setCurrent]);

  function resetDialog() {
    setOpen(false);
    setForm({ name: "", agentHost: "", agentPort: "9800" });
    setToken(null);
    setNewAgentId(null);
    setEditingServer(null);
  }

  async function handleCreate() {
    if (!form.name.trim() || !current?.id) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: form.name };
      if (form.agentHost.trim()) body.agentHost = form.agentHost.trim();
      const port = parseInt(form.agentPort, 10);
      if (!isNaN(port)) body.agentPort = port;
      const res = await api.post<{ id: string; agentId: string; agentToken: string; name: string }>(
        `/workspaces/${current.id}/servers`, body
      );
      setToken(res.agentToken);
      setNewAgentId(res.agentId);
      queryClient.invalidateQueries({ queryKey: ["servers", current.id] });
      toast.success(t("servers.serverCreated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.createFailed"));
      resetDialog();
    } finally { setSubmitting(false); }
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
      await api.delete(`/workspaces/${current.id}/servers/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["servers", current.id] });
      toast.success(t("servers.serverDeleted"));
    } catch (err) {
      console.error("delete server:", err);
      toast.error(err instanceof Error ? err.message : t("servers.deleteFailed"));
    } finally { setDeleting(false); setDeleteTarget(null); }
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
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: s.id, name: s.name }); }}
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
                <Button onClick={editingServer ? handleEdit : handleCreate} disabled={submitting || !form.name.trim()}>
                  {submitting ? (editingServer ? "Saving..." : t("servers.creating")) : (editingServer ? t("common.save") : t("servers.createServer"))}
                </Button>
              </>
            )}
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
