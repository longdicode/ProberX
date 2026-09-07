"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useLocale } from "@/stores/locale-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PanelBindingManager } from "@/components/servers/panel-binding-manager";
import {
  Activity,
  CalendarClock,
  CircleAlert,
  Database,
  Gauge,
  LayoutGrid,
  PlugZap,
  Radar,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";

interface SectionOk<T> { ok: true; data: T }
interface SectionErr { ok: false; error: string }
type Section<T> = SectionOk<T> | SectionErr;
type SecurityState = "idle" | "scanning" | "done" | "unknown";

interface ResourceOverview {
  system: Section<{ os: string; panelVersion: string; hostname: string; cpuPercent: number | null; memTotalBytes: number | null; memUsedBytes: number | null; reportedAt: string }>;
  sites: Section<{ total: number; list: { id: string; name: string; rootPath: string; enabled: boolean }[] }>;
  certificates: Section<{ total: number; expired: number; expiringSoon: number; list: { id: string; domains: string[]; issuer: string; expiresAt: string | null; daysLeft: number | null }[] }>;
  databases: Section<{ total: number; list: { name: string; engine: string; sizeBytes: number | null }[] }>;
  cronTasks: Section<{ total: number; running: number; list: { id: string; name: string; schedule: string; enabled: boolean }[] }>;
  services: Section<{ total: number; running: number; failed: number; list: { name: string; description: string; active: boolean; failed: boolean }[] }>;
  securityScan: Section<{ state: SecurityState; progressPercent: number | null; score: number | null; riskCount: number | null }>;
  network: Section<{ upRateKbps: number | null; downRateKbps: number | null; upTotalMb: number | null; downTotalMb: number | null; load1: number | null; load5: number | null; load15: number | null }>;
  checkedAt: string;
}

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

export function ResourceOverviewManager({ workspaceId, serverId }: { workspaceId: string; serverId: string }) {
  const { t } = useLocale();
  const [overview, setOverview] = useState<ResourceOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPanelLink, setShowPanelLink] = useState(false);

  const load = useCallback(async (silent = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<ResourceOverview>(
        `/workspaces/${workspaceId}/servers/${serverId}/resource-overview`,
      );
      setOverview(data);
      return data;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("servers.resourcesFetchFailed"));
      if (!silent) toast.error(err instanceof Error ? err.message : t("servers.resourcesFetchFailed"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [workspaceId, serverId, t]);

  useEffect(() => {
    load(true);
  }, [load]);

  const securityBadge = (state: SecurityState, progress: number | null) => {
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

  if (loadError && !overview) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Server}
          title={t("servers.resourcesFetchFailed")}
          description={loadError}
          action={{ label: t("servers.resourcesRetry"), onClick: () => load() }}
        />
      </div>
    );
  }

  if (!overview) return <LoadingSkeleton />;

  const sectionErr = (section: Section<unknown> | undefined, title: string) =>
    <SectionError title={title} message={(section as SectionErr | undefined)?.error ?? t("servers.panelNeverChecked")} />;

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
            <span>{t("servers.resourcesDesc")}</span>
          </p>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs shrink-0" disabled={loading} onClick={() => load()}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            {loading ? t("servers.panelRefreshing") : t("servers.panelRefresh")}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {overview.checkedAt
          ? t("servers.panelLastChecked", { time: new Date(overview.checkedAt).toLocaleString() })
          : t("servers.panelNeverChecked")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" />{t("servers.panelSystem")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.system.ok ? (
              <>
                <p className="truncate"><span className="text-muted-foreground">{t("servers.panelOs")}:</span> {overview.system.data.os}</p>
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
            ) : sectionErr(overview.system, t("servers.panelSystem"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" />{t("servers.panelSites")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.sites.ok ? (
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
                    {overview.sites.data.list.slice(0, 14).map((site) => (
                      <div key={site.id || site.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{site.name}</span>
                        {!site.enabled && <Badge variant="outline" className="shrink-0">stop</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : sectionErr(overview.sites, t("servers.panelSites"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />{t("servers.panelCerts")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.certificates.ok ? (
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
                    {overview.certificates.data.list.slice().sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)).slice(0, 8).map((cert) => (
                      <div key={cert.id || cert.domains[0]} className="text-xs space-y-0.5">
                        <p className={`truncate ${cert.daysLeft !== null && cert.daysLeft < 0 ? "text-destructive" : cert.daysLeft !== null && cert.daysLeft <= 30 ? "text-amber-500" : ""}`}>
                          {cert.domains[0]}{cert.domains.length > 1 ? ` (+${cert.domains.length - 1})` : ""}
                          {cert.daysLeft !== null && <span className="text-muted-foreground"> · {cert.daysLeft} d</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : sectionErr(overview.certificates, t("servers.panelCerts"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />{t("servers.panelDatabases")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.databases.ok ? (
              <>
                <p className="text-lg font-medium">{t("servers.panelDatabaseCount", { n: overview.databases.data.total })}</p>
                {overview.databases.data.list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("servers.panelDatabaseEmpty")}</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {overview.databases.data.list.slice(0, 14).map((db) => (
                      <div key={db.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{db.name}</span>
                        <span className="text-muted-foreground shrink-0">{db.engine || "--"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : sectionErr(overview.databases, t("servers.panelDatabases"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" />{t("servers.panelCronTasks")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.cronTasks.ok ? (
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
                    {overview.cronTasks.data.list.slice(0, 10).map((task) => (
                      <div key={task.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" title={task.name}>{task.name}</span>
                        <span className="text-muted-foreground shrink-0">{task.schedule}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : sectionErr(overview.cronTasks, t("servers.panelCronTasks"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Server className="w-3.5 h-3.5" />{t("servers.panelServices")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.services.ok ? (
              <>
                <p className="text-lg font-medium">
                  {t("servers.panelServiceCount", { n: overview.services.data.total })}
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    {t("servers.panelServiceRunning", { n: overview.services.data.running })}
                  </span>
                  {overview.services.data.failed > 0 && (
                    <span className="text-xs text-destructive font-normal ml-2">
                      {t("servers.panelServiceFailed", { n: overview.services.data.failed })}
                    </span>
                  )}
                </p>
                {overview.services.data.list.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("servers.panelServicesEmpty")}</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {overview.services.data.list.slice(0, 12).map((svc) => (
                      <div key={svc.name} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate" title={svc.description || svc.name}>{svc.name}</span>
                        <span className={`shrink-0 ${svc.failed ? "text-destructive" : svc.active ? "text-green-600" : "text-muted-foreground"}`}>
                          {svc.failed
                            ? t("servers.panelServiceFailedLabel")
                            : svc.active
                              ? t("servers.panelServiceRunningLabel")
                              : t("servers.panelServiceInactiveLabel")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : sectionErr(overview.services, t("servers.panelServices"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" />{t("servers.panelSecurityBaseline")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.securityScan.ok ? (
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
              </>
            ) : sectionErr(overview.securityScan, t("servers.panelSecurityBaseline"))}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" />{t("servers.panelNetwork")}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            {overview.network.ok ? (
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
            ) : sectionErr(overview.network, t("servers.panelNetwork"))}
          </CardContent>
        </Card>
      </div>

      <div className="pt-2 border-t">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowPanelLink((v) => !v)}>
          <PlugZap className="w-3.5 h-3.5 mr-1" />
          {showPanelLink ? t("servers.resourcesCollapsePanel") : t("servers.resourcesOptionalPanel")}
        </Button>
        {showPanelLink && (
          <div className="mt-4">
            <PanelBindingManager workspaceId={workspaceId} serverId={serverId} />
          </div>
        )}
      </div>
    </div>
  );
}
