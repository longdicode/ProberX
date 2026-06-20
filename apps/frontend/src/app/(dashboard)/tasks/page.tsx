"use client";

import { useState } from "react";
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
import { useCronJobs, useCronExecutions, useServers, type CronJob } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { Timer, Plus, Trash2, Clock, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Pencil } from "lucide-react";

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
          name: form.name,
          cronExpr: form.cronExpr,
          command: form.command,
          targetServers: form.targetServers,
          isEnabled: form.isEnabled,
        });
      } else {
        await api.post(`/workspaces/${wid}/cronjobs`, {
          name: form.name,
          cronExpr: form.cronExpr,
          command: form.command,
          targetServers: form.targetServers,
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("tasks.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tasks.desc")}</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />{t("tasks.createTask")}</Button>
      </div>

      {jobs && jobs.length === 0 ? (
        <EmptyState icon={Timer} title={t("tasks.noTasks")} description={t("tasks.noTasksDesc")} action={{ label: t("tasks.createTask"), onClick: openCreate }} />
      ) : (
        <div className="space-y-3">
          {jobs?.map((j) => (
            <TaskCard key={j.id} job={j} wid={wid} expanded={expandedId === j.id} onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)} onDelete={setDeleteTarget} onEdit={openEdit} t={t} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? t("tasks.editTask") : t("tasks.createTask")}</DialogTitle>
            <DialogDescription>{isEdit ? t("tasks.editTaskDesc") : t("tasks.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="t-name">{t("tasks.name")}</Label>
              <Input id="t-name" placeholder={t("tasks.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t("tasks.cronExpr")}</Label>
              <CronBuilder value={form.cronExpr} onChange={(v) => setForm({ ...form, cronExpr: v })} />
              <CronPreview cronExpr={form.cronExpr} wid={wid} />
              {formErrors.cronExpr && <p className="text-xs text-red-500">{formErrors.cronExpr}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-cmd">{t("tasks.command")}</Label>
              <Input id="t-cmd" placeholder={t("tasks.commandPlaceholder")} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditTarget(null); }}>{t("tasks.cancel")}</Button>
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

function TaskCard({ job, wid, expanded, onToggle, onDelete, onEdit, t }: { job: { id: string; name: string; cronExpr: string; command: string; isEnabled: boolean; targetServers?: string[] }; wid: string; expanded: boolean; onToggle: () => void; onDelete: (j: { id: string; name: string }) => void; onEdit: (j: CronJob) => void; t: (k: string, vars?: Record<string, string | number>) => string }) {
  const { data: executions, isLoading: execLoading } = useCronExecutions(wid, expanded ? job.id : undefined);
  const queryClient = useQueryClient();

  const toggleEnabled = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch(`/workspaces/${wid}/cronjobs/${job.id}`, { isEnabled: !job.isEnabled }, { noToast: true });
      queryClient.invalidateQueries({ queryKey: ["cronjobs", wid] });
    } catch { /* handled */ }
  };

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: job.isEnabled ? "var(--chart-4)" : "var(--muted-foreground)" }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{job.name}</span>
                {!job.isEnabled && <Badge variant="outline" className="text-muted-foreground text-xs">{t("tasks.disabled")}</Badge>}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.cronExpr}</span>
                <span className="font-mono truncate">{job.command}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <div onClick={(e) => { e.stopPropagation(); toggleEnabled(e); }}>
              <Switch checked={job.isEnabled} onCheckedChange={() => {}} disabled={false} />
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-blue-400" onClick={(e) => { e.stopPropagation(); onEdit(job as unknown as CronJob); }}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-red-400" onClick={(e) => { e.stopPropagation(); onDelete({ id: job.id, name: job.name }); }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-2">{t("tasks.executionHistory")}</h4>
            {execLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="w-3 h-3 animate-spin" />Loading...</div>
            ) : !executions || executions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("tasks.noExecutions")}</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {executions.map((ex) => (
                  <div key={ex.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/30 last:border-0">
                    {ex.status === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /> : ex.status === "running" ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <span className="text-muted-foreground font-mono">{new Date(ex.createdAt).toLocaleString()}</span>
                    <Badge variant="outline" className="text-[10px]">{ex.status}</Badge>
                    {ex.output && <span className="text-muted-foreground font-mono truncate">{ex.output.slice(0, 80)}</span>}
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
