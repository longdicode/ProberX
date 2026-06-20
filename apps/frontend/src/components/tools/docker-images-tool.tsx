"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils";
import { RefreshCw, Download, Trash2, Eye, Search, AlertTriangle } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

interface ImageInfo {
  id: string;
  repo_tags: string[];
  repo_digests: string[];
  size: number;
  created: number;
  containers: number;
}

interface ImageInspectInfo {
  id: string;
  repo_tags: string[];
  size: number;
  created: string;
  architecture: string;
  os: string;
  author: string;
  labels: Record<string, string>;
  env: string[];
}

interface ImagePullResult {
  status: string;
  id?: string;
  error?: string;
}

interface ImagePruneResult {
  images_deleted: number;
  space_reclaimed: number;
}

function formatCreated(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DockerImagesTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  // Pull dialog
  const [pullOpen, setPullOpen] = useState(false);
  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ImageInfo | null>(null);

  // Inspect dialog
  const [inspectTarget, setInspectTarget] = useState<ImageInspectInfo | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Prune confirmation
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false);
  const [pruning, setPruning] = useState(false);

  const fetchImages = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await api.get<ImageInfo[]>(endpoint("/images"));
      setImages(res || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { fetchImages(); }, [fetchImages]);

  async function handlePull() {
    if (!pullName.trim()) return;
    setPulling(true);
    try {
      await api.post<ImagePullResult>(endpoint("/images/pull"), { name: pullName.trim() });
      toast.success(t("tools.pullSuccess"));
      setPullOpen(false);
      setPullName("");
      await fetchImages();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("tools.pullFailed")); }
    finally { setPulling(false); }
  }

  async function handleDelete(image: ImageInfo) {
    try {
      await api.delete(endpoint(`/images/${encodeURIComponent(image.id)}`));
      toast.success(`${t("tools.deleteImage")}: ${image.id}`);
      setDeleteTarget(null);
      await fetchImages();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleInspect(image: ImageInfo) {
    setInspectLoading(true);
    setInspectOpen(true);
    try {
      const res = await api.get<ImageInspectInfo>(endpoint(`/images/${encodeURIComponent(image.id)}/json`));
      setInspectTarget(res);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setInspectLoading(false); }
  }

  async function handlePrune() {
    setPruning(true);
    try {
      const res = await api.post<ImagePruneResult>(endpoint("/images/prune"));
      toast.success(t("tools.pruneSuccess", { n: res.images_deleted, size: formatBytes(res.space_reclaimed) }));
      setPruneConfirmOpen(false);
      await fetchImages();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setPruning(false); }
  }

  const filtered = images.filter((img) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return img.id.toLowerCase().includes(q) || img.repo_tags.some((t) => t.toLowerCase().includes(q));
  });

  const hasContainers = (c: number) => c > 0;

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />

      {loading ? <PageSkeleton /> : error ? <ErrorMsg msg={error} /> : (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("tools.filter") || "Filter..."}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 max-w-xs"
              />
            </div>
            <Button size="sm" variant="outline" onClick={fetchImages}>
              <RefreshCw className="w-4 h-4 mr-1" />{t("tools.refreshImages")}
            </Button>
            <Button size="sm" onClick={() => setPullOpen(true)}>
              <Download className="w-4 h-4 mr-1" />{t("tools.pullImage")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setPruneConfirmOpen(true)}>
              <AlertTriangle className="w-4 h-4 mr-1" />{t("tools.pruneImages")}
            </Button>
          </div>

          {/* Image table */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                {t("tools.noImages")}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3">{t("tools.imageID")}</th>
                      <th className="text-left p-3">{t("tools.imageTags")}</th>
                      <th className="text-right p-3">{t("tools.imageSize")}</th>
                      <th className="text-left p-3">{t("tools.imageCreated")}</th>
                      <th className="text-center p-3">{t("tools.imageContainers")}</th>
                      <th className="text-right p-3">{t("tools.serviceControl") || "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((img) => (
                      <tr key={img.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{img.id}</td>
                        <td className="p-3 text-xs">
                          {img.repo_tags && img.repo_tags.length > 0
                            ? img.repo_tags.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="mr-1 text-xs">{tag}</Badge>
                              ))
                            : <span className="text-muted-foreground">{t("tools.imagesNoTags")}</span>
                          }
                        </td>
                        <td className="p-3 text-right text-xs font-mono">{formatBytes(img.size)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{formatCreated(img.created)}</td>
                        <td className="p-3 text-center">
                          {img.containers > 0 ? (
                            <Badge variant="default" className="text-xs">{img.containers}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleInspect(img)}>
                              <Eye className="w-3 h-3 mr-1" />{t("tools.inspectImage")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive"
                              onClick={() => setDeleteTarget(img)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />{t("tools.deleteImage")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Inspect dialog */}
          <Dialog open={inspectOpen} onOpenChange={(open) => { if (!open) { setInspectOpen(false); setInspectTarget(null); } }}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("tools.inspectImage")}: {inspectTarget?.id || ""}</DialogTitle>
              </DialogHeader>
              {inspectLoading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
              ) : inspectTarget ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">{t("tools.imageID")}:</span> <span className="font-mono">{inspectTarget.id}</span></div>
                    <div><span className="text-muted-foreground">{t("tools.inspectArch")}:</span> {inspectTarget.architecture}</div>
                    <div><span className="text-muted-foreground">{t("tools.inspectOS")}:</span> {inspectTarget.os}</div>
                    <div><span className="text-muted-foreground">{t("tools.imageSize")}:</span> {formatBytes(inspectTarget.size)}</div>
                    <div><span className="text-muted-foreground">{t("tools.imageCreated")}:</span> {inspectTarget.created}</div>
                    <div><span className="text-muted-foreground">{t("tools.inspectAuthor")}:</span> {inspectTarget.author || "--"}</div>
                  </div>
                  {inspectTarget.repo_tags && inspectTarget.repo_tags.length > 0 && (
                    <div>
                      <span className="text-muted-foreground block mb-1">{t("tools.imageTags")}:</span>
                      <div className="flex flex-wrap gap-1">
                        {inspectTarget.repo_tags.map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {inspectTarget.labels && Object.keys(inspectTarget.labels).length > 0 && (
                    <div>
                      <span className="text-muted-foreground block mb-1">{t("tools.inspectLabels")}:</span>
                      <div className="bg-muted/30 rounded p-2 space-y-1 max-h-40 overflow-y-auto">
                        {Object.entries(inspectTarget.labels).map(([k, v]) => (
                          <div key={k} className="text-xs"><span className="font-mono">{k}</span>: {v}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {inspectTarget.env && inspectTarget.env.length > 0 && (
                    <div>
                      <span className="text-muted-foreground block mb-1">{t("tools.inspectEnv")}:</span>
                      <div className="bg-muted/30 rounded p-2 space-y-1 max-h-40 overflow-y-auto">
                        {inspectTarget.env.map((e, i) => (
                          <div key={i} className="text-xs font-mono">{e}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-destructive">{t("tools.inspectImage")} failed</div>
              )}
            </DialogContent>
          </Dialog>

          {/* Pull dialog */}
          <Dialog open={pullOpen} onOpenChange={setPullOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("tools.pullImage")}</DialogTitle>
                <DialogDescription>
                  {t("tools.pullImagePlaceholder")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder={t("tools.pullImagePlaceholder")}
                  value={pullName}
                  onChange={(e) => setPullName(e.target.value)}
                  disabled={pulling}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setPullOpen(false); setPullName(""); }} disabled={pulling}>
                    {t("tools.cancel")}
                  </Button>
                  <Button onClick={handlePull} disabled={pulling || !pullName.trim()}>
                    {pulling ? t("tools.pulling") : t("tools.pullImage")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation dialog */}
          <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("tools.deleteImage")}</DialogTitle>
                <DialogDescription>
                  {deleteTarget && t("tools.deleteImageDesc", { id: deleteTarget.id })}
                </DialogDescription>
              </DialogHeader>
              {deleteTarget && hasContainers(deleteTarget.containers) && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  {t("tools.deleteImageInUse", { n: deleteTarget.containers })}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  {t("tools.cancel")}
                </Button>
                <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
                  {t("tools.deleteImage")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Prune confirmation dialog */}
          <Dialog open={pruneConfirmOpen} onOpenChange={setPruneConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("tools.pruneImages")}</DialogTitle>
                <DialogDescription>
                  {t("tools.pruneImagesDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPruneConfirmOpen(false)} disabled={pruning}>
                  {t("tools.cancel")}
                </Button>
                <Button variant="destructive" onClick={handlePrune} disabled={pruning}>
                  {pruning ? t("common.loading") : t("tools.pruneImages")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
