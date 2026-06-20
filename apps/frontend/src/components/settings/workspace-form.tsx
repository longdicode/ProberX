"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api-client";

export function WorkspaceForm() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const queryClient = useQueryClient();
  const wid = current?.id;

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Settings className="w-4 h-4" />{t("settings.general")}</CardTitle>
        <CardDescription>{t("settings.generalDesc")}</CardDescription>
      </CardHeader>
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
  );
}
