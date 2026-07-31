"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Globe, Plus, Trash2, Eye, EyeOff, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api-client";

interface StatusPage {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  theme: Record<string, unknown>;
  isPublished: boolean;
  createdAt: string;
}

interface Props {
  workspaceId: string;
}

export function StatusPageManager({ workspaceId: wid }: Props) {
  const queryClient = useQueryClient();

  const { data: pages, isLoading } = useQuery({
    queryKey: ["status-pages", wid],
    queryFn: () => api.get<StatusPage[]>(`/workspaces/${wid}/status-pages`),
    enabled: !!wid,
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StatusPage | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!wid || !name.trim() || !slug.trim()) return;
    setCreating(true);
    try {
      await api.post(`/workspaces/${wid}/status-pages`, {
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      });
      setName("");
      setSlug("");
      queryClient.invalidateQueries({ queryKey: ["status-pages", wid] });
    } catch { /* handled by api client */ }
    finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!wid || !deleteTarget) return;
    try {
      await api.delete(`/workspaces/${wid}/status-pages/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["status-pages", wid] });
    } catch { /* handled */ }
    finally { setDeleteTarget(null); }
  };

  const handleTogglePublish = async (page: StatusPage) => {
    if (!wid) return;
    setToggling(page.id);
    try {
      await api.patch(`/workspaces/${wid}/status-pages/${page.id}`, {
        isPublished: !page.isPublished,
      });
      queryClient.invalidateQueries({ queryKey: ["status-pages", wid] });
    } catch { /* handled */ }
    finally { setToggling(null); }
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/status/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  const getPublicUrl = (page: StatusPage) => {
    if (page.customDomain) return `https://${page.customDomain}`;
    return `${window.location.origin}/status/${page.slug}`;
  };

  return (
    <>
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" />
            公开状态页
          </CardTitle>
          <CardDescription>
            创建公开状态页，向用户展示服务器和服务的实时运行状态。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create form */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs">名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Status Page"
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-xs">Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, "-").toLowerCase())}
                placeholder="my-status"
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim() || !slug.trim()}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              创建
            </Button>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="py-4 text-sm text-muted-foreground">加载中...</div>
          ) : !pages || pages.length === 0 ? (
            <EmptyState
              icon={Globe}
              title="暂无状态页"
              description="创建一个公开状态页，向你的用户展示服务运行状态。"
            />
          ) : (
            <div className="space-y-2">
              {pages.map((page) => {
                const url = getPublicUrl(page);
                return (
                  <div
                    key={page.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{page.name}</span>
                        {page.isPublished ? (
                          <Badge variant="default" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
                            已发布
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            未发布
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <code className="text-xs">{url}</code>
                        <button
                          onClick={() => copyUrl(page.slug)}
                          className="hover:text-foreground transition-colors shrink-0"
                          title="复制链接"
                        >
                          {copied === page.slug ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={`/status/${page.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-foreground transition-colors shrink-0"
                          title="预览"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={page.isPublished}
                        onCheckedChange={() => handleTogglePublish(page)}
                        disabled={toggling === page.id}
                      />
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setDeleteTarget(page)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`删除状态页: ${deleteTarget?.name}`}
        description="此操作不可撤销。状态页公开链接将立即失效。"
        confirmLabel="删除"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </>
  );
}
