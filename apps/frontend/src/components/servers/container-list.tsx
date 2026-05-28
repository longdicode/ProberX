"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, ApiError } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";
import { RotateCw, Container } from "lucide-react";

interface PortMapping {
  ip: string;
  private_port: number;
  public_port: number;
  type: string;
}

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: PortMapping[];
  cpu_percent: number;
  mem_usage: number;
  mem_limit: number;
  mem_percent: number;
  created: number;
}

export function ContainerList({ serverId }: { serverId: string }) {
  const { t } = useLocale();
  const wid = useWorkspaceStore((s) => s.current?.id);
  const [containers, setContainers] = useState<ContainerInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "running">("all");

  const fetchContainers = async () => {
    if (!wid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ContainerInfo[]>(`/workspaces/${wid}/servers/${serverId}/containers`);
      setContainers(res);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("servers.containersLoadFailed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContainers(); }, [wid, serverId]);

  const filtered = useMemo(() => {
    if (!containers) return [];
    return filter === "running" ? containers.filter((c) => c.state === "running") : containers;
  }, [containers, filter]);

  const stateColors: Record<string, string> = {
    running: "bg-green-500",
    paused: "bg-yellow-500",
    restarting: "bg-yellow-500",
    exited: "bg-gray-400",
    dead: "bg-gray-500",
    removing: "bg-gray-400",
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm">{t("servers.containers")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm">{t("servers.containers")}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchContainers}>
            <RotateCw className="w-3 h-3 mr-1" />{t("servers.refresh")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!containers || containers.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm">{t("servers.containers")}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          <Container className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>{t("servers.containersNoContainers")}</p>
          <p className="text-xs mt-1">{t("servers.containersNoContainersDesc")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{t("servers.containers")}</CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 text-xs transition-colors ${filter === "all" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("servers.containersFilterAll")} ({containers.length})
            </button>
            <button
              onClick={() => setFilter("running")}
              className={`px-2.5 py-1 text-xs border-l border-border transition-colors ${filter === "running" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("servers.containersFilterRunning")} ({containers.filter((c) => c.state === "running").length})
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchContainers}>
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 font-medium text-muted-foreground">{t("servers.containersStatus")}</th>
                <th className="text-left py-2 font-medium text-muted-foreground">{t("monitors.name")}</th>
                <th className="text-left py-2 font-medium text-muted-foreground hidden md:table-cell">{t("servers.containersImage")}</th>
                <th className="text-left py-2 font-medium text-muted-foreground hidden lg:table-cell">{t("servers.containersPorts")}</th>
                <th className="text-right py-2 font-medium text-muted-foreground">{t("servers.containersCpu")}</th>
                <th className="text-right py-2 font-medium text-muted-foreground">{t("servers.containersMemory")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${stateColors[c.state] ?? "bg-gray-400"}`} />
                      <span className="text-xs">{c.status}</span>
                    </div>
                  </td>
                  <td className="py-2.5 font-medium truncate max-w-[150px]">{c.name || c.id}</td>
                  <td className="py-2.5 text-xs text-muted-foreground truncate max-w-[180px] hidden md:table-cell">{c.image}</td>
                  <td className="py-2.5 text-xs font-mono text-muted-foreground hidden lg:table-cell">
                    {c.ports.length === 0
                      ? "--"
                      : c.ports.map((p) => (p.public_port ? `${p.public_port}:${p.private_port}` : `${p.private_port}`)).join(", ")}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-xs w-12 text-right">{c.cpu_percent.toFixed(1)}%</span>
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                        <div
                          className="h-full bg-chart-1 rounded-full transition-all"
                          style={{ width: `${Math.min(c.cpu_percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-xs whitespace-nowrap">
                        {formatBytes(c.mem_usage)}
                      </span>
                      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden hidden sm:block">
                        <div
                          className="h-full bg-chart-2 rounded-full transition-all"
                          style={{ width: `${Math.min(c.mem_percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && filter === "running" && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <p>{t("servers.noProcesses")}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
