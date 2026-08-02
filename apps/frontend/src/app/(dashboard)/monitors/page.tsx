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
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useMonitors, useProbeResults, type MonitorTask, type ProbeResult } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { MONITOR_TYPES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Activity, Cable, CheckCircle2, ChevronDown, ChevronUp, Eye, Gauge, Globe, Network,
  Percent, Plus, Shield, Timer, Trash2, XCircle, Zap, type LucideIcon,
} from "lucide-react";

const TYPE_ICONS: Record<string, LucideIcon> = {
  http: Globe, tcp: Cable, ping: Activity, dns: Network, ssl: Shield, grpc: Zap,
};

const TYPE_STYLES: Record<string, { gradient: string; text: string }> = {
  http: { gradient: "from-blue-500 to-cyan-500", text: "text-blue-400" },
  tcp: { gradient: "from-emerald-500 to-teal-500", text: "text-emerald-400" },
  ping: { gradient: "from-amber-500 to-yellow-500", text: "text-amber-400" },
  dns: { gradient: "from-purple-500 to-violet-500", text: "text-purple-400" },
  ssl: { gradient: "from-orange-500 to-rose-500", text: "text-orange-400" },
  grpc: { gradient: "from-pink-500 to-rose-500", text: "text-pink-400" },
};

function uptimeOf(results?: ProbeResult[]) {
  if (!results || results.length === 0) return null;
  const success = results.filter((r) => r.isSuccess).length;
  const ms = results.filter((r): r is ProbeResult & { responseMs: number } => r.responseMs != null).map((r) => r.responseMs);
  return {
    ok: results[0].isSuccess,
    uptime: Math.round((success / results.length) * 1000) / 10,
    avgMs: ms.length > 0 ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null,
  };
}

