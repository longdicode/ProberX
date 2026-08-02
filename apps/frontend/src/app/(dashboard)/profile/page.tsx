"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces } from "@/hooks/use-api";
import { useLocale } from "@/stores/locale-store";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const { data: workspaces, isLoading } = useWorkspaces();
  const [copied, setCopied] = useState(false);

  if (!user || isLoading) return <LoadingSkeleton />;

  const initials =
    user.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ||
    user.email?.[0]?.toUpperCase() ||
    "?";

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("profile.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("profile.desc")}</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-5 p-6">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold truncate">{user.name || t("header.userFallback")}</h2>
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/40 bg-emerald-500/10 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                {t("profile.online")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate mt-0.5">{user.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/overview")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {t("profile.backToOverview")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.accountInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t("auth.name")}</span>
            <span className="text-sm font-medium">{user.name || "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t("auth.email")}</span>
            <span className="text-sm font-medium">{user.email || "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t("profile.userId")}</span>
            <button
              onClick={copyId}
              className="inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
              title={t("profile.copyId")}
            >
              {user.id.slice(0, 8)}…
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t("profile.currentWorkspace")}</span>
            <span className="text-sm font-medium">{current?.name || "—"}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t("profile.workspaceCount")}</span>
            <span className="text-sm font-medium">{workspaces?.length ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/25">
        <CardHeader>
          <CardTitle className="text-base text-destructive">{t("profile.session")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            variant="destructive"
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-1.5" />
            {t("header.signOut")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("profile.sessionDesc")}</span>
        </CardContent>
      </Card>
    </div>
  );
}
