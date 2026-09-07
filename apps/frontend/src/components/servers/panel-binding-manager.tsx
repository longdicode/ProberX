"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useLocale } from "@/stores/locale-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Activity, CalendarClock, CircleAlert, Database, LayoutGrid, Link2, Pencil, PlugZap, Radar, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";

type PanelAdapter = "bt" | "aapanel";
type PanelStatus = "ok" | "error" | null;

interface PanelBinding {
  id: string;
  adapter: PanelAdapter;
  name: string | null;
  panelUrl: string;
  enabled: boolean;
  lastStatus: PanelStatus;
  errorMsg: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
}

interface SectionOk<T> { ok: true; data: T }
interface SectionErr { ok: false; error: string }
type Section<T> = SectionOk<T> | SectionErr;
type PanelSecurityState = "idle" | "scanning" | "done" | "unknown";

interface PanelOverview {
  system: Section<{ os: string; panelVersion: string; hostname: string; cpuPercent: number | null; memTotalBytes: number | null; memUsedBytes: number | null; reportedAt: string }>;
  sites: Section<{ total: number; list: { id: string; name: string; rootPath: string; enabled: boolean }[] }>;
  certificates: Section<{ total: number; expired: number; expiringSoon: number; list: { id: string; domains: string[]; issuer: string; expiresAt: string | null; daysLeft: number | null }[] }>;
  databases: Section<{ total: number; list: { name: string; engine: string; sizeBytes: number | null }[] }>;
  ftpUsers: Section<{ total: number; list: { username: string; homePath: string; enabled: boolean }[] }>;
  cronTasks: Section<{ total: number; running: number; list: { id: string; name: string; schedule: string; enabled: boolean }[] }>;
  securityScan: Section<{ state: PanelSecurityState; progressPercent: number | null; score: number | null; riskCount: number | null }>;
  network: Section<{ upRateKbps: number | null; downRateKbps: number | null; upTotalMb: number | null; downTotalMb: number | null; load1: number | null; load5: number | null; load15: number | null }>;
  checkedAt: string;
}

interface TestResult {
  ok: boolean;
  latencyMs: number;
  panelVersion?: string;
  os?: string;
  error?: string;
}

