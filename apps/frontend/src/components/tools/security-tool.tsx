"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Shield, Search, ShieldAlert, RefreshCw } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

export default function SecurityTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [tab, setTab] = useState<"ssh" | "portscan" | "fail2ban">("ssh");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // SSH
  const [findings, setFindings] = useState<any[]>([]);

  // Port Scan
  const [scanTarget, setScanTarget] = useState("localhost");
  const [scanPorts, setScanPorts] = useState("1-1024");
  const [scanResult, setScanResult] = useState("");
  const [scanning, setScanning] = useState(false);

  // Fail2ban
  const [jails, setJails] = useState<any[]>([]);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banJail, setBanJail] = useState("sshd");
  const [banIP, setBanIP] = useState("");
  const [banning, setBanning] = useState(false);

  async function runSSHAudit() {
    setLoading(true); setError("");
    try { setFindings((await api.get<any[]>(endpoint("/tools/security/ssh"))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  async function runPortScan() {
    setScanning(true); setScanResult(""); setError("");
    try {
      const res = await api.post<{ target: string; output: string }>(endpoint("/tools/security/portscan"), { target: scanTarget, ports: scanPorts });
      setScanResult(res?.output || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setScanning(false); }
  }

  async function fetchFail2ban() {
    setLoading(true); setError("");
    try { setJails((await api.get<any[]>(endpoint("/tools/security/fail2ban"))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  async function doUnban(jail: string, ip: string) {
    try {
      await api.post(endpoint("/tools/security/fail2ban/unban"), { jail, ip });
      toast.success(t("tools.unbanSuccess"));
      await fetchFail2ban();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function doBan() {
    setBanning(true);
    try {
      await api.post(endpoint("/tools/security/fail2ban/ban"), { jail: banJail, ip: banIP });
      toast.success(t("tools.banSuccess"));
      setBanDialogOpen(false);
      setBanIP("");
      await fetchFail2ban();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBanning(false); }
  }

  useEffect(() => {
    if (tab === "ssh") runSSHAudit();
    else if (tab === "fail2ban") fetchFail2ban();
  }, [tab]);

  const severityBadge = (s: string) => {
    const map: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      critical: "destructive", high: "destructive", medium: "default",
      low: "secondary", info: "outline", ok: "default",
    };
    return <Badge variant={map[s] || "outline"} className="text-xs">{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3">
        <Button variant={tab === "ssh" ? "default" : "outline"} size="sm" onClick={() => setTab("ssh")}>
          <Shield className="w-4 h-4 mr-1" />{t("tools.sshAudit")}
        </Button>
        <Button variant={tab === "portscan" ? "default" : "outline"} size="sm" onClick={() => setTab("portscan")}>
          <Search className="w-4 h-4 mr-1" />{t("tools.portScanTitle")}
        </Button>
        <Button variant={tab === "fail2ban" ? "default" : "outline"} size="sm" onClick={() => setTab("fail2ban")}>
          <ShieldAlert className="w-4 h-4 mr-1" />{t("tools.fail2banTitle")}
        </Button>
      </div>

      {/* SSH Audit */}
      {tab === "ssh" && (
        <>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={runSSHAudit}>
              <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />{t("tools.refresh")}
            </Button>
          </div>
          {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : findings.length === 0 ? (
            <EmptyState icon={Shield} title={t("tools.noFindings")} description={t("tools.sshAuditDesc")} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3">{t("tools.severity")}</th>
                    <th className="text-left p-3">{t("tools.finding")}</th>
                    <th className="text-left p-3">{t("tools.recommendation")}</th>
                  </tr></thead>
                  <tbody>
                    {findings.map((f, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3">{severityBadge(f.severity)}</td>
                        <td className="p-3">
                          <span className="font-mono text-xs">{f.key}</span>
                          <span className="text-xs text-muted-foreground ml-2">= {f.value}</span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{f.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Port Scan */}
      {tab === "portscan" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-3 items-end flex-wrap">
                <div>
                  <label className="text-sm font-medium">{t("tools.scanTarget")}</label>
                  <Input value={scanTarget} onChange={(e) => setScanTarget(e.target.value)} placeholder={t("tools.scanTargetPlaceholder")} className="max-w-[200px]" />
                </div>
                <div>
                  <label className="text-sm font-medium">{t("tools.scanPorts")}</label>
                  <Input value={scanPorts} onChange={(e) => setScanPorts(e.target.value)} placeholder={t("tools.scanPortsPlaceholder")} className="max-w-[150px]" />
                </div>
                <Button onClick={runPortScan} disabled={scanning || !scanTarget}>
                  {scanning ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />{t("tools.scanning")}</> : <><Search className="w-4 h-4 mr-1" />{t("tools.startScan")}</>}
                </Button>
              </div>
            </CardContent>
          </Card>
          {error && <ErrorMsg msg={error} />}
          {scanResult && (
            <Card>
              <CardHeader><CardTitle className="text-sm">{t("tools.scanResult")}: {scanTarget}</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-96 overflow-auto">{scanResult}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Fail2ban */}
      {tab === "fail2ban" && (
        <>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={fetchFail2ban}>
              <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />{t("tools.refresh")}
            </Button>
            <Button size="sm" onClick={() => { setBanDialogOpen(true); setBanJail("sshd"); setBanIP(""); }}>
              <ShieldAlert className="w-4 h-4 mr-1" />{t("tools.ban")}
            </Button>
          </div>
          {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : jails.length === 0 ? (
            <EmptyState icon={ShieldAlert} title={t("tools.noJails")} description={t("tools.fail2banDesc")} />
          ) : (
            <div className="space-y-4">
              {jails.map((jail) => (
                <Card key={jail.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {jail.name}
                      <Badge variant={jail.enabled ? "default" : "secondary"} className="text-xs">
                        {jail.enabled ? "active" : "disabled"}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-normal">
                        {t("tools.banCount")}: {jail.ban_count}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {jail.banned_ips?.length > 0 ? (
                      <div className="space-y-1">
                        {jail.banned_ips.map((ip: string) => (
                          <div key={ip} className="flex items-center justify-between px-3 py-1 bg-muted/30 rounded-md">
                            <code className="text-xs">{ip}</code>
                            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => doUnban(jail.name, ip)}>
                              {t("tools.unban")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("tools.noJails")}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Ban IP Dialog */}
          <Dialog open={banDialogOpen} onOpenChange={(open) => { if (!open) setBanDialogOpen(false); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("tools.ban")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">{t("tools.jailName")}</label>
                  <Select value={banJail} onValueChange={(v) => setBanJail(v || "sshd")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {jails.map((j) => (
                        <SelectItem key={j.name} value={j.name}>{j.name}</SelectItem>
                      ))}
                      {jails.length === 0 && <SelectItem value="sshd">sshd</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">{t("tools.banIP")}</label>
                  <Input value={banIP} onChange={(e) => setBanIP(e.target.value)} placeholder={t("tools.banIPPlaceholder")} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBanDialogOpen(false)}>{t("tools.cancel")}</Button>
                <Button onClick={doBan} disabled={banning || !banIP}>
                  {banning ? t("tools.creating") : t("tools.ban")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
