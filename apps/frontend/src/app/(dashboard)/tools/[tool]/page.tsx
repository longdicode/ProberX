"use client";

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers } from "@/hooks/use-api";
import { ArrowLeft, Wrench } from "lucide-react";
import { AppStorePanel } from "@/components/app-store/app-store-panel";
import { toolMeta } from "@/components/tools/shared";
import SystemdTool from "@/components/tools/systemd-tool";
import SSLTool from "@/components/tools/ssl-tool";
import LogsTool from "@/components/tools/logs-tool";
import PackagesTool from "@/components/tools/packages-tool";
import NginxTool from "@/components/tools/nginx-tool";
import DatabasesTool from "@/components/tools/databases-tool";
import BackupsTool from "@/components/tools/backups-tool";
import SecurityTool from "@/components/tools/security-tool";
import ShellAITool from "@/components/tools/shellai-tool";
import DnsTool from "@/components/tools/dns-tool";
import DockerImagesTool from "@/components/tools/docker-images-tool";

export default function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);

  const serverId = searchParams.get("serverId");
  const toolId = use(params).tool;
  const meta = toolMeta[toolId];
  const onlineServers = servers?.filter(s => s.isOnline && s.hostInfo) ?? [];

  if (!meta) return <EmptyState icon={Wrench} title="Tool not found" description={`Unknown tool: ${toolId}`} />;

  if (!serverId) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/tools")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t("tools.backToTools")}
        </Button>
        <EmptyState icon={meta.icon} title={t("tools.selectServer")} description={t("tools.selectServerDesc")} />
      </div>
    );
  }

  const endpoint = (path: string) => `/workspaces/${current?.id || ""}/servers/${serverId}${path}`;
  const toolProps = { t, endpoint, meta, router, serverId, servers: onlineServers };

  switch (toolId) {
    case "systemd": return <SystemdTool {...toolProps} />;
    case "ssl": return <SSLTool {...toolProps} />;
    case "logs": return <LogsTool {...toolProps} />;
    case "packages": return <PackagesTool {...toolProps} />;
    case "nginx": return <NginxTool {...toolProps} />;
    case "deploy":
    case "app-center": return <AppStorePanel serverId={serverId} workspaceId={current?.id || ""} />;
    case "databases": return <DatabasesTool {...toolProps} />;
    case "backups": return <BackupsTool {...toolProps} />;
    case "security": return <SecurityTool {...toolProps} />;
    case "shellai": return <ShellAITool {...toolProps} />;
    case "dns": return <DnsTool {...toolProps} />;
    case "docker-images": return <DockerImagesTool {...toolProps} />;
    default: return <EmptyState icon={Wrench} title="Unknown tool" description={`Tool "${toolId}" not found`} />;
  }
}
