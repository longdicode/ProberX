"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/stores/locale-store";
import { api } from "@/lib/api-client";

interface Process {
  pid: number;
  name: string;
  cpu_percent: number;
  mem_mb: number;
}

interface Props {
  workspaceId: string;
  serverId: string;
}

export function ProcessList({ workspaceId, serverId }: Props) {
  const { t } = useLocale();
  const [processes, setProcesses] = useState<Process[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const res = await api.get<Process[]>(`/workspaces/${workspaceId}/servers/${serverId}/processes`);
      setProcesses(res);
    } catch { setProcesses([]); }
    finally { setLoading(false); }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{t("servers.processes")}</CardTitle>
        <Button variant="outline" size="sm" disabled={loading} onClick={fetchProcesses}>
          {loading ? "Loading..." : t("servers.refresh")}
        </Button>
      </CardHeader>
      <CardContent>
        {!processes ? (
          <div className="py-8 text-center text-muted-foreground text-sm">{t("servers.clickToLoadProcesses")}</div>
        ) : processes.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">{t("servers.noProcesses")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 font-medium text-muted-foreground">PID</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">{t("servers.processName")}</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">CPU %</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">{t("servers.memory")}</th>
                </tr>
              </thead>
              <tbody>
                {processes.map((p) => (
                  <tr key={p.pid} className="border-b border-border/30 last:border-0">
                    <td className="py-2 font-mono text-xs">{p.pid}</td>
                    <td className="py-2 truncate max-w-[200px]">{p.name}</td>
                    <td className="py-2 text-right font-mono text-xs">{p.cpu_percent.toFixed(1)}</td>
                    <td className="py-2 text-right font-mono text-xs">{p.mem_mb.toFixed(1)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
