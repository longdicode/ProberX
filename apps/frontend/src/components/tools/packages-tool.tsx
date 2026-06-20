"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function PackagesTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upgradableOnly, setUpgradableOnly] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const fetchPackages = useCallback(async () => {
    setLoading(true); setError("");
    try { setPackages((await api.get<any[]>(endpoint(`/tools/packages?upgradable=${upgradableOnly}`))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint, upgradableOnly]);

  useEffect(() => { fetchPackages(); }, [fetchPackages]);

  async function doUpgrade() {
    setUpgrading(true);
    try { await api.post(endpoint("/tools/packages")); toast.success(t("tools.upgradeComplete")); await fetchPackages(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setUpgrading(false); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3 items-center">
        <Button variant={upgradableOnly ? "default" : "outline"} size="sm" onClick={() => setUpgradableOnly(true)}>{t("tools.upgradable")}</Button>
        <Button variant={!upgradableOnly ? "default" : "outline"} size="sm" onClick={() => setUpgradableOnly(false)}>{t("tools.allPackages")}</Button>
        {upgradableOnly && <Button size="sm" variant="destructive" onClick={doUpgrade} disabled={upgrading}>{upgrading ? t("tools.upgrading") : t("tools.upgradeAll")}</Button>}
        <Button size="sm" variant="ghost" onClick={fetchPackages}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3">{t("tools.packageName")}</th>
                <th className="text-left p-3">{t("tools.packageVersion")}</th>
                {upgradableOnly && <th className="text-left p-3">New Version</th>}
              </tr></thead>
              <tbody>
                {packages.slice(0, 200).map((p, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{p.name}</td>
                    <td className="p-3 text-xs">{p.version || p.new_version}</td>
                    {upgradableOnly && <td className="p-3 text-xs font-mono">{p.new_version || "--"}</td>}
                  </tr>
                ))}
                {packages.length === 0 && <tr><td colSpan={3} className="text-center p-8 text-muted-foreground">No packages</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
