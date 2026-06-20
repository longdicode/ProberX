"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Key, Plus, Copy, Trash2, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/stores/locale-store";
import { useApiKeys, type ApiKey } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

interface Props {
  workspaceId: string;
}

export function ApiKeyManager({ workspaceId: wid }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { data: apiKeys, isLoading: keysLoading } = useApiKeys(wid);

  const [keyName, setKeyName] = useState("");
  const [keyPerms, setKeyPerms] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  const handleCreateKey = async () => {
    if (!wid || !keyName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ id: string; name: string; key: string }>(`/workspaces/${wid}/api-keys`, {
        name: keyName.trim(),
        permissions: keyPerms ? keyPerms.split(",").map((s) => s.trim()).filter(Boolean) : [],
      });
      setNewKey(res.key);
      setKeyName("");
      setKeyPerms("");
      queryClient.invalidateQueries({ queryKey: ["api-keys", wid] });
    } catch { /* handled */ }
    finally { setCreating(false); }
  };

  const handleCopy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!wid || !deleteTarget) return;
    try {
      await api.delete(`/workspaces/${wid}/api-keys/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["api-keys", wid] });
    } catch { /* handled */ }
    finally { setDeleteTarget(null); }
  };

  const formatDate = (d: string | null) => {
    if (!d) return t("settings.keyNever");
    return new Date(d).toLocaleDateString();
  };

  return (
    <>
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" />{t("settings.apiKeys")}</CardTitle>
          <CardDescription>{t("settings.apiKeysDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs">{t("settings.keyName")}</Label>
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={t("settings.keyNamePlaceholder")} />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <Label className="text-xs">{t("settings.keyPermissions")}</Label>
              <Input value={keyPerms} onChange={(e) => setKeyPerms(e.target.value)} placeholder="read, write" />
            </div>
            <Button onClick={handleCreateKey} disabled={creating || !keyName.trim()} size="sm">
              <Plus className="w-4 h-4 mr-1" />{t("settings.createKey")}
            </Button>
          </div>

          {newKey && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />{t("settings.keyCreated")}
              </div>
              <div className="flex gap-2">
                <Input readOnly value={newKey} className="font-mono text-xs bg-background" />
                <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                  {copied ? <CheckCircle2 className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? t("settings.copied") : t("settings.copyKey")}
                </Button>
              </div>
            </div>
          )}

          {keysLoading ? (
            <div className="py-4 text-sm text-muted-foreground">Loading...</div>
          ) : !apiKeys || apiKeys.length === 0 ? (
            <EmptyState
              icon={Key}
              title={t("settings.apiKeys")}
              description={t("settings.noApiKeys")}
            />
          ) : (
            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{key.name}</span>
                      {key.permissions.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t("settings.keyCreatedAt")} {formatDate(key.createdAt)}</span>
                      {key.lastUsedAt && <span>{t("settings.keyLastUsed")} {formatDate(key.lastUsedAt)}</span>}
                      {key.expiresAt && <span>{t("settings.keyExpires")} {formatDate(key.expiresAt)}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="xs" onClick={() => setDeleteTarget(key)} className="text-destructive hover:text-destructive shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`${t("settings.deleteKey")}: ${deleteTarget?.name}`}
        description="This action is permanent. Any code using this key will stop working."
        confirmLabel={t("settings.deleteKey")}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </>
  );
}
