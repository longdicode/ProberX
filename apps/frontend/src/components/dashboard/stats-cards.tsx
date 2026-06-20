"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/stores/locale-store";
import type { DashboardStats } from "@/hooks/use-api";
import { Server, Eye, Bell, Cpu } from "lucide-react";

interface StatItem {
  label: string;
  value: string;
  icon: typeof Server;
  change: string;
}

interface Props {
  dashboard: DashboardStats;
}

export function StatsCards({ dashboard }: Props) {
  const { t } = useLocale();

  const stats: StatItem[] = [
    { label: t("dashboard.totalServers"), value: String(dashboard.totalServers), icon: Server, change: dashboard.totalServers > 0 ? `${dashboard.totalServers} connected` : t("dashboard.noServersConnected") },
    { label: t("dashboard.activeMonitors"), value: String(dashboard.activeMonitors), icon: Eye, change: dashboard.activeMonitors > 0 ? `${dashboard.activeMonitors} active` : t("dashboard.noMonitorsConfigured") },
    { label: t("dashboard.alertsToday"), value: String(dashboard.alertsTotal), icon: Bell, change: dashboard.alertsTotal > 0 ? `${dashboard.alertsTotal} configured` : t("dashboard.noAlerts") },
    { label: t("dashboard.avgCpu"), value: dashboard.avgCpu > 0 ? `${dashboard.avgCpu.toFixed(1)}%` : "--", icon: Cpu, change: dashboard.avgCpu > 0 ? "Across all servers" : t("dashboard.noData") },
  ];

  return (
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
  );
}
