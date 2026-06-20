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
import { Bell, Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/stores/locale-store";
import { useNotificationChannels, type NotificationChannel } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { NOTIFICATION_TYPES } from "@/lib/constants";

interface Props {
  workspaceId: string;
}

export function NotificationSettings({ workspaceId: wid }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { data: channels, isLoading: channelsLoading } = useNotificationChannels(wid);

  const [chName, setChName] = useState("");
  const [chType, setChType] = useState("webhook");
  const [chUrl, setChUrl] = useState("");
  const [chBotToken, setChBotToken] = useState("");
  const [chChatId, setChChatId] = useState("");
  const [chSecret, setChSecret] = useState("");
  const [chCreating, setChCreating] = useState(false);
  const [chDeleteTarget, setChDeleteTarget] = useState<NotificationChannel | null>(null);

  function buildChannelConfig(): Record<string, string> | null {
    switch (chType) {
      case "telegram":
        if (!chBotToken.trim() || !chChatId.trim()) return null;
        return { botToken: chBotToken.trim(), chatId: chChatId.trim() };
      case "discord":
        if (!chUrl.trim()) return null;
        return { webhookUrl: chUrl.trim() };
      case "email":
        if (!chUrl.trim()) return null;
        return { email: chUrl.trim() };
      case "dingtalk":
      case "feishu":
        if (!chUrl.trim()) return null;
        return chSecret.trim()
          ? { url: chUrl.trim(), secret: chSecret.trim() }
          : { url: chUrl.trim() };
      case "wecom":
        if (!chUrl.trim()) return null;
        return { url: chUrl.trim() };
      case "telegram-bot":
        if (!chUrl.trim()) return null;
        return { endpoint: chUrl.trim() };
      default: // webhook, slack
        if (!chUrl.trim()) return null;
        return { url: chUrl.trim() };
    }
  }

  const handleCreateChannel = async () => {
    if (!wid || !chName.trim()) return;
    const cfg = buildChannelConfig();
    if (!cfg) return;
    setChCreating(true);
    try {
      await api.post(`/workspaces/${wid}/notifications`, {
        name: chName.trim(),
        type: chType,
        config: cfg,
      });
      setChName("");
      setChType("webhook");
      setChUrl("");
      setChBotToken("");
      setChChatId("");
      setChSecret("");
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

  function channelConfigSummary(ch: NotificationChannel): string {
    const c = ch.config as Record<string, string>;
    switch (ch.type) {
      case "telegram": return `Bot: ${c?.botToken?.slice(0, 12) ?? "?"}... | Chat: ${c?.chatId ?? "?"}`;
      case "discord": return c?.webhookUrl ?? "?";
      case "email": return c?.email ?? "?";
      case "dingtalk":
      case "feishu": return c?.secret ? `${c.url?.slice(0, 40) ?? "?"}... (signed)` : (c?.url ?? "?");
      case "wecom": return c?.url ?? "?";
      case "telegram-bot": return c?.endpoint ?? "?";
      default: return c?.url ?? "?";
    }
  }

  return (
    <>
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
              <select className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm" value={chType} onChange={(e) => { setChType(e.target.value); setChSecret(""); }}>
                {NOTIFICATION_TYPES.map((nt) => (
                  <option key={nt.value} value={nt.value}>{t(`notificationTypes.${nt.value}`)}</option>
                ))}
              </select>
            </div>
            {chType === "telegram" && (
              <>
                <div className="space-y-1.5 flex-1 min-w-[180px]">
                  <Label className="text-xs">Bot Token</Label>
                  <Input value={chBotToken} onChange={(e) => setChBotToken(e.target.value)} placeholder="123456:ABC-DEF1234..." />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[140px]">
                  <Label className="text-xs">Chat ID</Label>
                  <Input value={chChatId} onChange={(e) => setChChatId(e.target.value)} placeholder="-1001234567890" />
                </div>
              </>
            )}
            {(chType === "dingtalk" || chType === "feishu") && (
              <>
                <div className="space-y-1.5 flex-1 min-w-[240px]">
                  <Label className="text-xs">Webhook URL</Label>
                  <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder={chType === "dingtalk" ? "https://oapi.dingtalk.com/robot/send?access_token=..." : "https://open.feishu.cn/open-apis/bot/v2/hook/..."} />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[150px]">
                  <Label className="text-xs">Secret (optional)</Label>
                  <Input value={chSecret} onChange={(e) => setChSecret(e.target.value)} placeholder="SEC..." />
                </div>
              </>
            )}
            {chType === "wecom" && (
              <div className="space-y-1.5 flex-1 min-w-[280px]">
                <Label className="text-xs">Webhook URL</Label>
                <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
              </div>
            )}
            {chType === "discord" && (
              <div className="space-y-1.5 flex-1 min-w-[280px]">
                <Label className="text-xs">Webhook URL</Label>
                <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/..." />
              </div>
            )}
            {chType === "email" && (
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs">Email</Label>
                <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder="admin@example.com" />
              </div>
            )}
            {chType === "telegram-bot" && (
              <div className="space-y-1.5 flex-1 min-w-[240px]">
                <Label className="text-xs">Bot Endpoint</Label>
                <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder="http://localhost:3101/notify" />
              </div>
            )}
            {(chType === "webhook" || chType === "slack") && (
              <div className="space-y-1.5 flex-1 min-w-[240px]">
                <Label className="text-xs">{t("settings.channelUrl")}</Label>
                <Input value={chUrl} onChange={(e) => setChUrl(e.target.value)} placeholder={chType === "slack" ? "https://hooks.slack.com/..." : "https://..."} />
              </div>
            )}
            <Button onClick={handleCreateChannel} disabled={chCreating || !chName.trim() || !buildChannelConfig()} size="sm">
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
                      {channelConfigSummary(ch)}
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
        open={!!chDeleteTarget}
        onOpenChange={(open) => { if (!open) setChDeleteTarget(null); }}
        title={`Delete notification channel: ${chDeleteTarget?.name}`}
        description="Alert notifications will no longer be sent to this channel."
        confirmLabel="Delete"
        onConfirm={handleDeleteChannel}
        variant="destructive"
      />
    </>
  );
}
