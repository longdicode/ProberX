"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, ApiError } from "@/lib/api-client";
import { API_BASE_URL } from "@/lib/constants";
import { getToken } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { Folder, FolderOpen, FileText, Upload, ChevronRight, ChevronDown, Trash2, FolderPlus, Download, Eye, Pencil, FileCode2, FileJson, FileImage, FileArchive, ArrowUpDown, Clipboard } from "lucide-react";
import { toast } from "sonner";

interface FileEntry {
  name: string;
  size: number;
  is_dir: boolean;
  mod_time: number;
  permissions: string;
}

interface Preview {
  name: string;
  content: string;
  isBinary: boolean;
  size: number;
}

const extIconMap: Record<string, { Icon: typeof FileText; color: string }> = {
  ts: { Icon: FileCode2, color: "text-blue-400" }, tsx: { Icon: FileCode2, color: "text-blue-400" },
  js: { Icon: FileCode2, color: "text-yellow-400" }, jsx: { Icon: FileCode2, color: "text-yellow-400" },
  py: { Icon: FileCode2, color: "text-green-400" }, go: { Icon: FileCode2, color: "text-cyan-400" },
  rs: { Icon: FileCode2, color: "text-orange-400" }, java: { Icon: FileCode2, color: "text-red-400" },
  json: { Icon: FileJson, color: "text-yellow-500" }, yaml: { Icon: FileJson, color: "text-yellow-500" }, yml: { Icon: FileJson, color: "text-yellow-500" },
  png: { Icon: FileImage, color: "text-purple-400" }, jpg: { Icon: FileImage, color: "text-purple-400" }, jpeg: { Icon: FileImage, color: "text-purple-400" },
  svg: { Icon: FileImage, color: "text-purple-400" }, gif: { Icon: FileImage, color: "text-purple-400" },
  zip: { Icon: FileArchive, color: "text-amber-400" }, tar: { Icon: FileArchive, color: "text-amber-400" }, gz: { Icon: FileArchive, color: "text-amber-400" },
  sh: { Icon: FileCode2, color: "text-green-300" }, bash: { Icon: FileCode2, color: "text-green-300" },
  env: { Icon: FileJson, color: "text-slate-400" }, toml: { Icon: FileJson, color: "text-slate-400" },
};

function getFileIcon(name: string): { Icon: typeof FileText; color: string } {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : "";
  return extIconMap[ext] ?? { Icon: FileText, color: "text-muted-foreground" };
}