interface FormState {
  name: string;
  adapter: PanelAdapter;
  panelUrl: string;
  apiKey: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = { name: "", adapter: "bt", panelUrl: "", apiKey: "", enabled: true };

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  const gb = value / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(value / 1024 / 1024).toFixed(0)} MB`;
}

function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (value >= 1024) return `${(value / 1024).toFixed(2)} MB/s`;
  return `${value.toFixed(1)} KB/s`;
}

function formatMb(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  if (value >= 1024) return `${(value / 1024).toFixed(2)} GB`;
  return `${Math.round(value)} MB`;
}

function formatLoad(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

function SectionError({ message, title }: { message: string; title: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-foreground/80">{title}</p>
        <p className="mt-0.5">{message}</p>
      </div>
    </div>
  );
}

export function PanelBindingManager({ workspaceId, serverId }: { workspaceId: string; serverId: string }) {
  const { t } = useLocale();
  const [bindings, setBindings] = useState<PanelBinding[] | null>(null);
  const [overviews, setOverviews] = useState<Record<string, PanelOverview>>({});
  const [overviewLoading, setOverviewLoading] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PanelBinding | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PanelBinding | null>(null);

  const basePath = `/workspaces/${workspaceId}/servers/${serverId}/panel-bindings`;

  const load = useCallback(async () => {
    try {
      const rows = await api.get<PanelBinding[]>(basePath);
      setBindings(rows);
      return rows;
    } catch {
      setBindings([]);
      return [];
    }
  }, [basePath]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshOverview = useCallback(async (binding: PanelBinding, silent = false) => {
    setOverviewLoading(binding.id);
    try {
      const overview = await api.get<PanelOverview>(`${basePath}/${binding.id}/overview`);
      setOverviews((prev) => ({ ...prev, [binding.id]: overview }));
      setBindings((prev) => prev?.map((b) => (b.id === binding.id
        ? { ...b, lastStatus: overview.system.ok ? "ok" : "error", lastCheckedAt: overview.checkedAt, errorMsg: overview.system.ok ? null : (overview.system as SectionErr).error }
        : b)) ?? prev);
      return overview;
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : t("servers.panelOverviewFailed"));
      return null;
    } finally {
      setOverviewLoading(null);
    }
  }, [basePath, t]);

  // 初次加载后自动拉取一次概览
  useEffect(() => {
    if (!bindings || bindings.length === 0) return;
    const need = bindings.filter((b) => !overviews[b.id]);
    if (need.length === 0) return;
    need.forEach((b) => refreshOverview(b, true));
  }, [bindings, overviews, refreshOverview]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTestMsg(null);
    setDialogOpen(true);
  }

  function openEdit(binding: PanelBinding) {
    setEditing(binding);
    setForm({ name: binding.name ?? "", adapter: binding.adapter, panelUrl: binding.panelUrl, apiKey: "", enabled: binding.enabled });
    setTestMsg(null);
    setDialogOpen(true);
  }

  async function handleTest() {
    if (!form.panelUrl.trim()) {
      setTestMsg({ ok: false, text: t("servers.panelTestFail", { msg: t("servers.panelUrl") }) });
      return;
    }
    if (!editing && !form.apiKey.trim()) {
      setTestMsg({ ok: false, text: t("servers.panelTestFail", { msg: t("servers.panelApiKey") }) });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    try {
      const result = editing
        ? await api.post<TestResult>(`${basePath}/${editing.id}/test`, {})
        : await api.post<TestResult>(`${basePath}/test-candidate`, {
            adapter: form.adapter,
            panelUrl: form.panelUrl.trim(),
            apiKey: form.apiKey.trim(),
          });
      if (result.ok) {
        setTestMsg({ ok: true, text: t("servers.panelTestOk", { version: result.panelVersion || "--" }) });
      } else {
        setTestMsg({ ok: false, text: t("servers.panelTestFail", { msg: result.error || "--" }) });
      }
    } catch (err) {
      setTestMsg({ ok: false, text: err instanceof Error ? err.message : t("servers.panelTestFail", { msg: "--" }) });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!form.panelUrl.trim()) {
      toast.error(t("servers.panelSaveFailed"));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        adapter: form.adapter,
        name: form.name.trim() || undefined,
        panelUrl: form.panelUrl.trim(),
        enabled: form.enabled,
      };
      if (form.apiKey.trim()) {
        body.apiKey = form.apiKey.trim();
      } else if (editing) {
        body.clearApiKey = false;
      }
      if (editing) {
        await api.patch(`${basePath}/${editing.id}`, body);
      } else {
        await api.post(basePath, body);
      }
      toast.success(t("servers.panelSaved"));
      setDialogOpen(false);
      const rows = await load();
      if (rows.length) setOverviews({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.panelSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!deleteTarget) return;
    try {
      await api.delete(`${basePath}/${deleteTarget.id}`);
      toast.success(t("servers.panelRemoved"));
      setOverviews((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.panelSaveFailed"));
    } finally {
      setDeleteTarget(null);
    }
  }

  const securityBadge = (state: PanelSecurityState, progress: number | null) => {
    switch (state) {
      case "done":
        return <Badge variant="secondary">{t("servers.panelSecurityStateDone")}</Badge>;
      case "scanning":
        return <Badge variant="outline">{t("servers.panelSecurityStateScanning", { p: progress ?? 0 })}</Badge>;
      case "idle":
        return <Badge variant="outline">{t("servers.panelSecurityStateIdle")}</Badge>;
      default:
        return <Badge variant="outline">{t("servers.panelSecurityStateUnknown")}</Badge>;
    }
  };

  if (bindings === null) return <LoadingSkeleton />;

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardContent className="py-3 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <span>{t("servers.panelDesc")}</span>
        </CardContent>
      </Card>

      {bindings.length === 0 ? (
        <EmptyState
          icon={Link2}
          title={t("servers.panelNotBound")}
          description={t("servers.panelNotBoundDesc")}
          action={{ label: t("servers.panelAdd"), onClick: openCreate }}
        />
      ) : (
        bindings.map((binding) => {
          const overview = overviews[binding.id];
          const loading = overviewLoading === binding.id;
          const adapterLabel = binding.adapter === "bt" ? t("servers.panelAdapterBt") : t("servers.panelAdapterAaPanel");
          return (
            <Card key={binding.id} className="border-border/50">
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm">{binding.name || adapterLabel}</CardTitle>
                    <Badge variant="outline">{adapterLabel}</Badge>
                    {binding.lastStatus === "ok" && <Badge variant="secondary">{t("servers.panelStatusOk")}</Badge>}
                    {binding.lastStatus === "error" && <Badge variant="destructive">{t("servers.panelStatusError")}</Badge>}
                  </div>
                  <CardDescription className="text-xs break-all">{binding.panelUrl}</CardDescription>
                  <p className="text-xs text-muted-foreground">
                    {binding.lastCheckedAt
                      ? t("servers.panelLastChecked", { time: new Date(binding.lastCheckedAt).toLocaleString() })
                      : t("servers.panelNeverChecked")}
                  </p>
                  {binding.lastStatus === "error" && binding.errorMsg && (
                    <p className="text-xs text-destructive mt-1">{binding.errorMsg}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={loading} onClick={() => refreshOverview(binding)}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
                    {loading ? t("servers.panelRefreshing") : t("servers.panelRefresh")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(binding)} title={t("servers.panelEdit")}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget(binding)} title={t("servers.panelRemove")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><PlugZap className="w-3.5 h-3.5" />{t("servers.panelSystem")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.system.ok ? (
                      <>
                        <p><span className="text-muted-foreground">{t("servers.panelOs")}:</span> {overview.system.data.os}</p>
                        <p><span className="text-muted-foreground">{t("servers.panelVersion")}:</span> {overview.system.data.panelVersion || "--"}</p>
                        <p><span className="text-muted-foreground">{t("servers.panelCpu")}:</span> {overview.system.data.cpuPercent != null ? `${overview.system.data.cpuPercent.toFixed(1)}%` : "--"}</p>
                        <p>
                          <span className="text-muted-foreground">{t("servers.panelMemory")}:</span>{" "}
                          {overview.system.data.memUsedBytes != null
                            ? t("servers.panelMemoryUsed", {
                                used: formatBytes(overview.system.data.memUsedBytes),
                                total: formatBytes(overview.system.data.memTotalBytes),
                              })
                            : "--"}
                        </p>
                      </>
                    ) : (
                      <SectionError title={t("servers.panelSystem")} message={(overview?.system as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" />{t("servers.panelSites")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.sites.ok ? (
                      <>
                        <p className="text-lg font-medium">
                          {t("servers.panelSiteCount", { n: overview.sites.data.total })}
                          <span className="text-xs text-muted-foreground font-normal ml-2">
                            {t("servers.panelRunningSites", { n: overview.sites.data.list.filter((s) => s.enabled).length })}
                          </span>
                        </p>
                        {overview.sites.data.list.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("servers.panelSitesEmpty")}</p>
                        ) : (
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {overview.sites.data.list.slice(0, 20).map((site) => (
                              <div key={site.id || site.name} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">{site.name}</span>
                                {!site.enabled && <Badge variant="outline" className="shrink-0">stop</Badge>}
                              </div>
                            ))}
                            {overview.sites.data.total > 20 && (
                              <p className="text-xs text-muted-foreground">+{overview.sites.data.total - 20}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelSites")} message={(overview?.sites as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />{t("servers.panelCerts")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.certificates.ok ? (
                      <>
                        <p className="text-lg font-medium">{t("servers.panelCertCount", { n: overview.certificates.data.total })}</p>
                        {(overview.certificates.data.expired > 0 || overview.certificates.data.expiringSoon > 0) && (
                          <div className="flex gap-2 flex-wrap">
                            {overview.certificates.data.expired > 0 && (
                              <Badge variant="destructive">{t("servers.panelExpiredCerts", { n: overview.certificates.data.expired })}</Badge>
                            )}
                            {overview.certificates.data.expiringSoon > 0 && (
                              <Badge variant="outline">{t("servers.panelExpiringSoonCerts", { n: overview.certificates.data.expiringSoon })}</Badge>
                            )}
                          </div>
                        )}
                        {overview.certificates.data.list.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("servers.panelCertsEmpty")}</p>
                        ) : (
                          <div className="max-h-32 overflow-y-auto space-y-1.5">
                            {overview.certificates.data.list
                              .slice()
                              .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
                              .slice(0, 10)
                              .map((cert) => (
                                <div key={cert.id || cert.domains[0]} className="text-xs space-y-0.5">
                                  <p className={`truncate ${cert.daysLeft !== null && cert.daysLeft < 0 ? "text-destructive" : cert.daysLeft !== null && cert.daysLeft <= 30 ? "text-amber-500" : ""}`}>
                                    {cert.domains[0]}{cert.domains.length > 1 ? ` (+${cert.domains.length - 1})` : ""}
                                    {cert.daysLeft !== null && <span className="text-muted-foreground"> · {cert.daysLeft} d</span>}
                                  </p>
                                  {cert.expiresAt && <p className="text-muted-foreground">{new Date(cert.expiresAt).toLocaleDateString()}</p>}
                                </div>
                              ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelCerts")} message={(overview?.certificates as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />{t("servers.panelDatabases")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.databases.ok ? (
                      <>
                        <p className="text-lg font-medium">
                          {t("servers.panelDatabaseCount", { n: overview.databases.data.total })}
                          {overview.databases.data.list.some((db) => db.sizeBytes != null) && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">
                              {t("servers.panelDatabaseSize", {
                                size: formatBytes(overview.databases.data.list.reduce((acc, db) => acc + (db.sizeBytes ?? 0), 0)),
                              })}
                            </span>
                          )}
                        </p>
                        {overview.databases.data.list.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("servers.panelDatabaseEmpty")}</p>
                        ) : (
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {overview.databases.data.list.slice(0, 12).map((db) => (
                              <div key={db.name} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">{db.name}</span>
                                <span className="text-muted-foreground shrink-0">
                                  {db.sizeBytes != null ? formatBytes(db.sizeBytes) : (db.engine || "--")}
                                </span>
                              </div>
                            ))}
                            {overview.databases.data.total > 12 && (
                              <p className="text-xs text-muted-foreground">+{overview.databases.data.total - 12}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelDatabases")} message={(overview?.databases as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{t("servers.panelFtpUsers")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.ftpUsers.ok ? (
                      <>
                        <p className="text-lg font-medium">{t("servers.panelFtpUserCount", { n: overview.ftpUsers.data.total })}</p>
                        {overview.ftpUsers.data.list.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("servers.panelFtpUserEmpty")}</p>
                        ) : (
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {overview.ftpUsers.data.list.slice(0, 12).map((user) => (
                              <div key={user.username} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate" title={user.homePath || undefined}>{user.username}</span>
                                {!user.enabled && <Badge variant="outline" className="shrink-0">stop</Badge>}
                              </div>
                            ))}
                            {overview.ftpUsers.data.total > 12 && (
                              <p className="text-xs text-muted-foreground">+{overview.ftpUsers.data.total - 12}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelFtpUsers")} message={(overview?.ftpUsers as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />{t("servers.panelCronTasks")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.cronTasks.ok ? (
                      <>
                        <p className="text-lg font-medium">
                          {t("servers.panelCronTaskCount", { n: overview.cronTasks.data.total })}
                          <span className="text-xs text-muted-foreground font-normal ml-2">
                            {t("servers.panelCronEnabledTasks", { n: overview.cronTasks.data.running })}
                          </span>
                        </p>
                        {overview.cronTasks.data.list.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t("servers.panelCronTaskEmpty")}</p>
                        ) : (
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {overview.cronTasks.data.list.slice(0, 12).map((task) => (
                              <div key={task.id || task.name} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">{task.name}</span>
                                <span className="text-muted-foreground shrink-0">{task.schedule}</span>
                              </div>
                            ))}
                            {overview.cronTasks.data.total > 12 && (
                              <p className="text-xs text-muted-foreground">+{overview.cronTasks.data.total - 12}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelCronTasks")} message={(overview?.cronTasks as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" />{t("servers.panelSecurityScore")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.securityScan.ok ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          {securityBadge(overview.securityScan.data.state, overview.securityScan.data.progressPercent)}
                          {overview.securityScan.data.score != null && (
                            <span className={`text-lg font-medium ${overview.securityScan.data.score >= 80 ? "text-green-600" : overview.securityScan.data.score >= 60 ? "text-amber-500" : "text-destructive"}`}>
                              {overview.securityScan.data.score}
                            </span>
                          )}
                        </div>
                        {overview.securityScan.data.score != null && (
                          <p className="text-xs text-muted-foreground">
                            {t("servers.panelSecurityScoreLabel", { score: overview.securityScan.data.score })}
                          </p>
                        )}
                        {overview.securityScan.data.riskCount != null && (
                          overview.securityScan.data.riskCount > 0
                            ? <Badge variant="destructive">{t("servers.panelSecurityRisks", { n: overview.securityScan.data.riskCount })}</Badge>
                            : <Badge variant="secondary">{t("servers.panelSecurityNoRisks")}</Badge>
                        )}
                        {overview.securityScan.data.score == null
                          && (overview.securityScan.data.state === "idle" || overview.securityScan.data.state === "unknown") && (
                          <p className="text-xs text-muted-foreground">{t("servers.panelSecurityEmpty")}</p>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelSecurityScore")} message={(overview?.securityScan as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" />{t("servers.panelNetwork")}</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1.5">
                    {overview?.network.ok ? (
                      <>
                        <p className="text-green-600">{t("servers.panelNetworkUp", { rate: formatRate(overview.network.data.upRateKbps) })}</p>
                        <p>{t("servers.panelNetworkDown", { rate: formatRate(overview.network.data.downRateKbps) })}</p>
                        {(overview.network.data.upTotalMb != null || overview.network.data.downTotalMb != null) && (
                          <p className="text-xs text-muted-foreground">
                            {t("servers.panelNetworkTotal", {
                              up: formatMb(overview.network.data.upTotalMb),
                              down: formatMb(overview.network.data.downTotalMb),
                            })}
                          </p>
                        )}
                        {(overview.network.data.load1 != null || overview.network.data.load5 != null || overview.network.data.load15 != null) && (
                          <p className="text-xs text-muted-foreground">
                            {t("servers.panelNetworkLoad", {
                              l1: formatLoad(overview.network.data.load1),
                              l5: formatLoad(overview.network.data.load5),
                              l15: formatLoad(overview.network.data.load15),
                            })}
                          </p>
                        )}
                      </>
                    ) : (
                      <SectionError title={t("servers.panelNetwork")} message={(overview?.network as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("servers.panelEdit") : t("servers.panelAdd")}</DialogTitle>
            <DialogDescription>{t("servers.panelLinkNote")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("servers.panelName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("servers.panelNamePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("servers.panelAdapter")}</Label>
                <Select value={form.adapter} onValueChange={(v) => setForm({ ...form, adapter: (v || "bt") as PanelAdapter })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bt">{t("servers.panelAdapterBt")}</SelectItem>
                    <SelectItem value="aapanel">{t("servers.panelAdapterAaPanel")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-0.5">
                <div className="flex items-center gap-2">
                  <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
                  <span className="text-sm">{t("servers.panelEnabled")}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("servers.panelUrl")}</Label>
              <Input value={form.panelUrl} onChange={(e) => setForm({ ...form, panelUrl: e.target.value })} placeholder={t("servers.panelUrlPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("servers.panelApiKey")}</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={editing?.apiKeyHint ? t("servers.panelApiKeyHint", { hint: editing.apiKeyHint }) : t("servers.panelApiKeyPlaceholder")}
              />
              {editing?.apiKeyHint && !form.apiKey && (
                <p className="text-xs text-muted-foreground">{t("servers.panelApiKeyHint", { hint: editing.apiKeyHint })}</p>
              )}
            </div>
            {testMsg && (
              <p className={`text-xs ${testMsg.ok ? "text-green-600" : "text-destructive"}`}>{testMsg.text}</p>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="outline" disabled={testing} onClick={handleTest}>
              <PlugZap className="w-3.5 h-3.5 mr-1.5" />
              {testing ? t("servers.panelTesting") : t("servers.panelTest")}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={handleSave} disabled={saving || !form.panelUrl.trim()}>
                {saving ? t("servers.panelSaving") : t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t("servers.panelRemove")}
        description={t("servers.panelRemoveDesc")}
        confirmLabel={t("servers.panelRemove")}
        onConfirm={handleRemove}
        variant="destructive"
      />
    </div>
  );
}
