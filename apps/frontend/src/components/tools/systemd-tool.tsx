"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Play, Square, RotateCcw } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function SystemdTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const fetchServices = useCallback(async () => {
    setLoading(true); setError("");
    try { setServices((await api.get<any[]>(endpoint("/tools/services"))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  async function control(name: string, action: string) {
    try {
      await api.post(endpoint("/tools/services"), { name, action });
      toast.success(`${action} ${name}: ok`);
      await fetchServices();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const filtered = services.filter((s) =>
    !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || (s.description || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : (
        <div className="space-y-3">
          <Input placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3">{t("tools.serviceName")}</th>
                  <th className="text-left p-3">{t("tools.state")}</th>
                  <th className="text-left p-3">{t("tools.description")}</th>
                  <th className="text-right p-3">{t("tools.serviceControl")}</th>
                </tr></thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.name} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{s.name}</td>
                      <td className="p-3"><Badge variant={s.active_state === "active" ? "default" : s.active_state === "failed" ? "destructive" : "secondary"} className="text-xs">{s.active_state}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{s.description || "--"}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          {s.active_state === "active" ? (
                            <><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => control(s.name, "stop")}><Square className="w-3 h-3 mr-1"/>{t("tools.stopService")}</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => control(s.name, "restart")}><RotateCcw className="w-3 h-3 mr-1"/>{t("tools.restartService")}</Button></>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => control(s.name, "start")}><Play className="w-3 h-3 mr-1"/>{t("tools.startService")}</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={4} className="text-center p-8 text-muted-foreground">No services</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
