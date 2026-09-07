"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Workflow, Plus, Loader2, Trash2, RefreshCw, CircleAlert, CheckCircle2, Square, BarChart3, FileText, FileCode2, FileType } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useServers, useDiagnoses, type DiagnosisRun } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const GOAL_TEMPLATES = [
  "磁盘空间不足，服务器快满了",
  "CPU 使用率持续过高",
  "网站访问出现 504 网关超时",
  "某服务异常，无法正常访问",
  "内存占用过高，怀疑有泄漏",
];

function statusBadge(r: DiagnosisRun) {
  if (r.status === "running")
    return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 border"><Loader2 className="h-3 w-3 animate-spin mr-1" />排查中</Badge>;
  if (r.status === "failed")
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border">失败</Badge>;
  if (r.status === "stopped")
    return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 border">已停止</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">已完成</Badge>;
}

function confColor(c: number | null) {
  if (c == null) return "text-muted-foreground";
  if (c >= 80) return "text-emerald-500";
  if (c >= 60) return "text-amber-500";
  return "text-red-500";
}

interface WeeklyReport {
  windowDays: number;
  since: string;
  until: string;
  scope: string;
  runCount: number;
  byStatus: Record<string, number>;
  autoCount: number;
  totalSteps: number;
  avgSteps: number;
  totalRepairs: number;
  totalRollbacks: number;
  totalRechecks: number;
  recoveredCount: number;
  stillFailingCount: number;
  savedMinEstimate: number;
  rootTopics: { text: string; count: number }[];
  servers: { id: string; name: string; runCount: number }[];
  prevRunCount: number;
  prevSuccessCount: number;
  prevFailedCount: number;
  diskForecasts: { serverId: string; serverName: string; usedPct: number; growthPerDayPct: number; etaDays: number | null }[];
  cpuTrends: { serverId: string; serverName: string; olderAvgPct: number; newerAvgPct: number }[];
  uptimeTotal: number;
  uptimeOk: number;
  uptimePct: number | null;
  uptimePrevPct: number | null;
  trendText: string;
  markdown: string;
  generatedAt: string;
}

function metric(label: string, value: string | number, cls = "text-foreground") {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function TrendChips({ w }: { w: WeeklyReport }) {
  const chips: { text: string; cls: string }[] = [];
  if (w.prevRunCount > 0) {
    const delta = w.runCount - w.prevRunCount;
    const pct = Math.round((delta / w.prevRunCount) * 100);
    const sign = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
    chips.push({
      text: `排查环比上周期 ${sign(delta)}（${pct >= 0 ? "+" : ""}${pct}%）`,
      cls: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    });
  }
  const warn = w.diskForecasts.find((f) => f.etaDays != null && f.etaDays <= 30);
  if (warn && warn.etaDays != null) {
    chips.push({
      text: `磁盘预警：${warn.serverName} 约 ${warn.etaDays} 天后写满（当前 ${warn.usedPct}%）`,
      cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    });
  } else if (w.diskForecasts.length > 0) {
    const top = w.diskForecasts[0];
    chips.push({
      text: top.etaDays != null
        ? `${top.serverName} 预计 ${top.etaDays} 天后写满`
        : `${top.serverName} 磁盘增长可控（${top.usedPct}%）`,
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    });
  }
  if (w.uptimePct != null) {
    chips.push({
      text: `外网可用率 ${w.uptimePct}%${w.uptimePrevPct != null ? `（上周期 ${w.uptimePrevPct}%）` : ""}`,
      cls: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <span key={i} className={`text-xs px-2 py-1 rounded-full border ${c.cls}`}>{c.text}</span>
      ))}
    </div>
  );
}

