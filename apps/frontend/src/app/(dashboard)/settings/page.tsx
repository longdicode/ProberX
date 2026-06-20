"use client";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces } from "@/hooks/use-api";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { ApiKeyManager } from "@/components/settings/api-key-manager";
import { MemberManager } from "@/components/settings/member-manager";
import { NotificationSettings } from "@/components/settings/notification-settings";

export default function SettingsPage() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const { isLoading } = useWorkspaces();

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.desc")}</p>
      </div>

      <WorkspaceForm />
      {wid && <ApiKeyManager workspaceId={wid} />}
      {wid && <MemberManager workspaceId={wid} />}
      {wid && <NotificationSettings workspaceId={wid} />}
    </div>
  );
}