function Sparkline({ data }: { data: boolean[] }) {
  const w = 110, h = 30;
  if (data.length < 2) return <div className="h-[30px]" />;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 5 - (v ? 13 : 2)] as const);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const positive = data[0];
  const color = positive ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[30px] w-full" preserveAspectRatio="none" aria-hidden>
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OverviewStats({ stats }: { stats: { total: number; enabled: number; ok: number; failing: number; avgUptime: number | null } }) {
  const items = [
    { label: "监控总数", value: String(stats.total), sub: `${stats.enabled} 个运行中`, icon: Gauge, gradient: "from-indigo-500 to-blue-500" },
    { label: "最近探测正常", value: String(stats.ok), sub: `${stats.failing} 个最近失败`, icon: CheckCircle2, gradient: "from-emerald-500 to-teal-500" },
    { label: "平均可用率", value: stats.avgUptime === null ? "--" : `${stats.avgUptime}%`, sub: "近 20 次探测汇总", icon: Percent, gradient: "from-amber-500 to-orange-500" },
    { label: "已禁用", value: String(stats.total - stats.enabled), sub: stats.total - stats.enabled > 0 ? "点击卡片可重新启用" : "全部监控运行中", icon: Eye, gradient: "from-fuchsia-500 to-purple-500" },
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

  const [cardStats, setCardStats] = useState<Record<string, { ok: boolean; uptime: number | null }>>({});
  const onStats = useCallback((id: string, s: { ok: boolean; uptime: number | null }) => {
    setCardStats((prev) => (prev[id] && prev[id].ok === s.ok && prev[id].uptime === s.uptime ? prev : { ...prev, [id]: s }));
  }, []);

  const overview = useMemo(() => {
    const list = monitors ?? [];
    const entries = Object.values(cardStats);
    return {
      total: list.length,
      enabled: list.filter((m) => m.isEnabled).length,
      ok: entries.filter((e) => e.ok).length,
      failing: entries.filter((e) => !e.ok).length,
      avgUptime: entries.length > 0 ? Math.round((entries.reduce((a, e) => a + (e.uptime ?? 0), 0) / entries.length) * 10) / 10 : null,
    };
  }, [monitors, cardStats]);

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

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-500 text-primary-foreground shadow-lg shadow-primary/25">
            <Eye className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("monitors.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("monitors.desc")}</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shadow-sm">
          <Plus className="mr-2 size-4" />{t("monitors.createMonitor")}
        </Button>
      </div>

      {monitors && monitors.length > 0 && <OverviewStats stats={overview} />}

      {monitors && monitors.length === 0 ? (
        <EmptyState icon={Eye} title={t("monitors.noMonitors")} description={t("monitors.noMonitorsDesc")} action={{ label: t("monitors.createMonitor"), onClick: () => setDialogOpen(true) }} />
      ) : (
        <div className="space-y-3">
          {monitors?.map((m) => (
            <MonitorCard key={m.id} monitor={m} wid={wid} expanded={expandedId === m.id} onToggle={() => toggleExpand(m.id)} onDelete={setDeleteTarget} onStats={onStats} t={t} />
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
              <select id="m-type" className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
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

function MonitorCard({ monitor, wid, expanded, onToggle, onDelete, onStats, t }: {
  monitor: MonitorTask;
  wid: string;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (m: { id: string; name: string }) => void;
  onStats: (id: string, s: { ok: boolean; uptime: number | null }) => void;
  t: (k: string) => string;
}) {
  const { data: results } = useProbeResults(wid, monitor.id);
  const info = uptimeOf(results);
  const lastResult = results?.[0];

  useEffect(() => {
    if (info) onStats(monitor.id, { ok: info.ok, uptime: info.uptime });
  }, [info?.ok, info?.uptime, monitor.id, onStats]);

  const Icon = TYPE_ICONS[monitor.type] ?? Activity;
  const style = TYPE_STYLES[monitor.type] ?? TYPE_STYLES.http;
  const uptimeColor = info?.uptime == null ? "text-muted-foreground" : info.uptime >= 99 ? "text-emerald-500" : info.uptime >= 95 ? "text-amber-500" : "text-red-500";

  return (
    <Card className={cn("group relative overflow-hidden border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5", !monitor.isEnabled && "opacity-80")}>
      <CardContent className="p-4">
        <div className="flex cursor-pointer items-center justify-between gap-3" onClick={onToggle}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", style.gradient)}>
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{monitor.name}</span>
                <Badge variant="outline" className={cn("text-[10px]", style.text)}>{monitor.type.toUpperCase()}</Badge>
                {!monitor.isEnabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("monitors.disabled")}</Badge>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {monitor.target} · {t("monitors.interval")}: {monitor.intervalSec}s · {t("monitors.timeout")}: {monitor.timeoutMs}ms
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {info && (
              <div className="hidden text-right sm:block">
                <p className={cn("text-sm font-semibold tabular-nums", uptimeColor)}>{info.uptime}%</p>
                <p className="text-[10px] text-muted-foreground">可用率</p>
              </div>
            )}
            {lastResult && (
              lastResult.isSuccess
                ? <span className="flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="size-4" />正常</span>
                : <span className="flex items-center gap-1 text-xs text-red-400"><XCircle className="size-4" />失败</span>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete({ id: monitor.id, name: monitor.name }); }} className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete monitor">
              <Trash2 className="size-3.5" />
            </button>
            {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-border/50 pt-4">
            <div className="grid gap-4 md:grid-cols-[1fr_240px]">
              <div>
                <h4 className="mb-2 text-sm font-medium">{t("monitors.lastResults")}</h4>
                {!results || results.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("monitors.noResults")}</p>
                ) : (
                  <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                    {results.slice(0, 10).map((r, i) => (
                      <div key={i} className="flex items-center gap-3 border-b border-border/30 py-1.5 text-xs last:border-0">
                        {r.isSuccess ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" /> : <XCircle className="size-3.5 shrink-0 text-red-400" />}
                        <span className="shrink-0 font-mono text-muted-foreground">{new Date(r.time).toLocaleTimeString()}</span>
                        {r.responseMs != null && (
                          <span className="flex shrink-0 items-center gap-1 font-mono font-medium"><Timer className="size-3 text-muted-foreground" />{r.responseMs}ms</span>
                        )}
                        {r.statusCode && <span className="shrink-0 font-mono text-muted-foreground">HTTP {r.statusCode}</span>}
                        {r.errorMsg && <span className="truncate text-red-400">{r.errorMsg}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border/50 bg-card/50 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>最近 20 次趋势</span>
                  {info?.avgMs != null && <span className="flex items-center gap-1"><Timer className="size-3" />均值 {info.avgMs}ms</span>}
                </div>
                <div className="mt-2">
                  <Sparkline data={(results ?? []).map((r) => r.isSuccess)} />
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}