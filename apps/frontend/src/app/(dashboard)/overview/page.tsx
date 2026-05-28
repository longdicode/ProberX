"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useDashboard, useAlertEvents } from "@/hooks/use-api";
import { useWebSocket } from "@/hooks/use-websocket";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Server, Eye, Bell, Cpu, Activity, HardDrive, ArrowUpRight, Plus, Wifi, WifiOff, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

export default function OverviewPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { current, setCurrent } = useWorkspaceStore();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const { data: dashboard, isLoading, error } = useDashboard(current?.id);
  const { data: recentAlerts } = useAlertEvents(current?.id);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const { state: wsState } = useWebSocket();

  useEffect(() => {
    if (!current && workspaces && workspaces.length > 0) {
      setCurrent(workspaces[0]);
    }
  }, [workspaces, current, setCurrent]);

  const handleCreateWorkspace = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const ws = await api.post<{ id: string; name: string; plan: string }>("/workspaces", { name: "My Workspace" });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setCurrent({ id: ws.id, name: ws.name, plan: ws.plan, settings: {} });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create workspace";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  if (wsLoading) return <PageSkeleton />;

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.overview")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.overviewDesc")}</p>
        </div>
        <EmptyState
          icon={HardDrive}
          title="Welcome to ProberX"
          description="Create your first workspace to start monitoring your servers."
          action={{ label: "Create workspace", href: "#" }}
        />
        <div className="flex flex-col items-center gap-3">
          <Button onClick={handleCreateWorkspace} disabled={creating}>
            <Plus className="w-4 h-4 mr-2" />
            {creating ? "Creating..." : "Create Workspace"}
          </Button>
          {createError && (
            <p className="text-sm text-red-500">{createError}</p>
          )}
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.overview")}</h1>
        </div>
        <EmptyState icon={Activity} title="Select a workspace" description="Choose a workspace to view its dashboard." />
      </div>
    );
  }

  if (isLoading) return <PageSkeleton />;

  if (error || !dashboard) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.overview")}</h1>
        </div>
        <EmptyState icon={Activity} title="Failed to load dashboard" description="Could not fetch dashboard data. Please try again." />
      </div>
    );
  }

  const stats = [
    { label: t("dashboard.totalServers"), value: String(dashboard.totalServers), icon: Server, change: dashboard.totalServers > 0 ? `${dashboard.totalServers} connected` : t("dashboard.noServersConnected") },
    { label: t("dashboard.activeMonitors"), value: String(dashboard.activeMonitors), icon: Eye, change: dashboard.activeMonitors > 0 ? `${dashboard.activeMonitors} active` : t("dashboard.noMonitorsConfigured") },
    { label: t("dashboard.alertsToday"), value: String(dashboard.alertsTotal), icon: Bell, change: dashboard.alertsTotal > 0 ? `${dashboard.alertsTotal} configured` : t("dashboard.noAlerts") },
    { label: t("dashboard.avgCpu"), value: dashboard.avgCpu > 0 ? `${dashboard.avgCpu.toFixed(1)}%` : "--", icon: Cpu, change: dashboard.avgCpu > 0 ? "Across all servers" : t("dashboard.noData") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.overview")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.overviewDesc")}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {wsState === "connected" ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{wsState === "connected" ? "Live" : wsState}</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, change }) => (
          <Card key={label} className="border-border/50 hover:border-border transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">{change}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4" /> {t("dashboard.recentActivity")}</CardTitle></CardHeader>
          <CardContent>
            {dashboard.recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{t("dashboard.noRecentActivity")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboard.recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${item.isOnline ? "bg-success" : "bg-muted-foreground"}`} />
                      <span className="text-sm">{item.serverName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.isOnline ? "Online" : "Offline"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {t("dashboard.recentAlerts")}</CardTitle></CardHeader>
          <CardContent>
            {!recentAlerts || recentAlerts.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{t("dashboard.noAlerts")}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentAlerts.slice(0, 5).map((a) => {
                  const sevColor: Record<string, string> = { warning: "text-yellow-400", critical: "text-red-400", emergency: "text-purple-400" };
                  return (
                    <div key={a.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className={`w-3 h-3 shrink-0 ${sevColor[a.severity] ?? "text-muted-foreground"}`} />
                          <span className="text-sm font-medium truncate">{a.ruleName ?? a.message}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5 ml-[18px]">{a.message}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {a.isResolved ? (
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                        ) : (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${a.severity === "critical" || a.severity === "emergency" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>{a.severity}</span>
                        )}
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-1">
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><HardDrive className="w-4 h-4" /> {t("dashboard.quickActions")}</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {[{ label: t("dashboard.addServer"), desc: t("dashboard.addServerDesc"), href: "/servers" },
              { label: t("dashboard.createMonitor"), desc: t("dashboard.createMonitorDesc"), href: "/monitors" },
              { label: t("dashboard.configureAlerts"), desc: t("dashboard.configureAlertsDesc"), href: "/alerts" },
            ].map(({ label, desc, href }) => (
              <a key={label} href={href} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group">
                <div><p className="text-sm font-medium group-hover:text-primary">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
