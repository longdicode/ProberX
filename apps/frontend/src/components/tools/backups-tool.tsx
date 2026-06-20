"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HardDrive, Database, RefreshCw, Trash2, RotateCcw, Cloud, CloudUpload, CloudDownload, CloudOff, CheckCircle2 } from "lucide-react";
import CloudBackupConfigDialog from "./cloud-backup-config";
import { ToolHeader, ErrorMsg } from "./shared";

export default function BackupsTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState<"file" | "db" | null>(null);
  const [sourcePath, setSourcePath] = useState("");
  const [dbType, setDbType] = useState("mysql");
  const [backupName, setBackupName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [cloudConfigOpen, setCloudConfigOpen] = useState(false);
  const [cloudUploading, setCloudUploading] = useState<string | null>(null);
  const [cloudList, setCloudList] = useState<any[]>([]);
  const [showCloudList, setShowCloudList] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudDownloading, setCloudDownloading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [autoUploadEnabled, setAutoUploadEnabled] = useState(false);
  const [autoUploadChecked, setAutoUploadChecked] = useState(false);

  // Build set of cloud keys for sync status
  const cloudKeySet = new Set(cloudList.map((c: any) => c.key));

  const fetchBackups = useCallback(async () => {
    setLoading(true); setError("");
    try { setBackups((await api.get<any[]>(endpoint("/tools/backups"))) || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  // Fetch cloud config to check auto_upload setting
  useEffect(() => {
    api.get<any>(endpoint("/tools/backups/cloud-config"), { noToast: true })
      .then((cfg) => {
        if (cfg?.auto_upload) setAutoUploadEnabled(true);
      })
      .catch(() => {});
  }, [endpoint]);

  async function doCreateFileBackup() {
    setSubmitting(true);
    try {
      const result = await api.post<any>(endpoint("/tools/backups/file"), {
        source_path: sourcePath,
        name: backupName,
        auto_upload: autoUploadChecked,
      });
      if (result?.auto_uploaded) {
        toast.success(t("tools.backupSuccess") + " (" + t("tools.cloudUploadSuccess") + ")");
      } else if (result?.auto_uploaded === false) {
        toast.success(t("tools.backupSuccess") + " (" + t("tools.cloudUploadFailed") + ": " + (result.auto_upload_error || "") + ")");
      } else {
        toast.success(t("tools.backupSuccess"));
      }
      setDialogOpen(null);
      await fetchBackups();
    } catch (e) { toast.error(t("tools.backupFailed") + ": " + (e instanceof Error ? e.message : "")); }
    finally { setSubmitting(false); }
  }

  async function doCreateDBBackup() {
    setSubmitting(true);
    try {
      const result = await api.post<any>(endpoint("/tools/backups/db"), {
        db_type: dbType,
        name: backupName,
        auto_upload: autoUploadChecked,
      });
      if (result?.auto_uploaded) {
        toast.success(t("tools.backupSuccess") + " (" + t("tools.cloudUploadSuccess") + ")");
      } else if (result?.auto_uploaded === false) {
        toast.success(t("tools.backupSuccess") + " (" + t("tools.cloudUploadFailed") + ": " + (result.auto_upload_error || "") + ")");
      } else {
        toast.success(t("tools.backupSuccess"));
      }
      setDialogOpen(null);
      await fetchBackups();
    } catch (e) { toast.error(t("tools.backupFailed") + ": " + (e instanceof Error ? e.message : "")); }
    finally { setSubmitting(false); }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const name = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete(endpoint("/tools/backups"), { name });
      toast.success(t("common.save"));
      await fetchBackups();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function doRestore(name: string) {
    setRestoring(name);
    try {
      await api.post(endpoint("/tools/backups/restore"), { name });
      toast.success(t("tools.restoreSuccess"));
    } catch (e) { toast.error(t("tools.restoreFailed") + ": " + (e instanceof Error ? e.message : "")); }
    finally { setRestoring(null); }
  }

  async function doCloudUpload(name: string) {
    setCloudUploading(name);
    try {
      await api.post(endpoint("/tools/backups/cloud/upload"), { name });
      toast.success(t("tools.cloudUploadSuccess"));
      await fetchCloudList();
    } catch (e) { toast.error((e instanceof Error ? e.message : "")); }
    finally { setCloudUploading(null); }
  }

  async function doCloudDownload(name: string) {
    setCloudDownloading(name);
    try {
      await api.post(endpoint("/tools/backups/cloud/download"), { name });
      toast.success(t("tools.cloudDownloadSuccess"));
      await fetchBackups();
    } catch (e) { toast.error((e instanceof Error ? e.message : "")); }
    finally { setCloudDownloading(null); }
  }

  async function doCloudDelete(name: string) {
    try {
      await api.delete(endpoint("/tools/backups/cloud"), { name });
      toast.success(t("common.save"));
      await fetchCloudList();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function fetchCloudList() {
    setCloudLoading(true);
    try {
      setCloudList((await api.get<any[]>(endpoint("/tools/backups/cloud/list"), { noToast: true })) || []);
    } catch {
      setCloudList([]);
    } finally {
      setCloudLoading(false);
    }
  }

  async function toggleCloudList() {
    const next = !showCloudList;
    setShowCloudList(next);
    if (next) await fetchCloudList();
  }

  async function doSyncAll() {
    setSyncing(true);
    try {
      const result = await api.post<any>(endpoint("/tools/backups/cloud/sync"));
      if (result?.output) {
        toast.success(result.output);
      } else {
        toast.success(t("tools.cloudSyncSuccess"));
      }
      await fetchCloudList();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  function openDialog(type: "file" | "db") {
    setDialogOpen(type);
    setBackupName("");
    setSourcePath("");
    setDbType("mysql");
    setAutoUploadChecked(autoUploadEnabled);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3 flex-wrap">
        <Button size="sm" onClick={() => openDialog("file")}>
          <HardDrive className="w-4 h-4 mr-1" />{t("tools.createFileBackup")}
        </Button>
        <Button size="sm" onClick={() => openDialog("db")}>
          <Database className="w-4 h-4 mr-1" />{t("tools.createDBBackup")}
        </Button>
        <Button size="sm" variant="outline" onClick={fetchBackups}>
          <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />{t("tools.refresh")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCloudConfigOpen(true)}>
          <Cloud className="w-4 h-4 mr-1" />{t("tools.configureCloud")}
        </Button>
        <Button size="sm" variant="outline" onClick={doSyncAll} disabled={syncing}>
          <CloudUpload className={cn("w-4 h-4 mr-1", syncing && "animate-spin")} />{syncing ? t("tools.cloudSyncing") : t("tools.cloudSyncAll")}
        </Button>
        <Button size="sm" variant="outline" onClick={toggleCloudList}>
          <Cloud className={cn("w-4 h-4 mr-1", showCloudList && "text-blue-500")} />{showCloudList ? t("tools.cloudHide") : t("tools.cloudShow")}
        </Button>
      </div>

      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : backups.length === 0 ? (
        <EmptyState icon={HardDrive} title={t("tools.noBackups")} description={t("tools.noBackupsDesc")} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3">{t("tools.backupName")}</th>
                <th className="text-left p-3">{t("tools.backupType")}</th>
                <th className="text-left p-3">{t("tools.backupSize")}</th>
                <th className="text-left p-3">{t("tools.backupCreated")}</th>
                <th className="text-left p-3">Cloud</th>
                <th className="text-right p-3">{t("tools.serviceControl")}</th>
              </tr></thead>
              <tbody>
                {backups.map((b) => {
                  const isSynced = cloudKeySet.has(b.name);
                  return (
                    <tr key={b.name} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{b.name}</td>
                      <td className="p-3">
                        <Badge variant={b.type === "db" ? "default" : "secondary"} className="text-xs">
                          {b.type === "db" ? t("tools.backupDB") : t("tools.backupFile")}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{formatSize(b.size)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString()}</td>
                      <td className="p-3">
                        {isSynced ? (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                            <CheckCircle2 className="w-3 h-3 mr-1 inline" />{t("tools.cloudSynced")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            <CloudOff className="w-3 h-3 mr-1 inline" />{t("tools.cloudNotSynced")}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          {b.type === "file" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doRestore(b.name)} disabled={restoring === b.name}>
                              <RotateCcw className={cn("w-3 h-3 mr-1", restoring === b.name && "animate-spin")} />{t("tools.restoreBackup")}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doCloudUpload(b.name)} disabled={cloudUploading === b.name || isSynced}>
                            <CloudUpload className={cn("w-3 h-3 mr-1", cloudUploading === b.name && "animate-spin")} />{cloudUploading === b.name ? t("tools.cloudUploading") : t("tools.cloudUpload")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setDeleteTarget(b.name)}>
                            <Trash2 className="w-3 h-3 mr-1" />{t("tools.deleteBackup")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Cloud Backups List */}
      {showCloudList && (
        <Card>
          <CardContent className="p-0">
            {cloudLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : cloudList.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">{t("tools.cloudNoBackups")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3">{t("tools.backupName")}</th>
                  <th className="text-left p-3">{t("tools.backupSize")}</th>
                  <th className="text-left p-3">{t("tools.backupCreated")}</th>
                  <th className="text-right p-3">{t("tools.serviceControl")}</th>
                </tr></thead>
                <tbody>
                  {cloudList.map((obj: any) => (
                    <tr key={obj.key} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{obj.key}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatSize(obj.size)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(obj.last_modified).toLocaleString()}</td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => doCloudDownload(obj.key)} disabled={cloudDownloading === obj.key}>
                            <CloudDownload className={cn("w-3 h-3 mr-1", cloudDownloading === obj.key && "animate-spin")} />{t("tools.cloudDownload")}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => doCloudDelete(obj.key)}>
                            <Trash2 className="w-3 h-3 mr-1" />{t("tools.deleteBackup")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create File Backup Dialog */}
      <Dialog open={dialogOpen === "file"} onOpenChange={(open) => { if (!open) setDialogOpen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tools.createFileBackup")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("tools.backupName")}</label>
              <Input value={backupName} onChange={(e) => setBackupName(e.target.value)} placeholder={t("tools.backupNamePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("tools.sourcePath")}</label>
              <Input value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder={t("tools.sourcePathPlaceholder")} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <label className="text-sm cursor-pointer">{t("tools.backupAutoUpload")}</label>
              <Switch checked={autoUploadChecked} onCheckedChange={setAutoUploadChecked} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(null)}>{t("tools.cancel")}</Button>
            <Button onClick={doCreateFileBackup} disabled={submitting || !sourcePath || !backupName}>
              {submitting ? t("tools.creating") : t("tools.createFileBackup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create DB Backup Dialog */}
      <Dialog open={dialogOpen === "db"} onOpenChange={(open) => { if (!open) setDialogOpen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tools.createDBBackup")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("tools.backupName")}</label>
              <Input value={backupName} onChange={(e) => setBackupName(e.target.value)} placeholder={t("tools.backupNamePlaceholder")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("tools.databaseType")}</label>
              <Select value={dbType} onValueChange={(v) => setDbType(v || "mysql")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mysql">{t("tools.databaseMySQL")}</SelectItem>
                  <SelectItem value="postgresql">{t("tools.databasePostgreSQL")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <label className="text-sm cursor-pointer">{t("tools.backupAutoUpload")}</label>
              <Switch checked={autoUploadChecked} onCheckedChange={setAutoUploadChecked} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(null)}>{t("tools.cancel")}</Button>
            <Button onClick={doCreateDBBackup} disabled={submitting || !backupName}>
              {submitting ? t("tools.creating") : t("tools.createDBBackup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={t("tools.deleteBackup")}
        description={t("tools.backupDeleteConfirm", { name: deleteTarget || "" })}
        confirmLabel={t("tools.deleteBackup")}
        onConfirm={doDelete}
        variant="destructive"
      />

      {/* Cloud Backup Config Dialog */}
      <CloudBackupConfigDialog
        open={cloudConfigOpen}
        onOpenChange={setCloudConfigOpen}
        endpoint={endpoint}
        t={t}
      />
    </div>
  );
}