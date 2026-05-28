"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useServers } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { Wrench, Settings, Shield, FileText, Package, Globe, Rocket } from "lucide-react";

const toolCards = [
  { id: "systemd", titleKey: "tools.systemdTitle", descKey: "tools.systemdDesc", icon: Settings },
  { id: "ssl", titleKey: "tools.sslTitle", descKey: "tools.sslDesc", icon: Shield },
  { id: "logs", titleKey: "tools.logsTitle", descKey: "tools.logsDesc", icon: FileText },
  { id: "packages", titleKey: "tools.packagesTitle", descKey: "tools.packagesDesc", icon: Package },
  { id: "nginx", titleKey: "tools.nginxTitle", descKey: "tools.nginxDesc", icon: Globe },
  { id: "deploy", titleKey: "tools.deployTitle", descKey: "tools.deployDesc", icon: Rocket },
];

export default function ToolsPage() {
  const { t } = useLocale();
  const router = useRouter();
  const { current, setCurrent } = useWorkspaceStore();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const { data: servers, isLoading: serversLoading } = useServers(current?.id);

  if (typeof window !== "undefined") {
    if (!current && workspaces && workspaces.length > 0) setCurrent(workspaces[0]);
  }

  function selectServer(sid: string) {
    router.push(`/tools?serverId=${sid}`);
  }

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const serverId = searchParams?.get("serverId");

  if (wsLoading || serversLoading) return <PageSkeleton />;
  const onlineServers = servers?.filter((s) => s.isOnline && s.hostInfo) ?? [];

  return (
    <Suspense fallback={<PageSkeleton />}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.tools")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("tools.selectServerDesc")}</p>
        </div>

        {onlineServers.length === 0 ? (
          <EmptyState icon={Wrench} title={t("tools.selectServer")}
            description={t("tools.selectServerDesc")} />
        ) : (
          <>
            <h2 className="text-sm font-medium text-muted-foreground">Select a server</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {onlineServers.map((s) => (
                <Card key={s.id}
                  className={cn(
                    "border-border/50 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer",
                    s.id === serverId && "border-primary ring-1 ring-primary"
                  )}
                  onClick={() => selectServer(s.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {s.name} <ServerStatusBadge status="online" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {s.hostInfo ? `${(s.hostInfo as Record<string, unknown>).os || ""} / ${(s.hostInfo as Record<string, unknown>).arch || ""}` : ""}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <h2 className="text-lg font-semibold mt-4">Available Tools</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {toolCards.map((tool) => (
                <Card key={tool.id}
                  className="border-border/50 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => router.push(`/tools/${tool.id}?serverId=${serverId || onlineServers[0]?.id || ""}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <tool.icon className="w-5 h-5 text-primary" />
                      <CardTitle className="text-base">{t(tool.titleKey)}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{t(tool.descKey)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </Suspense>
  );
}
