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
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useCronJobs, useCronExecutions } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { Timer, Plus, Trash2, Clock, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function TasksPage() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const { data: jobs, isLoading, error } = useCronJobs(wid);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", cronExpr: "", command: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.cronExpr.trim()) errors.cronExpr = "Cron expression is required";
    if (!form.command.trim()) errors.command = "Command is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm() || !wid) return;
    setSubmitting(true);
    try {
      await api.post(`/workspaces/${wid}/cronjobs`, form);
      queryClient.invalidateQueries({ queryKey: ["cronjobs", wid] });
      setDialogOpen(false);
      setForm({ name: "", cronExpr: "", command: "" });
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
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />{t("tasks.createTask")}</Button>
      </div>

      {jobs && jobs.length === 0 ? (
        <EmptyState icon={Timer} title={t("tasks.noTasks")} description={t("tasks.noTasksDesc")} action={{ label: t("tasks.createTask"), onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="space-y-3">
          {jobs?.map((j) => (
            <TaskCard key={j.id} job={j} wid={wid} expanded={expandedId === j.id} onToggle={() => setExpandedId(expandedId === j.id ? null : j.id)} onDelete={setDeleteTarget} t={t} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tasks.createTask")}</DialogTitle>
            <DialogDescription>{t("tasks.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="t-name">{t("tasks.name")}</Label>
              <Input id="t-name" placeholder={t("tasks.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-cron">{t("tasks.cronExpr")}</Label>
              <Input id="t-cron" placeholder={t("tasks.cronPlaceholder")} value={form.cronExpr} onChange={(e) => setForm({ ...form, cronExpr: e.target.value })} />
              {formErrors.cronExpr && <p className="text-xs text-red-500">{formErrors.cronExpr}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-cmd">{t("tasks.command")}</Label>
              <Input id="t-cmd" placeholder={t("tasks.commandPlaceholder")} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
              {formErrors.command && <p className="text-xs text-red-500">{formErrors.command}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("tasks.cancel")}</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? t("tasks.creating") : t("tasks.createTask")}</Button>
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

function TaskCard({ job, wid, expanded, onToggle, onDelete, t }: { job: { id: string; name: string; cronExpr: string; command: string; isEnabled: boolean }; wid: string; expanded: boolean; onToggle: () => void; onDelete: (j: { id: string; name: string }) => void; t: (k: string) => string }) {
  const { data: executions, isLoading: execLoading } = useCronExecutions(wid, expanded ? job.id : undefined);

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
          <div className="flex items-center gap-3 shrink-0 ml-4">
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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
