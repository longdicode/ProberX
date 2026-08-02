"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { ToolHeader, ErrorMsg, Row } from "./shared";

export default function SSLTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sslEmail, setSslEmail] = useState("");
  const [sslWebroot, setSslWebroot] = useState("");
  const [issueResult, setIssueResult] = useState<any>(null);
  const [issueLoading, setIssueLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);
  const [installed, setInstalled] = useState<any[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setInstalled((await api.get<any[]>(endpoint("/tools/ssl/certs"))) || []);
      } catch { /* ignore */ }
      finally { setInstalledLoading(false); }
    })();
  }, [endpoint]);

  async function check() {
    if (!domain) return;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await api.post(endpoint("/tools/ssl"), { domain })); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  async function doIssue() {
    if (!domain || !sslEmail) return;
    setIssueLoading(true); setIssueResult(null);
    try {
      const res = await api.post(endpoint("/tools/ssl/issue"), { domain, email: sslEmail, webroot: sslWebroot || undefined });
      setIssueResult(res);
      toast.success(t("tools.sslIssueSuccess", { domain }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setIssueLoading(false); }
  }

  async function doRenew() {
    if (!domain) return;
    setRenewLoading(true); setIssueResult(null);
    try {
      const res = await api.post(endpoint("/tools/ssl/renew"), { domain });
      setIssueResult(res);
      toast.success(t("tools.sslRenewSuccess", { domain }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setRenewLoading(false); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />

      {/* Installed certificates (BT Panel / certbot) */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("tools.installedCerts")}</CardTitle></CardHeader>
        <CardContent>
          {installedLoading ? (
            <p className="text-sm text-muted-foreground">{t("tools.checking")}</p>
          ) : installed.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tools.noInstalledCerts")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {installed.map((cert) => (
                <div key={cert.cert_path} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{cert.domain}</span>
                    <Badge variant={cert.days_left < 30 ? "destructive" : cert.days_left < 60 ? "secondary" : "default"}>
                      {cert.days_left}{t("tools.daysSuffix")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cert.issuer} · {new Date(cert.not_after).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {cert.source === "bt" ? t("tools.certSourceBt") : t("tools.certSourceCertbot")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{cert.cert_path}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 max-w-lg">
        <Input placeholder={t("tools.domainPlaceholder")} value={domain}
          onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} />
        <Button onClick={check} disabled={loading}>{loading ? t("tools.checking") : t("tools.checkSSL")}</Button>
      </div>
      {error && <ErrorMsg msg={error} />}
      {result && (
        <Card className="max-w-lg">
          <CardContent className="p-4 space-y-2 text-sm">
            <Row t={t} label="tools.subject" value={result.subject} />
            <Row t={t} label="tools.issuer" value={result.issuer} />
            <Row t={t} label="tools.notBefore" value={result.not_before} />
            <Row t={t} label="tools.notAfter" value={result.not_after} />
            <div className="flex justify-between"><span className="text-muted-foreground">{t("tools.daysLeft")}</span>
              <Badge variant={result.days_left < 30 ? "destructive" : result.days_left < 60 ? "secondary" : "default"}>{result.days_left}</Badge></div>
            <Row t={t} label="tools.sans" value={result.sans} />
            <Row t={t} label="tools.fingerprint" value={<span className="font-mono text-xs">{result.fingerprint}</span>} />
          </CardContent>
        </Card>
      )}

      {/* Issue & Renew Section */}
      <Card className="max-w-lg">
        <CardHeader><CardTitle className="text-sm">{t("tools.issueSSL")} / {t("tools.renewSSL")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium">{t("tools.sslEmail")}</label>
            <Input placeholder={t("tools.sslEmailPlaceholder")} value={sslEmail} onChange={(e) => setSslEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">{t("tools.sslWebroot")}</label>
            <Input placeholder="/var/www/html" value={sslWebroot} onChange={(e) => setSslWebroot(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={doIssue} disabled={issueLoading || !domain || !sslEmail}>
              {issueLoading ? t("tools.issuing") : t("tools.issueSSL")}
            </Button>
            <Button size="sm" variant="outline" onClick={doRenew} disabled={renewLoading || !domain}>
              {renewLoading ? t("tools.renewing") : t("tools.renewSSL")}
            </Button>
          </div>
          {issueResult && (
            <div>
              <label className="text-xs font-medium mb-1 block">{t("tools.sslOutput")}</label>
              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-60 overflow-auto">
                {issueResult.output || JSON.stringify(issueResult, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
