"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/stores/locale-store";
import type { DashboardStats } from "@/hooks/use-api";
import { Server, Eye, Bell, Cpu, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  value: string;
  icon: LucideIcon;
  change: string;
  gradient: string;
  glow: string;
}

interface Props {
  dashboard: DashboardStats;
}

export function StatsCards({ dashboard }: Props) {
  const { t } = useLocale();

  const stats: StatItem[] = [
    {
      label: t("dashboard.totalServers"),
      value: String(dashboard.totalServers),
      icon: Server,
      change: dashboard.totalServers > 0 ? `${dashboard.totalServers} 台已连接` : t("dashboard.noServersConnected"),
      gradient: "from-indigo-500 to-blue-500",
      glow: "shadow-indigo-500/30",
    },
    {
      label: t("dashboard.activeMonitors"),
      value: String(dashboard.activeMonitors),
      icon: Eye,
      change: dashboard.activeMonitors > 0 ? `${dashboard.activeMonitors} 个运行中` : t("dashboard.noMonitorsConfigured"),
      gradient: "from-emerald-500 to-teal-500",
      glow: "shadow-emerald-500/30",
    },
    {
      label: t("dashboard.alertsToday"),
      value: String(dashboard.alertsTotal),
      icon: Bell,
      change: dashboard.alertsTotal > 0 ? `${dashboard.alertsTotal} 条告警` : t("dashboard.noAlerts"),
      gradient: "from-amber-500 to-orange-500",
      glow: "shadow-amber-500/30",
    },
    {
      label: t("dashboard.avgCpu"),
      value: dashboard.avgCpu > 0 ? `${dashboard.avgCpu.toFixed(1)}%` : "--",
      icon: Cpu,
      change: dashboard.avgCpu > 0 ? "全部服务器平均" : t("dashboard.noData"),
      gradient: "from-fuchsia-500 to-purple-500",
      glow: "shadow-fuchsia-500/30",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, change, gradient, glow }) => (
        <Card
          key={label}
          className="group relative overflow-hidden border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
        >
          <div
            aria-hidden
            className="absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br from-primary/10 to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
          />
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight">{value}</p>
              </div>
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-200 group-hover:scale-110", gradient, glow)}>
                <Icon className="size-4" />
              </div>
            </div>
            <p className="mt-2.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <TrendingUp className="size-3" />
              {change}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
