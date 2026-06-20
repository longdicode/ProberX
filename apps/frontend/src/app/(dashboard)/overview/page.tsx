"use client";

import { useLocale } from "@/stores/locale-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Bell, AlertTriangle, CheckCircle2, Clock, HardDrive, ArrowUpRight, Plus, Wifi, WifiOff, Maximize, Minimize } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const RANGE_OPTIONS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
] as const;

export default function OverviewPage() {
  const { t } = useLocale();
  const { state: wsState } = useWebSocket();
  const {
    current,
    workspaces,
    wsLoading,
    dashboard,
    isLoading,
    error,
    recentAlerts,
    alertTrends,
    serverComp,
    creating,
    createError,
    trendRange,
    setTrendRange,
    isFullscreen,
    toggleFullscreen,
    handleCreateWorkspace,
  } = useDashboardData();

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

  const trendData = (alertTrends || []).map((p: any) => ({
    ...p,
    period: new Date(p.period).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.overview")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.overviewDesc")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {wsState === "connected" ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{wsState === "connected" ? "Live" : wsState}</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <StatsCards dashboard={dashboard} />

      {/* Alert Trends Chart */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">{t("dashboard.alertTrends")}</CardTitle>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <Button key={opt.value} size="sm" variant={trendRange === opt.value ? "default" : "outline"} className="h-7 text-xs px-2.5" onClick={() => setTrendRange(opt.value)}>
                {opt.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {!alertTrends || alertTrends.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">{t("dashboard.noAlerts")}</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" name="Total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="critical" name={t("dashboard.critical")} stroke="hsl(0,84%,60%)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="warning" name={t("dashboard.warning")} stroke="hsl(38,92%,50%)" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="resolved" name={t("dashboard.resolved")} stroke="hsl(142,71%,45%)" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Server Comparison & Alerts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Server Comparison Chart */}
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm font-medium">{t("dashboard.serverComparison")}</CardTitle></CardHeader>
          <CardContent>
            {!serverComp || serverComp.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">{t("dashboard.noData")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serverComp}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cpu" name="CPU" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="memory" name={t("servers.memory")} fill="hsl(38,92%,50%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="disk" name={t("servers.disk")} fill="hsl(262,83%,58%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
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

      {/* Quick Actions */}
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
