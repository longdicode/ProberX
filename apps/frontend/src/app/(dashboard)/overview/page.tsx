"use client";

import { useLocale } from "@/stores/locale-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Bell, CheckCircle2, Clock, HardDrive, ArrowUpRight, Plus, Maximize, Minimize, Server, ShieldAlert, Sparkles } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

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

  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  return (
    <div className="relative space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/80 to-indigo-500 text-primary-foreground shadow-lg shadow-primary/25">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{greeting}，欢迎回来</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.overviewDesc")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", wsState === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border bg-muted text-muted-foreground")}>
            {wsState === "connected" ? <Activity className="size-3.5 animate-pulse" /> : <ShieldAlert className="size-3.5" />}
            <span>{wsState === "connected" ? "Live" : wsState}</span>
          </div>
          <Button variant="outline" size="icon" className="size-8" onClick={toggleFullscreen} title="全屏">
            {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <StatsCards dashboard={dashboard} />

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Alert Trends */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Bell className="size-4 text-primary" />
              {t("dashboard.alertTrends")}
            </CardTitle>
            <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTrendRange(opt.value)}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", trendRange === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {!alertTrends || alertTrends.length === 0 ? (
              <div className="flex h-[230px] items-center justify-center text-sm text-muted-foreground">{t("dashboard.noAlerts")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradCritical" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradWarning" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" name="Total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradCount)" />
                  <Area type="monotone" dataKey="critical" name={t("dashboard.critical")} stroke="hsl(0, 84%, 60%)" strokeWidth={1.5} fill="url(#gradCritical)" />
                  <Area type="monotone" dataKey="warning" name={t("dashboard.warning")} stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} fill="url(#gradWarning)" />
                  <Area type="monotone" dataKey="resolved" name={t("dashboard.resolved")} stroke="hsl(142, 71%, 45%)" strokeWidth={1.5} fill="url(#gradResolved)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Server Comparison */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Server className="size-4 text-primary" />
              {t("dashboard.serverComparison")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!serverComp || serverComp.length === 0 ? (
              <div className="flex h-[230px] items-center justify-center text-sm text-muted-foreground">{t("dashboard.noData")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={serverComp} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="cpu" name="CPU" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="memory" name={t("servers.memory")} fill="hsl(38, 92%, 50%)" radius={[6, 6, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="disk" name={t("servers.disk")} fill="hsl(262, 83%, 58%)" radius={[6, 6, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Alerts */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bell className="size-4 text-primary" />
            {t("dashboard.recentAlerts")}
          </CardTitle>
          <a href="/alerts" className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">
            查看全部
            <ArrowUpRight className="size-3" />
          </a>
        </CardHeader>
        <CardContent>
          {!recentAlerts || recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <CheckCircle2 className="size-6 text-muted-foreground/40" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{t("dashboard.noAlerts")}</p>
            </div>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {recentAlerts.slice(0, 6).map((a) => {
                const sevColor: Record<string, string> = { warning: "text-yellow-500", critical: "text-red-500", emergency: "text-purple-500" };
                const sevBadge: Record<string, string> = { warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", critical: "bg-red-500/10 text-red-500 border-red-500/20", emergency: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
                return (
                  <div key={a.id} className="rounded-xl border border-border/60 bg-card/50 p-3 transition-colors hover:border-primary/30 hover:bg-accent/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("size-1.5 shrink-0 rounded-full", a.isResolved ? "bg-emerald-500" : sevColor[a.severity] ?? "bg-muted-foreground")} />
                          <span className="truncate text-sm font-medium">{a.ruleName ?? a.message}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{a.message}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {a.isResolved ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : (
                          <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize", sevBadge[a.severity] ?? "border-border text-muted-foreground")}>{a.severity}</span>
                        )}
                        <Clock className="size-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t("dashboard.addServer"), desc: t("dashboard.addServerDesc"), href: "/servers", icon: HardDrive },
          { label: t("dashboard.createMonitor"), desc: t("dashboard.createMonitorDesc"), href: "/monitors", icon: Activity },
          { label: t("dashboard.configureAlerts"), desc: t("dashboard.configureAlertsDesc"), href: "/alerts", icon: Bell },
        ].map(({ label, desc, href, icon: Icon }) => (
          <a key={label} href={href} className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
            <div aria-hidden className="absolute -right-6 -top-6 size-20 rounded-full bg-gradient-to-br from-primary/15 to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative flex items-center justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-4" />
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="relative mt-3 text-sm font-medium">{label}</p>
            <p className="relative mt-0.5 text-xs text-muted-foreground">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
