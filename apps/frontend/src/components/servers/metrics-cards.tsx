"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/stores/locale-store";
import { formatBytes } from "@/lib/utils";
import type { MetricSnapshot } from "@/hooks/use-api";
import { Cpu, MemoryStick, HardDrive, Network } from "lucide-react";

interface Props {
  merged: MetricSnapshot | null | undefined;
}

export function MetricsCards({ merged }: Props) {
  const { t } = useLocale();
  const cur = merged;

  const memUsage = cur?.memUsed && cur?.memTotal
    ? `${formatBytes(cur.memUsed)} / ${formatBytes(cur.memTotal)}`
    : "--";
  const diskUsage = cur?.diskUsed && cur?.diskTotal
    ? `${formatBytes(cur.diskUsed)} / ${formatBytes(cur.diskTotal)}`
    : "--";
  const netTraffic = cur
    ? `${formatBytes(cur.netInBytes ?? 0)} ↓ / ${formatBytes(cur.netOutBytes ?? 0)} ↑`
    : "--";

  const cards = [
    { label: t("servers.cpu"), value: cur?.cpuPercent ? `${cur.cpuPercent}%` : "--", icon: Cpu, sub: cur ? `${cur.cpuPercent ?? 0}%` : "--" },
    { label: t("servers.memory"), value: cur?.memUsed ? formatBytes(cur.memUsed) : "--", icon: MemoryStick, sub: memUsage },
    { label: t("servers.disk"), value: cur?.diskUsed ? formatBytes(cur.diskUsed) : "--", icon: HardDrive, sub: diskUsage },
    { label: t("servers.network"), value: cur?.netInBytes ? formatBytes(cur.netInBytes) : "--", icon: Network, sub: netTraffic },
    { label: t("servers.gpu"), value: cur?.gpuUtilPercent ? `${cur.gpuUtilPercent}%` : "--", icon: Cpu, sub: cur?.gpuTemp ? `${cur.gpuTemp}°C` : "--" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {cards.map(({ label, value, icon: Icon, sub }) => (
        <Card key={label} className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            <Icon className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
