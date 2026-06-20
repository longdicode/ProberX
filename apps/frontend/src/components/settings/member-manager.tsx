"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { useLocale } from "@/stores/locale-store";
import { useMembers } from "@/hooks/use-api";

interface Props {
  workspaceId: string;
}

export function MemberManager({ workspaceId: wid }: Props) {
  const { t } = useLocale();
  const { data: members, isLoading: membersLoading } = useMembers(wid);

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />{t("settings.members")}</CardTitle>
        <CardDescription>{t("settings.membersDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {membersLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !members || members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.onlyMember")}</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium shrink-0">
                    {(m.name || m.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.name ?? m.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                </div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {m.role}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
