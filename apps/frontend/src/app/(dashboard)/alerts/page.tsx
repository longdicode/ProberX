"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAlertRules, useAlertEvents, type AlertRule, type AlertEvent } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  AlertOctagon, AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronUp, Plus,
  Siren, Trash2, type LucideIcon,
} from "lucide-react";

const SERVER_METRICS = ["cpu", "memory", "disk", "network_in", "network_out", "load_1", "load_5", "load_15"];
const MONITOR_METRICS = ["responseMs", "isSuccess"];
const OPERATORS = ["gt", "gte", "lt", "lte", "eq", "neq"];
const SEVERITIES = ["warning", "critical", "emergency"];

const SEV_STYLE: Record<string, { gradient: string; dot: string; badge: string; label: string }> = {
  warning: { gradient: "from-amber-500 to-yellow-500", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-500 border-amber-500/30", label: "警告" },
  critical: { gradient: "from-orange-500 to-red-500", dot: "bg-orange-500", badge: "bg-orange-500/10 text-orange-500 border-orange-500/30", label: "严重" },
  emergency: { gradient: "from-red-500 to-rose-600", dot: "bg-red-500", badge: "bg-red-500/10 text-red-500 border-red-500/30", label: "紧急" },
};

const SEV_ICON: Record<string, LucideIcon> = { warning: AlertTriangle, critical: AlertOctagon, emergency: Siren };

const METRIC_LABELS: Record<string, string> = {
  cpu: "CPU 使用率", memory: "内存使用", disk: "磁盘使用", network_in: "入站流量", network_out: "出站流量",
  load_1: "1 分钟负载", load_5: "5 分钟负载", load_15: "15 分钟负载", responseMs: "响应时间", isSuccess: "探测成功",
};
const OP_LABELS: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", neq: "≠" };

function OverviewStats({ rules, events }: { rules: AlertRule[]; events: AlertEvent[] }) {
  const active = events.filter((e) => !e.isResolved);
  const emergency = active.filter((e) => e.severity === "emergency").length;
  const items = [
    { label: "告警规则", value: String(rules.length), sub: `${rules.filter((r) => r.isEnabled).length} 个已启用`, icon: Bell, gradient: "from-indigo-500 to-blue-500" },
    { label: "活跃告警", value: String(active.length), sub: active.length > 0 ? "需要处理" : "一切正常", icon: AlertTriangle, gradient: "from-amber-500 to-orange-500" },
    { label: "紧急告警", value: String(emergency), sub: emergency > 0 ? "请立即处理" : "无紧急事件", icon: Siren, gradient: "from-red-500 to-rose-600" },
    { label: "累计事件", value: String(events.length), sub: `${events.filter((e) => e.isResolved).length} 个已解决`, icon: CheckCircle2, gradient: "from-emerald-500 to-teal-500" },
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

  const sortedEvents = useMemo(() => {
    return (events ?? []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [events]);

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-500 text-primary-foreground shadow-lg shadow-primary/25">
            <Bell className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("alerts.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("alerts.desc")}</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shadow-sm">
          <Plus className="mr-2 size-4" />{t("alerts.createAlert")}
        </Button>
      </div>

      {rules && rules.length > 0 && <OverviewStats rules={rules} events={events ?? []} />}

      {/* Recent events timeline */}
      {sortedEvents.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Bell className="size-4 text-primary" />
              最近告警事件
            </CardTitle>
            <span className="text-xs text-muted-foreground">共 {events?.length ?? 0} 条</span>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-0 pl-4">
              <div aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-border" />
              {sortedEvents.slice(0, 8).map((e) => {
                const st = SEV_STYLE[e.severity] ?? SEV_STYLE.warning;
                return (
                  <div key={e.id} className="relative flex items-center gap-3 py-2">
                    <span className={cn("absolute -left-4 top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-4 ring-background", st.dot)} />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{e.message}</span>
                    {e.metricValue && <span className="shrink-0 font-mono text-xs font-semibold">{e.metricValue}</span>}
                    {e.isResolved
                      ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                      : <Badge variant="outline" className={cn("shrink-0 text-[10px]", st.badge)}>{st.label}</Badge>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {rules && rules.length === 0 ? (
        <EmptyState icon={Bell} title={t("alerts.noAlerts")} description={t("alerts.noAlertsDesc")} action={{ label: t("alerts.createAlert"), onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="space-y-3">
          {rules?.map((r) => (
            <AlertRuleCard key={r.id} rule={r} wid={wid} events={events?.filter((e) => e.ruleId === r.id) ?? []} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} onDelete={setDeleteTarget} onResolve={handleResolve} t={t} />
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
                <select id="a-targetType" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, metric: e.target.value === "monitor" ? "responseMs" : "cpu" })}>
                  <option value="server">服务器指标</option>
                  <option value="monitor">监控探测</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-metric">{t("alerts.metric")}</Label>
                <select id="a-metric" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                  {(form.targetType === "monitor" ? MONITOR_METRICS : SERVER_METRICS).map((m) => <option key={m} value={m}>{METRIC_LABELS[m] ?? m}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="a-operator">{t("alerts.operator")}</Label>
                <select id="a-operator" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                  {OPERATORS.map((op) => <option key={op} value={op}>{OP_LABELS[op] ?? op}</option>)}
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
                <select id="a-severity" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{SEV_STYLE[s].label}</option>)}
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

function AlertRuleCard({ rule, wid, events, expanded, onToggle, onDelete, onResolve, t }: {
  rule: AlertRule;
  wid: string;
  events: AlertEvent[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: (r: { id: string; name: string }) => void;
  onResolve: (ruleId: string, eventId: string) => void;
  t: (k: string) => string;
}) {
  const st = SEV_STYLE[rule.severity] ?? SEV_STYLE.warning;
  const Icon = SEV_ICON[rule.severity] ?? AlertTriangle;
  const active = events.filter((e) => !e.isResolved).length;
  const resolved = events.length - active;

  return (
    <Card className={cn("group relative overflow-hidden border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5", !rule.isEnabled && "opacity-80")}>
      <CardContent className="p-4">
        <div className="flex cursor-pointer items-center justify-between gap-3" onClick={onToggle}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", st.gradient)}>
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{rule.name}</span>
                <Badge variant="outline" className={cn("text-[10px]", st.badge)}>{st.label}</Badge>
                {!rule.isEnabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">已禁用</Badge>}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {METRIC_LABELS[rule.metric] ?? rule.metric} {OP_LABELS[rule.operator] ?? rule.operator} <span className="font-semibold text-foreground">{rule.threshold}</span>
                </span>
                <span>{rule.targetType === "monitor" ? "监控探测" : "服务器指标"}</span>
                {rule.durationSec > 0 && <span>持续 {rule.durationSec}s</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {active > 0 && <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-xs text-red-400">{active} 活跃</Badge>}
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold tabular-nums">{events.length}</p>
              <p className="text-[10px] text-muted-foreground">{resolved} 已解决</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete({ id: rule.id, name: rule.name }); }} className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete rule">
              <Trash2 className="size-3.5" />
            </button>
            {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-border/50 pt-4">
            <h4 className="mb-2 text-sm font-medium">{t("alerts.events")}</h4>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("alerts.noEvents")}</p>
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border-b border-border/30 py-2 text-xs last:border-0 hover:bg-accent/40">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {e.isResolved
                        ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                        : <AlertTriangle className="size-3.5 shrink-0 text-red-400" />}
                      <span className="shrink-0 font-mono text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                      <span className="truncate">{e.message}</span>
                      {e.metricValue && <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono font-medium">{e.metricValue}</span>}
                    </div>
                    {!e.isResolved && (
                      <Button size="sm" variant="outline" className="h-6 shrink-0 text-xs" onClick={(ev) => { ev.stopPropagation(); onResolve(e.ruleId, e.id); }}>{t("alerts.resolve")}</Button>
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