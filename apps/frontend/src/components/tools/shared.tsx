"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Server } from "@/hooks/use-api";
import { ArrowLeft, Wrench, Settings, Shield, FileText, Package, Globe, Rocket, Store, Database, HardDrive, ShieldAlert, Terminal, Server as ServerIcon, Globe as GlobeIcon, Container } from "lucide-react";

export const toolMeta: Record<string, { titleKey: string; icon: typeof Wrench }> = {
  systemd: { titleKey: "tools.systemdTitle", icon: Settings },
  ssl: { titleKey: "tools.sslTitle", icon: Shield },
  logs: { titleKey: "tools.logsTitle", icon: FileText },
  packages: { titleKey: "tools.packagesTitle", icon: Package },
  nginx: { titleKey: "tools.nginxTitle", icon: Globe },
  deploy: { titleKey: "tools.deployTitle", icon: Rocket },
  "app-center": { titleKey: "应用中心", icon: Store },
  databases: { titleKey: "tools.databasesTitle", icon: Database },
  backups: { titleKey: "tools.backupsTitle", icon: HardDrive },
  security: { titleKey: "tools.securityTitle", icon: ShieldAlert },
  shellai: { titleKey: "tools.shellaiTitle", icon: Terminal },
  dns: { titleKey: "tools.dnsTitle", icon: GlobeIcon },
  "docker-images": { titleKey: "tools.dockerImagesTitle", icon: Container },
};

export function ToolHeader({ meta, router, t, serverId, servers }: {
  meta: { titleKey: string; icon: typeof Wrench };
  router: ReturnType<typeof useRouter>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  serverId: string;
  servers: Server[];
}) {
  const currentServer = servers.find(s => s.id === serverId);

  function switchServer(newId: string | null) {
    if (!newId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("serverId", newId);
    router.push(window.location.pathname + "?" + params.toString());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-1" />{t("tools.backToTools")}
        </Button>
        <h1 className="text-xl font-semibold">{t(meta.titleKey)}</h1>
      </div>
      {currentServer && (
        <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border">
          <ServerIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{currentServer.name}</span>
          <ServerStatusBadge status={currentServer.isOnline ? "online" : "offline"} />
          <span className="text-xs text-muted-foreground">
            {(currentServer.hostInfo as Record<string, unknown>)?.os as string || ""}
          </span>
          {servers.length > 1 && (
            <Select value={serverId} onValueChange={switchServer}>
              <SelectTrigger size="sm" className="ml-auto w-40">
                <SelectValue placeholder={t("tools.switchServer")} />
              </SelectTrigger>
              <SelectContent>
                {servers.filter(s => s.isOnline && s.hostInfo).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorMsg({ msg }: { msg: string }) {
  return <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">{msg}</div>;
}

export function Row({ t, label, value }: { t: any; label: string; value: any }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{t(label)}</span><span>{value}</span></div>;
}
