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
import { useMonitors, useProbeResults } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { MONITOR_TYPES } from "@/lib/constants";
import { formatDuration } from "@/lib/utils";
import { Eye, Plus, CheckCircle2, XCircle, Clock, Activity, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  http: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  tcp: "bg-green-500/10 text-green-400 border-green-500/30",
  ping: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  dns: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  ssl: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  grpc: "bg-pink-500/10 text-pink-400 border-pink-500/30",
};

export default function MonitorsPage() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const { data: monitors, isLoading, error } = useMonitors(wid);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", type: "http", target: "", intervalSec: 60, timeoutMs: 5000 });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.target.trim()) errors.target = "Target is required";
    if (form.intervalSec < 10) errors.intervalSec = "Minimum 10 seconds";
    if (form.timeoutMs < 1000) errors.timeoutMs = "Minimum 1000ms";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm() || !wid) return;
    setSubmitting(true);
    try {
      await api.post(`/workspaces/${wid}/monitors`, form);
      queryClient.invalidateQueries({ queryKey: ["monitors", wid] });
      setDialogOpen(false);
      setForm({ name: "", type: "http", target: "", intervalSec: 60, timeoutMs: 5000 });
    } catch { /* handled by api-client */ }
    finally { setSubmitting(false); }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleDelete = async () => {
    if (!wid || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${wid}/monitors/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["monitors", wid] });
    } catch { /* handled */ }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  if (!wid) {
    return <EmptyState icon={Eye} title={t("monitors.noMonitors")} description={t("monitors.noMonitorsDesc")} />;
  }

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <EmptyState icon={XCircle} title="Failed to load" description="Could not load monitors." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("monitors.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("monitors.desc")}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />{t("monitors.createMonitor")}</Button>
      </div>

      {monitors && monitors.length === 0 ? (
        <EmptyState icon={Eye} title={t("monitors.noMonitors")} description={t("monitors.noMonitorsDesc")} action={{ label: t("monitors.createMonitor"), onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="space-y-3">
          {monitors?.map((m) => (
            <MonitorCard key={m.id} monitor={m} wid={wid} expanded={expandedId === m.id} onToggle={() => toggleExpand(m.id)} onDelete={setDeleteTarget} t={t} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("monitors.createMonitor")}</DialogTitle>
            <DialogDescription>{t("monitors.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="m-name">{t("monitors.name")}</Label>
              <Input id="m-name" placeholder={t("monitors.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-type">{t("monitors.type")}</Label>
              <select id="m-type" className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {MONITOR_TYPES.map((mt) => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-target">{t("monitors.target")}</Label>
              <Input id="m-target" placeholder={t("monitors.targetPlaceholder")} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
              {formErrors.target && <p className="text-xs text-red-500">{formErrors.target}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="m-interval">{t("monitors.interval")}</Label>
                <Input id="m-interval" type="number" value={form.intervalSec} onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })} />
                {formErrors.intervalSec && <p className="text-xs text-red-500">{formErrors.intervalSec}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-timeout">{t("monitors.timeout")}</Label>
                <Input id="m-timeout" type="number" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })} />
                {formErrors.timeoutMs && <p className="text-xs text-red-500">{formErrors.timeoutMs}</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("monitors.cancel")}</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? t("monitors.creating") : t("monitors.createMonitor")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete monitor: ${deleteTarget?.name}`}
        description="This will permanently delete the monitor and all associated probe results."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}

function MonitorCard({ monitor, wid, expanded, onToggle, onDelete, t }: { monitor: { id: string; name: string; type: string; target: string; intervalSec: number; timeoutMs: number; isEnabled: boolean }; wid: string; expanded: boolean; onToggle: () => void; onDelete: (m: { id: string; name: string }) => void; t: (k: string) => string }) {
  const { data: results } = useProbeResults(wid, expanded ? monitor.id : undefined);
  const lastResult = results?.[0];

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: monitor.isEnabled ? "var(--chart-2)" : "var(--muted-foreground)" }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{monitor.name}</span>
                <Badge variant="outline" className={TYPE_COLORS[monitor.type] || ""}>{monitor.type.toUpperCase()}</Badge>
                {!monitor.isEnabled && <Badge variant="outline" className="text-muted-foreground">{t("monitors.disabled")}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{monitor.target} · {t("monitors.interval")}: {monitor.intervalSec}s</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {lastResult && (
              lastResult.isSuccess
                ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                : <XCircle className="w-4 h-4 text-red-400" />
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete({ id: monitor.id, name: monitor.name }); }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete monitor">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-2">{t("monitors.lastResults")}</h4>
            {!results || results.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("monitors.noResults")}</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {results.slice(0, 10).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1 border-b border-border/30 last:border-0">
                    {r.isSuccess
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    }
                    <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground font-mono">{new Date(r.time).toLocaleTimeString()}</span>
                    <span className="text-muted-foreground">{t("monitors.responseTime")}:</span>
                    <span className="font-mono font-medium">{r.responseMs}ms</span>
                    {r.statusCode && <><span className="text-muted-foreground">{t("monitors.statusCode")}:</span><span className="font-mono">{r.statusCode}</span></>}
                    {r.errorMsg && <span className="text-red-400 truncate">{r.errorMsg}</span>}
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