export function FileManager({ serverId }: { serverId: string }) {
  const { t } = useLocale();
  const current = useWorkspaceStore((s) => s.current);
  const wid = current?.id;
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "size" | "time">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [renameTarget, setRenameTarget] = useState<{ name: string; isDir: boolean } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const loadDir = useCallback(async (path: string) => {
    if (!wid) return;
    setLoading(true);
    try {
      const data = await api.get<FileEntry[]>(
        `/workspaces/${wid}/servers/${serverId}/files/list`,
        { params: { path } }
      );
      setEntries(data);
      setCurrentPath(path);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to list directory");
    } finally {
      setLoading(false);
    }
  }, [wid, serverId]);

  useEffect(() => {
    loadDir("/");
  }, [loadDir]);

  const breadcrumbs = (() => {
    if (currentPath === "/") return [{ label: "/", path: "/" }];
    const parts = currentPath.split("/").filter(Boolean);
    const crumbs = [{ label: "/", path: "/" }];
    let built = "";
    for (const part of parts) {
      built += "/" + part;
      crumbs.push({ label: part, path: built });
    }
    return crumbs;
  })();

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "size") cmp = a.size - b.size;
    else if (sortBy === "time") cmp = a.mod_time - b.mod_time;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(col: "name" | "size" | "time") {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  }

  function toggleSelect(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
  }

  async function handleDelete() {
    if (!wid || !deleteTargets) return;
    const token = getToken();
    for (const name of deleteTargets) {
      const fullPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      try {
        await fetch(`${API_BASE_URL}/workspaces/${wid}/servers/${serverId}/files/delete`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ path: fullPath }),
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("servers.filesDeleteFailed"));
      }
    }
    setDeleteTargets(null);
    loadDir(currentPath);
  }

  async function handleCreateFolder() {
    if (!wid || !newFolderName.trim()) return;
    const fullPath = currentPath === "/" ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;
    const token = getToken();
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${wid}/servers/${serverId}/files/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ path: fullPath }),
      });
      if (!res.ok) throw new Error();
      setNewFolderName("");
      setNewFolderOpen(false);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("servers.filesCreateFolderFailed"));
    }
  }

  async function handleFileClick(entry: FileEntry) {
    const fullPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    if (entry.is_dir) {
      loadDir(fullPath);
      return;
    }
    try {
      const res = await api.get<{ content: string; size: number; is_binary: boolean }>(
        `/workspaces/${wid}/servers/${serverId}/files/read`,
        { params: { path: fullPath } }
      );
      setPreview({ name: entry.name, content: res.content, isBinary: res.is_binary, size: res.size });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to read file");
    }
  }

  async function handleDownload(entry: FileEntry) {
    const fullPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    const token = getToken();
    try {
      const res = await fetch(
        `${API_BASE_URL}/workspaces/${wid}/servers/${serverId}/files/download?path=${encodeURIComponent(fullPath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("servers.filesDownloadFailed"));
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!wid || files.length === 0) return;
    const token = getToken();
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append("file", files[i]);
      try {
        const res = await fetch(
          `${API_BASE_URL}/workspaces/${wid}/servers/${serverId}/files/upload?path=${encodeURIComponent(currentPath)}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData }
        );
        if (!res.ok) throw new Error();
        ok++;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("servers.filesUploadFailed"));
      }
    }
    if (ok > 0) toast.success(`Uploaded ${ok} file(s)`);
    loadDir(currentPath);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) await uploadFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); }
  }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false); dragCounter.current = 0;
    if (e.dataTransfer.files.length > 0) await uploadFiles(e.dataTransfer.files);
  }

  async function handleCopyPath(entry: FileEntry) {
    const fullPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    try {
      await navigator.clipboard.writeText(fullPath);
      toast.success("Path copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  function handleContextMenu(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Delete" && selected.size > 0) {
      setDeleteTargets(Array.from(selected));
    } else if (e.key === "F2" && selected.size === 1) {
      const name = Array.from(selected)[0];
      const entry = entries.find(x => x.name === name);
      if (entry) { setRenameTarget({ name: entry.name, isDir: entry.is_dir }); setRenameName(entry.name); }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      if (entries.length > 0) setSelected(new Set(entries.map(x => x.name)));
    } else if (e.key === "Escape") {
      setContextMenu(null); setSelected(new Set());
    }
  }

  // Close context menu on click outside
  useEffect(() => {
    function close() { setContextMenu(null); }
    if (contextMenu) { window.addEventListener("click", close); window.addEventListener("scroll", close, true); }
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [contextMenu]);

  async function handleRename() {
    if (!wid || !renameTarget || !renameName.trim()) return;
    const oldPath = currentPath === "/" ? `/${renameTarget.name}` : `${currentPath}/${renameTarget.name}`;
    const newName = renameName.trim();
    if (newName === renameTarget.name) { setRenameTarget(null); return; }
    setRenaming(true);
    try {
      await api.post(`/workspaces/${wid}/servers/${serverId}/files/rename`, { path: oldPath, newName });
      setRenameTarget(null);
      loadDir(currentPath);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Rename failed");
    } finally { setRenaming(false); }
  }

  return (
    <div className="flex gap-4">
      {/* Folder tree sidebar */}
      <div className="hidden md:block w-56 shrink-0">
        <Card className="border-border/50">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-medium uppercase text-muted-foreground">Folders</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[60vh] overflow-auto">
            {["/home", "/var", "/etc", "/opt", "/tmp"].map((p) => (
              <FolderTreeNode
                key={p}
                label={p}
                path={p}
                serverId={serverId}
                wid={wid}
                currentPath={currentPath}
                onNavigate={(path) => loadDir(path)}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Main file browser */}
      <div className="flex-1 min-w-0 relative">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.path} className="flex items-center gap-1">
                    {i > 0 && <span>/</span>}
                    {i === breadcrumbs.length - 1 ? (
                      <span className="text-foreground font-medium">{crumb.label}</span>
                    ) : (
                      <button
                        onClick={() => loadDir(crumb.path)}
                        className="hover:text-foreground hover:underline"
                      >
                        {crumb.label}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleUpload}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {t("servers.filesUpload")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="w-3.5 h-3.5 mr-1.5" />
                {t("servers.filesNewFolder")}
              </Button>
              {selected.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteTargets(Array.from(selected))}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {t("servers.filesDelete")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent
            className={`p-0 relative ${dragOver ? "ring-2 ring-primary ring-inset" : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onKeyDown={handleKeyDown}
            ref={containerRef}
            tabIndex={0}
          >
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">{t("common.loading")}</div>
            ) : entries.length === 0 ? (
              <div className="py-12">
                <EmptyState icon={Folder} title={t("servers.filesEmptyDir")} description="" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="w-10 py-2 pl-4 text-left">
                      <input
                        type="checkbox"
                        className="rounded"
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(entries.map((en) => en.name)));
                          else setSelected(new Set());
                        }}
                        checked={selected.size === entries.length && entries.length > 0}
                      />
                    </th>
                    <th className="text-left py-2 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("name")}>
                      <span className="inline-flex items-center gap-1">
                        {t("servers.filesName")}
                        {sortBy === "name" ? <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span> : <ArrowUpDown className="w-3 h-3" />}
                      </span>
                    </th>
                    <th className="text-right py-2 font-medium text-muted-foreground w-24 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("size")}>
                      <span className="inline-flex items-center gap-1">
                        {t("servers.filesSize")}
                        {sortBy === "size" ? <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span> : <ArrowUpDown className="w-3 h-3" />}
                      </span>
                    </th>
                    <th className="text-right py-2 font-medium text-muted-foreground w-40 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("time")}>
                      <span className="inline-flex items-center gap-1">
                        {t("servers.filesModified")}
                        {sortBy === "time" ? <span className="text-xs">{sortDir === "asc" ? "▲" : "▼"}</span> : <ArrowUpDown className="w-3 h-3" />}
                      </span>
                    </th>
                    <th className="text-right py-2 font-medium text-muted-foreground w-28 pr-4">{t("servers.filesPermissions")}</th>
                    <th className="w-20 py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => (
                    <tr
                      key={entry.name}
                      className="border-b border-border/30 last:border-0 hover:bg-accent/50 cursor-pointer"
                      onDoubleClick={() => handleFileClick(entry)}
                      onContextMenu={(e) => handleContextMenu(e, entry)}
                    >
                      <td className="py-2 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selected.has(entry.name)}
                          onChange={() => toggleSelect(entry.name)}
                        />
                      </td>
                      <td className="py-2" onClick={() => handleFileClick(entry)}>
                        <div className="flex items-center gap-2">
                          {entry.is_dir ? (
                            <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                          ) : (
                            (() => { const fi = getFileIcon(entry.name); return <fi.Icon className={`w-4 h-4 ${fi.color} shrink-0`} />; })()
                          )}
                          <span className="truncate max-w-[300px]">{entry.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                        {entry.is_dir ? "--" : formatBytes(entry.size)}
                      </td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {new Date(entry.mod_time).toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-mono text-xs text-muted-foreground pr-4">
                        {entry.permissions}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          {!entry.is_dir && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleFileClick(entry); }}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title={t("servers.filesPreview")}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownload(entry); }}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title={t("servers.filesDownload")}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setRenameTarget({ name: entry.name, isDir: entry.is_dir }); setRenameName(entry.name); }}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            title={t("servers.filesRename")}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTargets([entry.name]); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title={t("servers.filesDelete")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 bg-primary/10 rounded-lg flex items-center justify-center pointer-events-none z-10">
            <div className="bg-background border-2 border-dashed border-primary rounded-lg px-6 py-4 text-sm font-medium">
              Drop files to upload
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-md shadow-lg py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.entry.is_dir && (
            <>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left" onClick={() => { handleFileClick(contextMenu.entry); setContextMenu(null); }}>
                <Eye className="w-3.5 h-3.5" /> {t("servers.filesPreview")}
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left" onClick={() => { handleDownload(contextMenu.entry); setContextMenu(null); }}>
                <Download className="w-3.5 h-3.5" /> {t("servers.filesDownload")}
              </button>
            </>
          )}
          <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left" onClick={() => { setRenameTarget({ name: contextMenu.entry.name, isDir: contextMenu.entry.is_dir }); setRenameName(contextMenu.entry.name); setContextMenu(null); }}>
            <Pencil className="w-3.5 h-3.5" /> {t("servers.filesRename")}
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left" onClick={() => { handleCopyPath(contextMenu.entry); setContextMenu(null); }}>
            <Clipboard className="w-3.5 h-3.5" /> Copy path
          </button>
          <div className="border-t border-border my-1" />
          <button className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-left" onClick={() => { setDeleteTargets([contextMenu.entry.name]); setContextMenu(null); }}>
            <Trash2 className="w-3.5 h-3.5" /> {t("servers.filesDelete")}
          </button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              {preview?.name}
              <span className="text-xs text-muted-foreground font-normal ml-2">
                {preview ? formatBytes(preview.size) : ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          {preview?.isBinary ? (
            <div className="py-8 text-center text-muted-foreground">{t("servers.filesBinaryFile")}</div>
          ) : (
            <pre className="overflow-auto text-xs bg-muted p-4 rounded-md max-h-[50vh] whitespace-pre-wrap break-all">
              {preview?.content}
            </pre>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>{t("common.cancel")}</Button>
            {preview && (
              <Button onClick={() => {
                const e = entries.find(x => x.name === preview!.name);
                if (e) handleDownload(e);
              }}>
                <Download className="w-4 h-4 mr-2" />
                {t("servers.filesDownload")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("servers.filesNewFolder")}</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t("servers.filesNewFolderName")}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("servers.filesRename")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleRename} disabled={renaming || !renameName.trim()}>
              {renaming ? "Saving..." : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTargets}
        onOpenChange={(open) => { if (!open) setDeleteTargets(null); }}
        title={t("servers.filesDeleteSelected")}
        description={t("servers.filesDeleteConfirm", { n: deleteTargets?.length ?? 0 })}
        confirmLabel={t("servers.filesDelete")}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}

function FolderTreeNode({
  label,
  path,
  serverId,
  wid,
  currentPath,
  onNavigate,
  depth = 0,
}: {
  label: string;
  path: string;
  serverId: string;
  wid: string | undefined;
  currentPath: string;
  onNavigate: (path: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isActive = currentPath === path || currentPath.startsWith(path + "/");

  async function toggle() {
    if (!expanded && !children) {
      setLoading(true);
      try {
        const data = await api.get<FileEntry[]>(`/workspaces/${wid}/servers/${serverId}/files/list`, { params: { path } });
        setChildren(data.filter((e) => e.is_dir));
      } catch { setChildren([]); } finally { setLoading(false); }
    }
    setExpanded(!expanded);
  }

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        onClick={() => { toggle(); onNavigate(path); }}
        className={`w-full flex items-center gap-1 py-1 px-3 text-xs hover:bg-accent ${
          isActive ? "bg-accent text-foreground font-medium" : "text-muted-foreground"
        }`}
      >
        {loading ? (
          <span className="w-3 h-3 inline-block animate-spin">&#9673;</span>
        ) : expanded ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </button>
      {expanded && children?.map((child) => (
        <FolderTreeNode
          key={child.name}
          label={child.name}
          path={path === "/" ? `/${child.name}` : `${path}/${child.name}`}
          serverId={serverId}
          wid={wid}
          currentPath={currentPath}
          onNavigate={onNavigate}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
