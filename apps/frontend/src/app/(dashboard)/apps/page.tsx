"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useServers } from "@/hooks/use-api";
import { AppStorePanel } from "@/components/app-store/app-store-panel";
import { Store, Server as ServerIcon } from "lucide-react";

function AppsPageContent() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { current } = useWorkspaceStore();
  const { isLoading: wsLoading } = useWorkspaces();
  const { data: servers, isLoading: serversLoading } = useServers(current?.id);

  if (wsLoading || serversLoading) return <PageSkeleton />;

  const onlineServers = servers?.filter((s) => s.isOnline && s.hostInfo) ?? [];
  const requested = searchParams.get("serverId");
  const selectedId =
    onlineServers.find((s) => s.id === requested)?.id ?? onlineServers[0]?.id ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.appCenter")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("appStore.description")}</p>
      </div>

      {onlineServers.length === 0 ? (
        <EmptyState
          icon={Store}
          title={t("tools.selectServer")}
          description={t("appStore.noOnlineServerDesc")}
        />
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("appStore.deployTarget")}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {onlineServers.map((s) => (
                <Card
                  key={s.id}
                  className={cn(
                    "border-border/50 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer",
                    s.id === selectedId && "border-primary ring-1 ring-primary"
                  )}
                  onClick={() => router.push(`/apps?serverId=${s.id}`)}
                >
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ServerIcon className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{s.name}</span>
                    </div>
                    <ServerStatusBadge status="online" />
                  </div>
                  <div className="px-3 pb-3 -mt-1">
                    <p className="text-xs text-muted-foreground truncate">
                      {s.hostInfo
                        ? `${(s.hostInfo as Record<string, unknown>).os || ""} / ${
                            (s.hostInfo as Record<string, unknown>).arch || ""
                          }`
                        : ""}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {selectedId ? (
            <AppStorePanel
              key={selectedId}
              serverId={selectedId}
              workspaceId={current?.id || ""}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AppsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AppsPageContent />
    </Suspense>
  );
}
