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
import { useAlertRules, useAlertEvents } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { SEVERITY_COLORS } from "@/lib/constants";
import { Bell, Plus, AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Trash2 } from "lucide-react";

const SERVER_METRICS = ["cpu", "memory", "disk", "network_in", "network_out", "load_1", "load_5", "load_15"];
const MONITOR_METRICS = ["responseMs", "isSuccess"];
const OPERATORS = ["gt", "gte", "lt", "lte", "eq", "neq"];
const SEVERITIES = ["warning", "critical", "emergency"];

export default function AlertsPage() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const { data: rules, isLoading, error } = useAlertRules(wid);
  const { data: events } = useAlertEvents(wid);
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", targetType: "server", metric: "cpu", operator: "gt", threshold: "90", durationSec: 0, severity: "warning" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.threshold.trim() || isNaN(Number(form.threshold))) errors.threshold = "Valid number required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm() || !wid) return;
    setSubmitting(true);
    try {
      await api.post(`/workspaces/${wid}/alerts`, { ...form, threshold: Number(form.threshold), durationSec: Number(form.durationSec) });
      queryClient.invalidateQueries({ queryKey: ["alert-rules", wid] });
      setDialogOpen(false);
      setForm({ name: "", targetType: "server", metric: "cpu", operator: "gt", threshold: "90", durationSec: 0, severity: "warning" });
    } catch { /* handled by api-client */ }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!wid || !deleteTarget) return;
    try {
      await api.delete(`/workspaces/${wid}/alerts/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["alert-rules", wid] });
    } catch { /* handled */ }
    finally { setDeleteTarget(null); }
  };

  const handleResolve = async (ruleId: string, eventId: string) => {
    if (!wid) return;
    await api.patch(`/workspaces/${wid}/alerts/${ruleId}/events/${eventId}`);
    queryClient.invalidateQueries({ queryKey: ["alert-events", wid] });
  };

  if (!wid) {
    return <EmptyState icon={Bell} title={t("alerts.noAlerts")} description={t("alerts.noAlertsDesc")} />;
  }

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <EmptyState icon={AlertTriangle} title="Failed to load" description="Could not load alert rules." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("alerts.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("alerts.desc")}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />{t("alerts.createAlert")}</Button>
      </div>

      {rules && rules.length === 0 ? (
        <EmptyState icon={Bell} title={t("alerts.noAlerts")} description={t("alerts.noAlertsDesc")} action={{ label: t("alerts.createAlert"), onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="space-y-3">
          {rules?.map((r) => (
            <AlertRuleCard key={r.id} rule={r} wid={wid} events={events?.filter(e => e.ruleId === r.id) ?? []} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} onDelete={setDeleteTarget} onResolve={handleResolve} t={t} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("alerts.createAlert")}</DialogTitle>
            <DialogDescription>{t("alerts.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="a-name">{t("alerts.name")}</Label>
              <Input id="a-name" placeholder={t("alerts.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-targetType">{t("alerts.targetType")}</Label>
                <select id="a-targetType" className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, metric: e.target.value === "monitor" ? "responseMs" : "cpu" })}>
                  <option value="server">Server</option>
                  <option value="monitor">Monitor</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-metric">{t("alerts.metric")}</Label>
                <select id="a-metric" className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                  {(form.targetType === "monitor" ? MONITOR_METRICS : SERVER_METRICS).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-operator">{t("alerts.operator")}</Label>
                <select id="a-operator" className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                  {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-threshold">{t("alerts.threshold")}</Label>
                <Input id="a-threshold" placeholder="90" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
                {formErrors.threshold && <p className="text-xs text-red-500">{formErrors.threshold}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-duration">{t("alerts.duration")}</Label>
                <Input id="a-duration" type="number" value={form.durationSec} onChange={(e) => setForm({ ...form, durationSec: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-severity">{t("alerts.severity")}</Label>
                <select id="a-severity" className="flex h-8 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("alerts.cancel")}</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? t("alerts.creating") : t("alerts.createAlert")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`Delete alert rule: ${deleteTarget?.name}`}
        description="This will permanently delete the alert rule and all associated events."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}

function AlertRuleCard({ rule, wid, events, expanded, onToggle, onDelete, onResolve, t }: { rule: { id: string; name: string; metric: string; operator: string; threshold: string; severity: string; isEnabled: boolean; targetType: string }; wid: string; events: { id: string; ruleId: string; severity: string; message: string; metricValue: string | null; isResolved: boolean; createdAt: string }[]; expanded: boolean; onToggle: () => void; onDelete: (r: { id: string; name: string }) => void; onResolve: (ruleId: string, eventId: string) => void; t: (k: string) => string }) {
  const sev = SEVERITY_COLORS[rule.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.warning;

  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: rule.isEnabled ? "var(--chart-5)" : "var(--muted-foreground)" }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{rule.name}</span>
                <Badge variant="outline" className={sev.bg + " " + sev.text + " border-" + sev.border}>{rule.severity}</Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{rule.metric} {rule.operator} {rule.threshold} · {rule.targetType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {events.filter(e => !e.isResolved).length > 0 && (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">
                {events.filter(e => !e.isResolved).length} {t("alerts.active")}
              </Badge>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete({ id: rule.id, name: rule.name }); }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete rule">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <h4 className="text-sm font-medium mb-2">{t("alerts.events")}</h4>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("alerts.noEvents")}</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.isResolved
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      }
                      <span className="text-muted-foreground font-mono">{new Date(e.createdAt).toLocaleString()}</span>
                      <span className="truncate">{e.message}</span>
                      {e.metricValue && <span className="font-mono font-medium shrink-0">{e.metricValue}</span>}
                    </div>
                    {!e.isResolved && (
                      <Button size="sm" variant="outline" className="text-xs h-6 shrink-0" onClick={(ev) => { ev.stopPropagation(); onResolve(e.ruleId, e.id); }}>{t("alerts.resolve")}</Button>
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
