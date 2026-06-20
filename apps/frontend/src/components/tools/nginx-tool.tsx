"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Globe, Trash2 } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function NginxTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(false);
  const [config, setConfig] = useState<{ path: string; content: string } | null>(null);
  const [vhosts, setVhosts] = useState<any[]>([]);
  const [vhostOpen, setVhostOpen] = useState(false);
  const [vhostForm, setVhostForm] = useState({ domain: "", target_port: "", web_root: "", use_ssl: false, ssl_email: "" });
  const [vhostSubmitting, setVhostSubmitting] = useState(false);
  const [deleteVhostTarget, setDeleteVhostTarget] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true); setError("");
    try { setStatus(await api.get(endpoint("/tools/nginx"))); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint]);

  const fetchVHosts = useCallback(async () => {
    try { setVhosts((await api.get<any[]>(endpoint("/tools/nginx/vhosts"))) || []); }
    catch { /* may fail if sites-available doesn't exist */ }
  }, [endpoint]);

  useEffect(() => { fetchStatus(); fetchVHosts(); }, [fetchStatus, fetchVHosts]);

  async function reload() {
    setReloading(true);
    try { await api.post(endpoint("/tools/nginx/reload")); toast.success(t("tools.reloaded")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setReloading(false); }
  }

  async function loadConfig(path?: string) {
    try {
      const qs = path ? `?path=${encodeURIComponent(path)}` : "";
      setConfig(await api.get(endpoint(`/tools/nginx/config${qs}`)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function createVHost() {
    if (!vhostForm.domain || !vhostForm.target_port) return;
    setVhostSubmitting(true);
    try {
      await api.post(endpoint("/tools/nginx/vhosts"), vhostForm);
      toast.success(t("tools.vhostCreateSuccess", { domain: vhostForm.domain }));
      setVhostOpen(false);
      setVhostForm({ domain: "", target_port: "", web_root: "", use_ssl: false, ssl_email: "" });
      await fetchVHosts();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setVhostSubmitting(false); }
  }

  async function deleteVHost() {
    if (!deleteVhostTarget) return;
    const domain = deleteVhostTarget;
    setDeleteVhostTarget(null);
    try {
      await api.delete(endpoint("/tools/nginx/vhosts"), { domain });
      toast.success(t("tools.vhostDeleteSuccess"));
      await fetchVHosts();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : status && !status.installed ? (
        <EmptyState icon={Globe} title={t("tools.nginxNotInstalled")} description="" />
      ) : status && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardContent className="p-4 flex items-center gap-4 flex-wrap">
              <Badge variant={status.installed ? "default" : "secondary"}>{t("tools.nginxInstalled")}: {String(!!status.installed)}</Badge>
              <Badge variant={status.active ? "default" : "secondary"}>{t("tools.nginxActive")}: {String(!!status.active)}</Badge>
              <span className="text-xs text-muted-foreground">{status.version}</span>
              <Button size="sm" onClick={reload} disabled={reloading}>{reloading ? t("tools.reloading") : t("tools.reload")}</Button>
            </CardContent>
          </Card>

          {/* VHost Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{t("tools.vhosts")}</CardTitle>
              <Button size="sm" onClick={() => setVhostOpen(true)}>{t("tools.createVHost")}</Button>
            </CardHeader>
            <CardContent className="p-0">
              {vhosts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t("tools.vhostNoVHosts")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-xs">{t("tools.vhostDomain")}</th>
                    <th className="text-left p-3 text-xs">{t("tools.vhostTargetPort")}</th>
                    <th className="text-center p-3 text-xs">{t("tools.vhostEnabled")}</th>
                    <th className="text-center p-3 text-xs">{t("tools.vhostSSL")}</th>
                    <th className="text-right p-3 text-xs">{t("tools.serviceControl")}</th>
                  </tr></thead>
                  <tbody>
                    {vhosts.map((v: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{v.domain}</td>
                        <td className="p-3 text-xs text-muted-foreground">{v.target_port || "--"}</td>
                        <td className="p-3 text-center"><Badge variant={v.enabled ? "default" : "secondary"} className="text-xs">{v.enabled ? "Yes" : "No"}</Badge></td>
                        <td className="p-3 text-center"><Badge variant={v.has_ssl ? "default" : "secondary"} className="text-xs">{v.has_ssl ? "Yes" : "No"}</Badge></td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadConfig(v.config_path)}>View</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setDeleteVhostTarget(v.domain)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {status.config_files?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{t("tools.configFiles")}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {status.config_files.map((f: string, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{f}</td>
                        <td className="p-3 text-right"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadConfig(f)}>View</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("tools.accessLog")}</span><span className="font-mono text-xs">{status.access_log || "--"}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t("tools.errorLog")}</span><span className="font-mono text-xs">{status.error_log || "--"}</span></div>
          {config && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">{t("tools.configContent")}: {config.path}</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setConfig(null)}>Close</Button>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-96 overflow-auto">{config.content}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create VHost Dialog */}
      <Dialog open={vhostOpen} onOpenChange={setVhostOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tools.createVHost")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.vhostDomain")}</label>
              <Input value={vhostForm.domain} onChange={(e) => setVhostForm({ ...vhostForm, domain: e.target.value })} placeholder="example.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.vhostTargetPort")}</label>
              <Input value={vhostForm.target_port} onChange={(e) => setVhostForm({ ...vhostForm, target_port: e.target.value })} placeholder={t("tools.vhostTargetPortPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.vhostWebRoot")}</label>
              <Input value={vhostForm.web_root} onChange={(e) => setVhostForm({ ...vhostForm, web_root: e.target.value })} placeholder="/var/www/example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVhostOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={createVHost} disabled={vhostSubmitting || !vhostForm.domain || !vhostForm.target_port}>
              {vhostSubmitting ? "..." : t("tools.createVHost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete VHost Confirmation */}
      <ConfirmDialog
        open={!!deleteVhostTarget}
        onOpenChange={(open) => { if (!open) setDeleteVhostTarget(null); }}
        title={`${t("tools.deleteVHost")}: ${deleteVhostTarget}`}
        description={t("tools.vhostDeleteDesc", { domain: deleteVhostTarget || "" })}
        confirmLabel={t("tools.deleteVHost")}
        onConfirm={deleteVHost}
        variant="destructive"
      />
    </div>
  );
}
