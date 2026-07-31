"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, CheckCircle2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export function WorkspaceForm() {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const workspaces = useWorkspaceStore((s) => s.list);
  const queryClient = useQueryClient();
  const router = useRouter();
  const wid = current?.id;

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!wid) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${wid}`);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // Switch to another workspace if available
      const other = workspaces.find((w) => w.id !== wid);
      if (other) {
        setCurrent(other);
        toast.success("Workspace deleted");
      } else {
        useWorkspaceStore.getState().clear();
      }
      router.push("/overview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete workspace");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <>
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
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
              {saved ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saved ? "Saved" : t("common.save")}
            </Button>
            <Button onClick={() => setDeleteOpen(true)} variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
              <Trash2 className="w-4 h-4 mr-2" />Delete Workspace
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { if (!open) setDeleteOpen(false); }}
        title={`Delete: ${current?.name}`}
        description="This will permanently delete the workspace and all associated servers, monitors, alerts, and data. This action cannot be undone."
        confirmLabel="Delete Workspace"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </>
  );
}
