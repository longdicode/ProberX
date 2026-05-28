"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Settings, Key, Users, Save, CheckCircle2, Plus, Copy, Trash2, Clock, AlertTriangle, Bell } from "lucide-react";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useApiKeys, useMembers, useNotificationChannels, type ApiKey, type Member, type NotificationChannel } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

export default function SettingsPage() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const { data: workspaces, isLoading } = useWorkspaces();
  const queryClient = useQueryClient();
  const wid = current?.id;

  // Workspace name
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // API Keys
  const { data: apiKeys, isLoading: keysLoading } = useApiKeys(wid);
  const [keyName, setKeyName] = useState("");
  const [keyPerms, setKeyPerms] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  // Members
  const { data: members, isLoading: membersLoading } = useMembers(wid);

  // Notification Channels
  const { data: channels, isLoading: channelsLoading } = useNotificationChannels(wid);
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState("webhook");
  const [chUrl, setChUrl] = useState("");
  const [chCreating, setChCreating] = useState(false);
  const [chDeleteTarget, setChDeleteTarget] = useState<NotificationChannel | null>(null);

  useEffect(() => {
    if (current?.name) setName(current.name);
  }, [current?.name]);

  const handleSave = async () => {
    if (!wid || !name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.patch<{ id: string; name: string }>(`/workspaces/${wid}`, { name: name.trim() });
      setCurrent({ ...current!, name: updated.name });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* handled */ }
    finally { setSaving(false); }
  };

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

  const handleCreateChannel = async () => {
    if (!wid || !chName.trim() || !chUrl.trim()) return;
    setChCreating(true);
    try {
      await api.post(`/workspaces/${wid}/notifications`, {
        name: chName.trim(),
        type: chType,
        config: { url: chUrl.trim() },
      });
      setChName("");
      setChType("webhook");
      setChUrl("");
      queryClient.invalidateQueries({ queryKey: ["notification-channels", wid] });
    } catch { /* handled */ }
    finally { setChCreating(false); }
  };

  const handleDeleteChannel = async () => {
    if (!wid || !chDeleteTarget) return;
    try {
      await api.delete(`/workspaces/${wid}/notifications/${chDeleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["notification-channels", wid] });
    } catch { /* handled */ }
    finally { setChDeleteTarget(null); }
  };

  const handleToggleChannel = async (ch: NotificationChannel) => {
    if (!wid) return;
    try {
      await api.patch(`/workspaces/${wid}/notifications/${ch.id}`, { isEnabled: !ch.isEnabled });
      queryClient.invalidateQueries({ queryKey: ["notification-channels", wid] });
    } catch { /* handled */ }
  };

  const formatDate = (d: string | null) => {
    if (!d) return t("settings.keyNever");
    return new Date(d).toLocaleDateString();
  };

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.desc")}</p>
      </div>

      {/* General */}
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" />{t("settings.general")}</CardTitle><CardDescription>{t("settings.generalDesc")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("settings.workspaceName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.workspaceNamePlaceholder")} />
          </div>
          <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
            {saved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saved ? "Saved" : t("common.save")}
          </Button>
        </CardContent>
      </Card>

      {/* API Keys */}
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

      {/* Members */}
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />{t("settings.members")}</CardTitle><CardDescription>{t("settings.membersDesc")}</CardDescription></CardHeader>
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

      {/* Notification Channels */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />{t("settings.notificationChannels")}</CardTitle>
          <CardDescription>{t("settings.notificationChannelsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs">{t("settings.channelName")}</Label>
              <Input value={chName} onChange={(e) => setChName(e.target.value)} placeholder={t("settings.channelNamePlaceholder")} />
            </div>
            <div className="space-y-1.5 w-[120px]">
              <Label className="text-xs">{t("settings.channelType")}</Label>
              <select className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={chType} onChange={(e) => setChType(e.target.value)}>
                <option value="webhook">Webhook</option>
                <option value="slack">Slack</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label className="text-xs">{t("settings.channelUrl")}</Label>
              <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder={chType === "email" ? "admin@example.com" : "https://hooks.slack.com/..."} />
            </div>
            <Button onClick={handleCreateChannel} disabled={chCreating || !chName.trim() || !chUrl.trim()} size="sm">
              <Plus className="w-4 h-4 mr-1" />{t("settings.createChannel")}
            </Button>
          </div>

          {channelsLoading ? (
            <div className="py-4 text-sm text-muted-foreground">Loading...</div>
          ) : !channels || channels.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={t("settings.notificationChannels")}
              description={t("settings.noChannels")}
            />
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => (
                <div key={ch.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{ch.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{ch.type}</Badge>
                      {!ch.isEnabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">Disabled</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                      {ch.type === "email" ? (ch.config as Record<string, string>)?.email : (ch.config as Record<string, string>)?.url}
                    </p>
                  </div>
                  <Button variant="ghost" size="xs" onClick={() => handleToggleChannel(ch)} className="text-muted-foreground hover:text-foreground shrink-0" title={ch.isEnabled ? "Disable" : "Enable"}>
                    <span className={`w-2 h-2 rounded-full ${ch.isEnabled ? "bg-green-400" : "bg-muted-foreground"}`} />
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setChDeleteTarget(ch)} className="text-destructive hover:text-destructive shrink-0">
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

      <ConfirmDialog
        open={!!chDeleteTarget}
        onOpenChange={(open) => { if (!open) setChDeleteTarget(null); }}
        title={`Delete notification channel: ${chDeleteTarget?.name}`}
        description="Alert notifications will no longer be sent to this channel."
        confirmLabel="Delete"
        onConfirm={handleDeleteChannel}
        variant="destructive"
      />
    </div>
  );
}