export default function DiagnosesPage() {
  const { current } = useWorkspaceStore();
  const { data: servers } = useServers(current?.id);
  const { data: runs, isLoading, refetch } = useDiagnoses(current?.id);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [serverId, setServerId] = useState("");
  const [goal, setGoal] = useState("");
  const [starting, setStarting] = useState(false);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyTab, setWeeklyTab] = useState<"week" | "runs">("week");
  const [weeklyExporting, setWeeklyExporting] = useState<string | null>(null);

  const onlineServers = (servers || []).filter((s) => s.isOnline);

  async function doStart() {
    if (!current?.id || !serverId) {
      toast.error("请先选择要排查的服务器");
      return;
    }
    if (goal.trim().length < 4) {
      toast.error("请描述要排查的问题（至少 4 个字）");
      return;
    }
    setStarting(true);
    try {
      const res = await api.post<{ id: string; status: string }>(
        `/workspaces/${current.id}/servers/${serverId}/diagnoses`,
        { goal: goal.trim() }
      );
      toast.success("自主排查已启动，AI 正在多步取证定位根因…");
      setOpen(false);
      setGoal("");
      refetch();
      window.setTimeout(() => { window.location.href = `/diagnoses/${res.id}`; }, 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "启动失败");
    } finally {
      setStarting(false);
    }
  }

  async function doDelete(id: string) {
    if (!current?.id) return;
    if (!window.confirm("确定删除这次排查记录？")) return;
    try {
      await api.delete(`/workspaces/${current.id}/diagnoses/${id}`);
      queryClient.invalidateQueries({ queryKey: ["diagnoses"] });
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function loadWeekly() {
    if (!current?.id) return;
    setWeeklyLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${current.id}/reports/weekly?days=7`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`周报加载失败 (${res.status})`);
      const data = (await res.json()) as WeeklyReport;
      setWeekly(data.runCount > 0 ? data : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "周报加载失败");
      setWeekly(null);
    } finally {
      setWeeklyLoading(false);
    }
  }

  async function downloadWeekly(kind: "md" | "docx") {
    if (!current?.id || !weekly) return;
    setWeeklyExporting(kind);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${current.id}/reports/weekly/${kind}?days=7`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`导出失败 (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proberx-weekly-7d.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已开始下载");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setWeeklyExporting(null);
    }
  }

  function showWeek() {
    setWeeklyTab("week");
    if (!weekly && !weeklyLoading) loadWeekly();
  }

  useEffect(() => {
    if (current?.id && weeklyTab === "week" && !weekly && !weeklyLoading) loadWeekly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-5 w-5 text-violet-400" />自主排查
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI 自主编排多步排查闭环：规划 → 执行只读取证 → 反思调整 → 定位根因
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetch(); if (weeklyTab === "week") loadWeekly(); }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />刷新
          </Button>
          {weeklyTab === "week" ? (
            <Button variant="outline" size="sm" onClick={loadWeekly} disabled={weeklyLoading || !current?.id}>
              {weeklyLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              重新生成
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={showWeek}>
              <BarChart3 className="h-4 w-4 mr-1" />AI 运维周报
            </Button>
          )}
          <Button size="sm" onClick={() => { setServerId(""); setGoal(""); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />发起排查
          </Button>
        </div>
      </div>

      {weeklyTab === "week" && !isLoading && (
        weeklyLoading && !weekly ? (
          <Card>
            <CardContent className="pt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              AI 正在汇总近 7 天自主排查数据并生成运维周报…
            </CardContent>
          </Card>
        ) : weekly ? (
          <Card className="border-violet-500/30">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-5 w-5 text-violet-400" />
                <h2 className="text-base font-semibold">AI 运维周报</h2>
                <span className="text-xs text-muted-foreground">
                  最近 {weekly.windowDays} 天 · {new Date(weekly.since).toLocaleDateString("zh-CN")} ~ {new Date(weekly.until).toLocaleDateString("zh-CN")}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setWeeklyTab("runs")}>
                    <Workflow className="h-4 w-4 mr-1" />排查记录
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => loadWeekly()} disabled={weeklyLoading}>
                    {weeklyLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    重新生成
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadWeekly("md")} disabled={weeklyExporting !== null}>
                    {weeklyExporting === "md" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileCode2 className="h-4 w-4 mr-1" />}
                    导出 MD
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadWeekly("docx")} disabled={weeklyExporting !== null}>
                    {weeklyExporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileType className="h-4 w-4 mr-1" />}
                    导出 Word
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {metric("排查次数", weekly.runCount, "text-violet-400")}
                {metric("累计取证", `${weekly.totalSteps} 步`)}
                {metric("修复/回滚/复检", `${weekly.totalRepairs}/${weekly.totalRollbacks}/${weekly.totalRechecks}`)}
                {metric("预估节省", `约 ${weekly.savedMinEstimate} 分钟`, "text-emerald-500")}
              </div>
              <TrendChips w={weekly} />
              <div className="flex flex-wrap items-center gap-2">
                {weekly.autoCount > 0 && <Badge variant="outline" className="text-xs">自动触发 {weekly.autoCount} 次</Badge>}
                {weekly.recoveredCount > 0 && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">复检已恢复 {weekly.recoveredCount} 次</Badge>
                )}
                {weekly.stillFailingCount > 0 && (
                  <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border">仍异常 {weekly.stillFailingCount} 次</Badge>
                )}
                {weekly.servers.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    覆盖 {weekly.servers.length} 台服务器：{weekly.servers.map((s) => `${s.name} ×${s.runCount}`).join("、")}
                  </span>
                )}
              </div>
              {weekly.rootTopics.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">高频根因</p>
                  <div className="flex flex-wrap gap-1.5">
                    {weekly.rootTopics.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">
                        {t.text} ×{t.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b bg-muted/60">周报正文</p>
                <pre className="whitespace-pre-wrap font-mono text-xs p-3 max-h-96 overflow-y-auto text-foreground/90">
                  {weekly.markdown}
                </pre>
              </div>
            </CardContent>
          </Card>
        ) : (runs || []).length > 0 ? (
          <Card>
            <CardContent className="pt-4 pb-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                近 7 天暂无排查记录，暂无法生成 AI 运维周报。
              </p>
              <p className="text-xs mt-1">完成一次「自主排查」并定位根因后，AI 会自动汇总价值统计与周报。</p>
            </CardContent>
          </Card>
        ) : null
      )}

      {isLoading ? <PageSkeleton /> : (runs || []).length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="还没有排查记录"
          description="点击右上角「发起排查」，描述一个服务器问题，AI 会自动规划步骤、执行取证并定位根因。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(runs || []).map((r) => (
            <Link key={r.id} href={`/diagnoses/${r.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-violet-500/40 relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-red-400"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); doDelete(r.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <CardHeader className="pb-2 pt-4 pr-10">
                  <div className="flex items-center justify-between gap-2">
                    {statusBadge(r)}
                    {r.trigger === "auto" ? (
                      <Badge variant="outline" className="text-xs">自动触发</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">手动</Badge>
                    )}
                  </div>
                  <p className="font-semibold text-sm mt-2 line-clamp-2">{r.goal}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </p>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex items-center gap-4 text-sm">
                    {r.status === "success" ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />已定位
                        </span>
                        <span className={`ml-auto font-semibold ${confColor(r.confidence)}`}>
                          置信度 {r.confidence ?? "—"}%
                        </span>
                      </>
                    ) : r.status === "running" ? (
                      <span className="inline-flex items-center gap-1 text-blue-400">
                        <Loader2 className="h-4 w-4 animate-spin" />{r.steps?.length ?? 0} 步进行中
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Square className="h-3.5 w-3.5" />{r.status === "stopped" ? "已停止" : "失败"}
                      </span>
                    )}
                  </div>
                  {r.status === "success" && r.rootCause && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      根因：{r.rootCause}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-violet-400" />发起自主排查
            </DialogTitle>
            <DialogDescription>
              AI 将自动规划排查步骤，在目标服务器上执行只读命令取证，多轮收敛定位根因。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>目标服务器</Label>
              <Select value={serverId || undefined} onValueChange={(v) => { if (v) setServerId(v); }}>
                <SelectTrigger><SelectValue placeholder="选择在线服务器" /></SelectTrigger>
                <SelectContent>
                  {onlineServers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {onlineServers.length === 0 && (
                <p className="text-xs text-muted-foreground">没有在线服务器（Agent 离线时无法执行取证）</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>问题描述</Label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="例：网站访问出现 504 网关超时，怀疑后端服务异常"
                rows={3}
                className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              />
              <div className="flex flex-wrap gap-1.5">
                {GOAL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => setGoal(tpl)}
                    className="text-xs px-2 py-1 rounded-full border border-border text-muted-foreground hover:border-violet-500/50 hover:text-violet-400 transition-colors"
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={doStart} disabled={starting || onlineServers.length === 0}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CircleAlert className="h-4 w-4 mr-1" />}
              开始排查
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
