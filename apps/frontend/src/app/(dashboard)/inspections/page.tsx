"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Plus, Loader2, Trash2, RefreshCw, Sparkles, CircleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers, useInspectionReports, type InspectionReport } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function scoreColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  return "text-red-500";
}

function statusBadge(r: InspectionReport) {
  if (r.status === "running") return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 border"><Loader2 className="h-3 w-3 animate-spin mr-1" />生成中</Badge>;
  if (r.status === "failed") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border">失败</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">完成</Badge>;
}

export default function InspectionsPage() {
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);
  const { data: reports, isLoading, refetch } = useInspectionReports(current?.id);
  const queryClient = useQueryClient();

  const [genOpen, setGenOpen] = useState(false);
  const [serverId, setServerId] = useState("");
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("24");
  const [genLoading, setGenLoading] = useState(false);

  const onlineServers = (servers || []).filter((s) => s.isOnline);

  async function doGenerate() {
    if (!current?.id || !serverId) {
      toast.error("请先选择要巡检的服务器");
      return;
    }
    setGenLoading(true);
    try {
      const res = await api.post<{ id: string }>(`/workspaces/${current.id}/servers/${serverId}/inspections`, {
        title: title.trim() || undefined,
        hours: parseInt(hours, 10) || 24,
      });
      toast.success("AI 巡检已启动，报告生成中…");
      setGenOpen(false);
      setTitle("");
      refetch();
      window.setTimeout(() => { window.location.href = `/inspections/${res.id}`; }, 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenLoading(false);
    }
  }

  async function doDelete(id: string) {
    if (!current?.id) return;
    if (!window.confirm("确定删除这份巡检报告？")) return;
    try {
      await api.delete(`/workspaces/${current.id}/inspections/${id}`);
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />AI 巡检报告
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            基于近 24 小时遥测数据与 Agent 实时诊断，由 AI 生成健康评分与风险报告
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />刷新
          </Button>
          <Button size="sm" onClick={() => { setServerId(""); setTitle(""); setGenOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />生成巡检报告
          </Button>
        </div>
      </div>

      {isLoading ? <PageSkeleton /> : (reports || []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="还没有巡检报告"
          description="点击右上角「生成巡检报告」，AI 将自动采集指标并分析服务器健康状况。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(reports || []).map((r) => (
            <Link key={r.id} href={`/inspections/${r.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-emerald-500/40">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug line-clamp-2">{r.title}</CardTitle>
                    {statusBadge(r)}
                  </div>
                  <CardDescription className="text-xs">
                    {new Date(r.createdAt).toLocaleString("zh-CN")} · 来源：{r.trigger === "schedule" ? "每日定时" : "手动生成"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className={`text-3xl font-bold ${scoreColor(r.healthScore)}`}>
                      {r.healthScore ?? "—"}
                      <span className="text-xs font-normal text-muted-foreground ml-1">/100</span>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-col gap-0.5">
                      <span>发现 {(r.findings || []).length} 项</span>
                      {(r.findings || []).some((f) => f.level === "error") && (
                        <span className="text-red-400 flex items-center gap-1"><CircleAlert className="h-3 w-3" />含故障项</span>
                      )}
                    </div>
                  </div>
                  {r.summary && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{r.summary}</p>}
                  {r.error && <p className="text-xs text-red-400 mt-2 line-clamp-2">{r.error}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{(r.findings || []).filter((f) => f.level === "warning").length} 项风险</span>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); doDelete(r.id); }}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成 AI 巡检报告</DialogTitle>
            <DialogDescription>
              AI 将采集近 24 小时遥测指标与告警、探测数据，并通过 Agent 执行只读诊断命令后给出健康评分与建议。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>巡检服务器</Label>
              <Select value={serverId} onValueChange={(v) => { if (v) setServerId(v); }}>
                <SelectTrigger><SelectValue placeholder="选择在线服务器" /></SelectTrigger>
                <SelectContent>
                  {onlineServers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  {onlineServers.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">暂无可用的在线服务器</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>报告标题（可选）</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：生产服务器健康体检" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>指标分析窗口</Label>
              <Select value={hours} onValueChange={(v) => { if (v) setHours(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">近 6 小时</SelectItem>
                  <SelectItem value="24">近 24 小时</SelectItem>
                  <SelectItem value="72">近 3 天</SelectItem>
                  <SelectItem value="168">近 7 天</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>取消</Button>
            <Button onClick={doGenerate} disabled={genLoading || onlineServers.length === 0}>
              {genLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {genLoading ? "AI 分析中…" : "开始巡检"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
