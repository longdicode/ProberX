"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Database, Trash2, RefreshCw } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function DatabasesTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installOpen, setInstallOpen] = useState(false);
  const [installForm, setInstallForm] = useState({ type: "mysql", version: "", port: "", password: "" });
  const [installLoading, setInstallLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchDatabases = useCallback(async () => {
    setLoading(true); setError("");
    try { setDatabases((await api.get<any[]>(endpoint("/tools/databases"))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { fetchDatabases(); }, [fetchDatabases]);

  async function doInstall() {
    if (!installForm.type || !installForm.port) return;
    setInstallLoading(true);
    try {
      await api.post(endpoint("/tools/databases"), {
        type: installForm.type,
        version: installForm.version || undefined,
        port: installForm.port,
        password: installForm.password || undefined,
      });
      toast.success(t("tools.databaseInstallSuccess", { type: installForm.type }));
      setInstallOpen(false);
      setInstallForm({ type: "mysql", version: "", port: "", password: "" });
      await fetchDatabases();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setInstallLoading(false); }
  }

  async function doRemove() {
    if (!deleteTarget) return;
    const dbType = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete(endpoint("/tools/databases"), { type: dbType });
      toast.success(t("tools.databaseRemoveSuccess", { type: dbType }));
      await fetchDatabases();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  const dbIcons: Record<string, string> = { mysql: "MySQL", postgresql: "PostgreSQL", redis: "Redis", mongodb: "MongoDB" };

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={fetchDatabases}><RefreshCw className="w-4 h-4 mr-1" />{t("tools.refresh")}</Button>
        <Button size="sm" onClick={() => setInstallOpen(true)}>{t("tools.installDatabase")}</Button>
      </div>
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : databases.length === 0 ? (
        <EmptyState icon={Database} title={t("tools.noDatabases")} description="" action={{ label: t("tools.installDatabase"), onClick: () => setInstallOpen(true) }} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {databases.map((db) => (
            <Card key={db.name}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{dbIcons[db.type] || db.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={db.status === "running" ? "default" : "destructive"} className="text-xs">{db.status}</Badge>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setDeleteTarget(db.type)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>{t("tools.databaseVersion")}</span><span className="font-mono">{db.version || "--"}</span></div>
                  <div className="flex justify-between"><span>{t("tools.databasePort")}</span><span className="font-mono">{db.port || "--"}</span></div>
                  <div className="flex justify-between"><span>{t("tools.container")}</span><span className="font-mono">{db.container}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tools.installDatabase")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.databaseType")}</label>
              <Select value={installForm.type} onValueChange={(v) => setInstallForm({ ...installForm, type: v || "mysql" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mysql">{t("tools.databaseMySQL")}</SelectItem>
                  <SelectItem value="postgresql">{t("tools.databasePostgreSQL")}</SelectItem>
                  <SelectItem value="redis">{t("tools.databaseRedis")}</SelectItem>
                  <SelectItem value="mongodb">{t("tools.databaseMongoDB")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.databaseVersion")}</label>
              <Input value={installForm.version} onChange={(e) => setInstallForm({ ...installForm, version: e.target.value })} placeholder="8.0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.databasePort")}</label>
              <Input value={installForm.port} onChange={(e) => setInstallForm({ ...installForm, port: e.target.value })} placeholder="3306" />
            </div>
            {(installForm.type === "mysql" || installForm.type === "postgresql") && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("tools.databasePassword")}</label>
                <Input type="password" value={installForm.password} onChange={(e) => setInstallForm({ ...installForm, password: e.target.value })} placeholder="root password" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={doInstall} disabled={installLoading || !installForm.type || !installForm.port}>
              {installLoading ? t("tools.installing") : t("tools.installDatabase")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`${t("tools.removeDatabase")}: ${deleteTarget}`}
        description={t("tools.databaseRemoveDesc", { type: deleteTarget || "" })}
        confirmLabel={t("tools.removeDatabase")}
        onConfirm={doRemove}
        variant="destructive"
      />
    </div>
  );
}
