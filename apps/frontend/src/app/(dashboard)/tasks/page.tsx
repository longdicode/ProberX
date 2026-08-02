"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { CronBuilder } from "@/components/tasks/cron-builder";
import { CronPreview } from "@/components/tasks/cron-preview";
import { ServerMultiSelect } from "@/components/tasks/server-multi-select";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useCronJobs, useCronExecutions, useServers, type CronJob, type CronExecution, type Server } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  CalendarClock, ChevronDown, ChevronUp, Clock, ListChecks, Loader2, Pencil, Play,
  Plus, Server as ServerIcon, Terminal, Timer, Trash2,
} from "lucide-react";

function formatDuration(ex: CronExecution): string | null {
  if (!ex.startedAt || !ex.finishedAt) return null;
  const ms = new Date(ex.finishedAt).getTime() - new Date(ex.startedAt).getTime();
  if (isNaN(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function OverviewStats({ stats }: { stats: { total: number; enabled: number; disabled: number; servers: number; exec: { success: number; failed: number; running: number } } }) {
  const items = [
    { label: "计划任务", value: String(stats.total), sub: `${stats.enabled} 个已启用`, icon: CalendarClock, gradient: "from-indigo-500 to-blue-500" },
    { label: "运行中", value: String(stats.enabled), sub: `${stats.disabled} 个已停用`, icon: Timer, gradient: "from-emerald-500 to-teal-500" },
    { label: "涉及服务器", value: String(stats.servers), sub: "全部任务覆盖范围", icon: ServerIcon, gradient: "from-cyan-500 to-sky-500" },
    { label: "最近执行", value: String(stats.exec.success + stats.exec.failed + stats.exec.running), sub: `${stats.exec.success} 成功 · ${stats.exec.failed} 失败 · ${stats.exec.running} 运行中`, icon: ListChecks, gradient: "from-fuchsia-500 to-purple-500" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ label, value, sub, icon: Icon, gradient }) => (
        <Card key={label} className="group relative overflow-hidden border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
              </div>
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", gradient)}>
                <Icon className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExecStatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-500">成功</Badge>;
  if (status === "running") return <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-400"><Loader2 className="mr-1 size-2.5 animate-spin" />运行中</Badge>;
  return <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-[10px] text-red-400">失败</Badge>;
}

export default function TasksPage() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const { data: jobs, isLoading, error } = useCronJobs(wid);
  const { data: serversData } = useServers(wid);
  const servers = serversData ?? [];
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editTarget, setEditTarget] = useState<CronJob | null>(null);
  const [form, setForm] = useState({ name: "", cronExpr: "", command: "", targetServers: [] as string[], isEnabled: true });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [execStats, setExecStats] = useState<Record<string, { success: number; failed: number; running: number }>>({});
  const onExecStats = useCallback((id: string, s: { success: number; failed: number; running: number }) => {
    setExecStats((prev) => {
      const cur = prev[id];
      if (cur && cur.success === s.success && cur.failed === s.failed && cur.running === s.running) return prev;
      return { ...prev, [id]: s };
    });
  }, []);

  const overview = useMemo(() => {
    const list = jobs ?? [];
    const serverIds = new Set<string>();
    list.forEach((j) => (j.targetServers ?? []).forEach((sid) => serverIds.add(sid)));
    const agg = { success: 0, failed: 0, running: 0 };
    Object.values(execStats).forEach((e) => { agg.success += e.success; agg.failed += e.failed; agg.running += e.running; });
    return {
      total: list.length,
      enabled: list.filter((j) => j.isEnabled).length,
      disabled: list.filter((j) => !j.isEnabled).length,
      servers: serverIds.size,
      exec: agg,
    };
  }, [jobs, execStats]);

  const isEdit = !!editTarget;

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: "", cronExpr: "", command: "", targetServers: [], isEnabled: true });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (job: CronJob) => {
    setEditTarget(job);
    setForm({ name: job.name, cronExpr: job.cronExpr, command: job.command, targetServers: job.targetServers ?? [], isEnabled: job.isEnabled });
    setFormErrors({});
    setDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.cronExpr.trim()) errors.cronExpr = "Cron expression is required";
    if (!form.command.trim()) errors.command = "Command is required";
    if (form.targetServers.length === 0) errors.targetServers = "At least one server is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !wid) return;
    setSubmitting(true);
    try {
      if (isEdit && editTarget) {
        await api.patch(`/workspaces/${wid}/cronjobs/${editTarget.id}`, {
          name: form.name, cronExpr: form.cronExpr, command: form.command, targetServers: form.targetServers, isEnabled: form.isEnabled,
        });
      } else {
        await api.post(`/workspaces/${wid}/cronjobs`, {
          name: form.name, cronExpr: form.cronExpr, command: form.command, targetServers: form.targetServers,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["cronjobs", wid] });
      setDialogOpen(false);
      setEditTarget(null);
      setForm({ name: "", cronExpr: "", command: "", targetServers: [], isEnabled: true });
    } catch { /* handled */ }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!wid || !deleteTarget) return;
    try {
      await api.delete(`/workspaces/${wid}/cronjobs/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["cronjobs", wid] });
    } catch { /* handled */ }
    finally { setDeleteTarget(null); }
  };

  if (!wid) return <EmptyState icon={Timer} title={t("tasks.noTasks")} description={t("tasks.noTasksDesc")} />;
  if (isLoading) return <LoadingSkeleton />;
  if (error) return <EmptyState icon={Timer} title="Failed to load" description="Could not load tasks." />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-500 text-primary-foreground shadow-lg shadow-primary/25">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("tasks.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("tasks.desc")}</p>
          </div>
        </div>
        <Button onClick={openCreate} className="shadow-sm">
          <Plus className="mr-2 size-4" />{t("tasks.createTask")}
        </Button>
      </div>

      {jobs && jobs.length > 0 && <OverviewStats stats={overview} />}

      {jobs && jobs.length === 0 ? (
        <EmptyState icon={Timer} title={t("tasks.noTasks")} description={t("tasks.noTasksDesc")} action={{ label: t("tasks.createTask"), onClick: openCreate }} />
      ) : (
        <div className="space-y-3">
          {jobs?.map((j) => (
            <TaskCard key={j.id} job={j} servers={servers} wid={wid} expanded={expandedId === j.id} onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)} onDelete={setDeleteTarget} onEdit={openEdit} onExecStats={onExecStats} t={t} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? t("tasks.editTask") : t("tasks.createTask")}</DialogTitle>
            <DialogDescription>{isEdit ? t("tasks.editTaskDesc") : t("tasks.desc")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="t-name">{t("tasks.name")}</Label>
              <Input id="t-name" placeholder={t("tasks.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.cronExpr")}</Label>
              <div className="rounded-xl border border-border/60 bg-card/50 p-3">
                <CronBuilder value={form.cronExpr} onChange={(v) => setForm({ ...form, cronExpr: v })} />
                <CronPreview cronExpr={form.cronExpr} wid={wid} />
              </div>
              {formErrors.cronExpr && <p className="text-xs text-red-500">{formErrors.cronExpr}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-cmd">{t("tasks.command")}</Label>
              <textarea
                id="t-cmd"
                placeholder={t("tasks.commandPlaceholder")}
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                rows={4}
                className="min-h-[96px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {formErrors.command && <p className="text-xs text-red-500">{formErrors.command}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.targetServers")}</Label>
              <ServerMultiSelect
                servers={servers}
                value={form.targetServers}
                onChange={(v) => setForm({ ...form, targetServers: v })}
                placeholder={t("tasks.selectServers")}
              />
              {formErrors.targetServers && <p className="text-xs text-red-500">{formErrors.targetServers}</p>}
            </div>
            {isEdit && (
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">任务状态</p>
                  <p className="text-xs text-muted-foreground">{form.isEnabled ? "任务已启用，将按计划执行" : "任务已停用，不会触发"}</p>
                </div>
                <Switch checked={form.isEnabled} onCheckedChange={(v) => setForm({ ...form, isEnabled: v })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("tasks.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? (isEdit ? t("tasks.updating") : t("tasks.creating")) : (isEdit ? t("tasks.editTask") : t("tasks.createTask"))}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete task: ${deleteTarget?.name}`}
        description="This will permanently delete the scheduled task and all execution history."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}

function TaskCard({ job, servers, wid, expanded, onToggle, onDelete, onEdit, onExecStats, t }: {
  job: CronJob;
  servers: Server[];
  wid: string;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (j: { id: string; name: string }) => void;
  onEdit: (j: CronJob) => void;
  onExecStats: (id: string, s: { success: number; failed: number; running: number }) => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { data: executions, isLoading: execLoading } = useCronExecutions(wid, job.id);
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (running) return;
    setRunning(true);
    try {
      await api.post(`/workspaces/${wid}/cronjobs/${job.id}/run`);
      queryClient.invalidateQueries({ queryKey: ["cron-executions", wid, job.id] });
      queryClient.invalidateQueries({ queryKey: ["cronjobs", wid] });
    } catch { /* handled by api-client */ }
    finally { setRunning(false); }
  };

  const stats = useMemo(() => {
    const list = executions ?? [];
    return {
      success: list.filter((e) => e.status === "success").length,
      failed: list.filter((e) => e.status !== "success" && e.status !== "running").length,
      running: list.filter((e) => e.status === "running").length,
      total: list.length,
    };
  }, [executions]);

  useEffect(() => {
    onExecStats(job.id, { success: stats.success, failed: stats.failed, running: stats.running });
  }, [stats.success, stats.failed, stats.running, job.id, onExecStats]);

  const toggleEnabled = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch(`/workspaces/${wid}/cronjobs/${job.id}`, { isEnabled: !job.isEnabled }, { noToast: true });
      queryClient.invalidateQueries({ queryKey: ["cronjobs", wid] });
    } catch { /* handled */ }
  };

  const serverNames = (job.targetServers ?? [])
    .map((sid) => servers.find((s) => s.id === sid)?.name)
    .filter((n): n is string => !!n);

  const lastExec = executions?.[0];
  const lastStatus = lastExec?.status;

  return (
    <Card className={cn("group relative overflow-hidden border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5", !job.isEnabled && "opacity-80")}>
      <CardContent className="p-4">
        <div className="flex cursor-pointer items-center justify-between gap-3" onClick={onToggle}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", job.isEnabled ? "from-indigo-500 to-blue-500" : "from-zinc-500 to-zinc-600")}>
              <Terminal className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{job.name}</span>
                {!job.isEnabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("tasks.disabled")}</Badge>}
                {lastStatus && <ExecStatusBadge status={lastStatus} />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                  <Clock className="size-3" />{job.cronExpr}
                </span>
                <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  <ServerIcon className="size-3" />{serverNames.length > 0 ? serverNames.slice(0, 2).join("、") : t("tasks.noServers")}{serverNames.length > 2 ? ` 等 ${serverNames.length} 台` : ""}
                </span>
                {stats.total > 0 && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    历史 {stats.total} 次 · 成功 {stats.success}
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted-foreground">
                <Terminal className="size-3 shrink-0" />{job.command}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon-sm" className="text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400" onClick={handleRun} disabled={running} title="立即执行">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            </Button>
            <div onClick={(e) => { e.stopPropagation(); toggleEnabled(e); }} title={job.isEnabled ? "停用任务" : "启用任务"}>
              <Switch checked={job.isEnabled} onCheckedChange={() => {}} />
            </div>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-blue-400" onClick={(e) => { e.stopPropagation(); onEdit(job); }}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDelete({ id: job.id, name: job.name }); }}>
              <Trash2 className="size-4" />
            </Button>
            {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-border/50 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="size-4 text-primary" />
                {t("tasks.executionHistory")}
              </h4>
              {stats.total > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  成功 <span className="font-semibold text-emerald-500">{stats.success}</span>
                  {" · "}失败 <span className="font-semibold text-red-400">{stats.failed}</span>
                  {" · "}运行中 <span className="font-semibold text-blue-400">{stats.running}</span>
                </span>
              )}
            </div>
            {execLoading ? (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Loading...</div>
            ) : !executions || executions.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">{t("tasks.noExecutions")}</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border/50">
                {executions.map((ex) => (
                  <div key={ex.id} className="flex items-center gap-3 border-b border-border/30 bg-card/30 px-3 py-2 text-xs last:border-0 hover:bg-accent/40">
                    <div className="w-16 shrink-0">
                      <ExecStatusBadge status={ex.status} />
                    </div>
                    <span className="shrink-0 font-mono text-muted-foreground">{new Date(ex.createdAt).toLocaleString()}</span>
                    {formatDuration(ex) && <span className="shrink-0 text-[11px] text-muted-foreground">耗时 {formatDuration(ex)}</span>}
                    {ex.output ? (
                      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{ex.output.slice(0, 120)}</span>
                    ) : (
                      <span className="flex-1 text-muted-foreground/60">（无输出）</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}