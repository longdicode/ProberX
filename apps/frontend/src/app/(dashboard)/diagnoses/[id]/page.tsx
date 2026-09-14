"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Square, Workflow, Terminal as TerminalIcon, RefreshCw,
  Lightbulb, ShieldCheck, Trash2, Sparkles, Download, FileType, FileText, Wrench, ShieldAlert, Undo2,
  History, Fingerprint, Clock3,
} from "lucide-react";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useDiagnosis, type DiagnosisRun, type DiagnosisStep } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

function statusBadge(r: DiagnosisRun) {
  if (r.status === "queued")
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 border"><Clock3 className="h-3 w-3 mr-1" />排队中</Badge>;
  if (r.status === "running")
    return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 border"><Loader2 className="h-3 w-3 animate-spin mr-1" />排查中</Badge>;
  if (r.status === "failed")
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border">失败</Badge>;
  if (r.status === "stopped")
    return <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 border">已停止</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">已完成</Badge>;
}

function StepCard({ step }: { step: DiagnosisStep }) {
  const ev = step.event ?? null;
  const Icon =
    step.status === "error" ? XCircle : step.status === "running" ? Loader2 : CheckCircle2;
  const color =
    step.status === "error" ? "text-red-400" : step.status === "running" ? "text-blue-400 animate-spin" : "text-emerald-400";
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/15 text-violet-400 text-xs font-bold">
          {step.index}
        </span>
        <code className="text-sm font-semibold px-2 py-0.5 rounded bg-muted">{step.tool}</code>
        {ev && ev.type && EVENT_META[ev.type] && (
          <Badge className={`border ${EVENT_META[ev.type].cls}`}>{EVENT_META[ev.type].label}</Badge>
        )}
        <Icon className={`h-4 w-4 ml-auto ${color}`} />
      </div>
      {ev?.detail && <p className="text-xs text-amber-200/80 mt-1.5">{ev.detail}</p>}
      {step.reason && <p className="text-sm text-muted-foreground mt-2">{step.reason}</p>}
      {step.command && (
        <pre className="text-xs bg-muted/60 rounded-md p-2 mt-2 overflow-x-auto font-mono">
          $ {step.command}
        </pre>
      )}
      {(step.stdout || step.stderr) && (
        <pre className={`text-xs rounded-md p-2 mt-2 overflow-x-auto max-h-56 overflow-y-auto font-mono ${step.status === "error" ? "bg-red-500/5 text-red-300" : "bg-muted/40"}`}>
          {step.stderr ? `[stderr] ${step.stderr}\n` : ""}{step.stdout || "（无输出）"}
        </pre>
      )}
      {step.judgment && (
        <p className="text-xs mt-2 flex gap-1.5 items-start">
          <Sparkles className="h-3.5 w-3.5 text-violet-400 mt-0.5 shrink-0" />
          <span className="text-muted-foreground">{step.judgment}</span>
        </p>
      )}
    </div>
  );
}

type RepairOption = {
  key: string;
  kind: string;
  title: string;
  detail: string;
  risk: "low" | "medium" | "high";
  command: string;
  rollback?: string;
  target: string;
};

const RISK_META: Record<RepairOption["risk"], { label: string; cls: string }> = {
  low: { label: "低风险", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  medium: { label: "中风险", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  high: { label: "高风险", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const EVENT_META: Record<string, { label: string; cls: string }> = {
  planner_retry: { label: "规划重试", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  tool_error: { label: "工具失败", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  adapt: { label: "自适应切换", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  gate_verify: { label: "证据复核", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
};

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  已恢复: { label: "复检：已恢复", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  仍异常: { label: "复检：仍异常", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  无法核实: { label: "复检：无法核实", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export default function DiagnosisDetailPage() {
  const params = useParams<{ id: string }>();
  const { current } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const { data: run, isLoading } = useDiagnosis(current?.id, params.id);
  const [stopping, setStopping] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [repairOptions, setRepairOptions] = useState<RepairOption[] | null>(null);
  const [repairingKey, setRepairingKey] = useState<string | null>(null);

  async function doStop() {
    if (!current?.id || !run) return;
    setStopping(true);
    try {
      await api.post(`/workspaces/${current.id}/diagnoses/${run.id}/stop`, {});
      toast.success("正在停止排查（当前步骤结束后生效）");
      queryClient.invalidateQueries({ queryKey: ["diagnosis", current.id, run.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "停止失败");
    } finally {
      setStopping(false);
    }
  }

  async function doDelete() {
    if (!current?.id || !run) return;
    if (!window.confirm("确定删除这次排查记录？")) return;
    try {
      await api.delete(`/workspaces/${current.id}/diagnoses/${run.id}`);
      window.location.href = "/diagnoses";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function download(kind: "pdf" | "docx") {
    if (!current?.id || !run) return;
    setExporting(kind);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${current.id}/diagnoses/${run.id}/${kind}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`下载失败 (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${run.title}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已开始下载");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下载失败");
    } finally {
      setExporting(null);
    }
  }

  async function doVerify() {
    if (!current?.id || !run) return;
    setVerifying(true);
    try {
      await api.post(`/workspaces/${current.id}/diagnoses/${run.id}/verify`, {});
      toast.success("复检完成，结果已追加到时间线");
      queryClient.invalidateQueries({ queryKey: ["diagnosis", current.id, run.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "复检失败");
    } finally {
      setVerifying(false);
    }
  }

  const loadRepairs = useCallback(async () => {
    if (!current?.id || !run?.id) return;
    try {
      const res = (await api.get(`/workspaces/${current.id}/diagnoses/${run.id}/repairs`)) as {
        options?: RepairOption[];
      };
      setRepairOptions(Array.isArray(res?.options) ? (res.options as RepairOption[]) : []);
    } catch {
      setRepairOptions([]);
    }
  }, [current?.id, run?.id]);

  useEffect(() => {
    if (run?.status === "success") loadRepairs();
    else setRepairOptions(null);
  }, [run?.status, loadRepairs]);

  async function doRepair(opt: RepairOption) {
    if (!current?.id || !run || repairingKey) return;
    let confirmed = false;
    if (opt.risk === "high") {
      const ans = window.prompt(`这是高风险操作，请输入 YES 确认执行：\n\n${opt.command}`);
      if (ans?.trim().toUpperCase() !== "YES") {
        toast.info("已取消高风险修复");
        return;
      }
      confirmed = true;
    } else if (!window.confirm(`确认执行修复？\n\n命令：${opt.command}\n\n${opt.detail}`)) {
      return;
    }
    setRepairingKey(opt.key);
    try {
      const res = (await api.post(`/workspaces/${current.id}/diagnoses/${run.id}/repairs/execute`, {
        key: opt.key,
        confirmed,
      })) as { steps?: unknown };
      queryClient.invalidateQueries({ queryKey: ["diagnosis", current.id, run.id] });
      loadRepairs();
      const sts = (Array.isArray(res?.steps) ? res.steps : []) as DiagnosisStep[];
      const lastRepair = [...sts].reverse().find((s) => (s.tool || "").startsWith("修复·"));
      if (lastRepair && lastRepair.status === "error") toast.error("修复执行失败，请查看时间线输出");
      else toast.success("修复已执行，自动复检结果已追加到时间线");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "修复执行失败");
      queryClient.invalidateQueries({ queryKey: ["diagnosis", current.id, run.id] });
      loadRepairs();
    } finally {
      setRepairingKey(null);
    }
  }

  if (isLoading) return <PageSkeleton />;
  if (!run) return null;

  const steps = Array.isArray(run.steps) ? (run.steps as DiagnosisStep[]) : [];
  const conf = run.confidence;
  const dynamicCount = steps.filter((s) => s.event).length;
  const repairCount = steps.filter((s) => (s.tool || "").startsWith("修复·")).length;
  const recheckCount = steps.filter((s) => (s.tool || "").startsWith("复检·")).length;
  const rollbackCount = steps.filter((s) => (s.tool || "").startsWith("回滚·")).length;
  const lastVerdictStep = [...steps].reverse().find((s) => (s.tool || "") === "复检结论");
  const verdictLabel = lastVerdictStep
    ? (/判定：(已恢复|仍异常|无法核实)/.exec(lastVerdictStep.stdout || "")?.[1] ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/diagnoses">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />返回</Button>
        </Link>
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-violet-400" />
          <h1 className="text-xl font-bold">自主排查</h1>
          {statusBadge(run)}
          {run.trigger === "auto" ? <Badge variant="outline" className="text-xs">自动触发</Badge> : <Badge variant="outline" className="text-xs">手动</Badge>}
        </div>
        <div className="ml-auto flex gap-2">
          {(run.status === "running" || run.status === "queued") && (
            <Button variant="outline" size="sm" onClick={doStop} disabled={stopping}>
              {stopping ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Square className="h-4 w-4 mr-1" />}{run.status === "queued" ? "取消" : "停止"}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={run.status === "running" || run.status === "queued" || exporting !== null}
            onClick={() => download("pdf")}>
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileType className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" disabled={run.status === "running" || run.status === "queued" || exporting !== null}
            onClick={() => download("docx")}>
            {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
            Word
          </Button>
          {run.status === "success" && (
            <Button variant="outline" size="sm" onClick={doVerify} disabled={verifying || exporting !== null}
              title="执行只读复检（端口/证书/访问），判定故障是否已恢复">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}复检
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-400" onClick={doDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base leading-relaxed">{run.goal}</CardTitle>
          <p className="text-xs text-muted-foreground">
            发起时间 {new Date(run.createdAt).toLocaleString("zh-CN")}
            {run.finishedAt ? ` · 完成于 ${new Date(run.finishedAt).toLocaleString("zh-CN")}` : ""}
            {run.steps?.length ? ` · 共 ${run.steps.length} 步取证` : ""}
          </p>
        </CardHeader>
      </Card>

      {run.status === "success" && run.rootCause && (
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />根因结论
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-60">
                <p className="text-sm font-semibold">{run.rootCause}</p>
                {run.evidence && (
                  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-line leading-relaxed">
                    <span className="font-medium text-muted-foreground">证据链：</span>{run.evidence}
                  </p>
                )}
              </div>
              {conf != null && (
                <div className="w-40">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">置信度</span>
                    <span className={`font-bold ${conf >= 80 ? "text-emerald-400" : conf >= 60 ? "text-amber-400" : "text-red-400"}`}>{conf}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${conf}%`,
                        background: conf >= 80 ? "#10b981" : conf >= 60 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            {Array.isArray(run.suggestions) && run.suggestions.length > 0 && (
              <div>
                <p className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />修复建议
                </p>
                <div className="space-y-2">
                  {run.suggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">{s.title}</p>
                      {s.detail && <p className="text-xs text-muted-foreground mt-1">{s.detail}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {run.status === "success" && (
        <Card className="border-sky-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-sky-400" />自动化闭环与可信留痕
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {repairCount > 0 && (
                <Badge variant="outline" className="border-violet-500/30 text-violet-400">
                  <Wrench className="h-3 w-3 mr-1" />修复 ×{repairCount}
                </Badge>
              )}
              {rollbackCount > 0 && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                  <Undo2 className="h-3 w-3 mr-1" />自动回滚 ×{rollbackCount}
                </Badge>
              )}
              {recheckCount > 0 && (
                <Badge variant="outline" className="border-sky-500/30 text-sky-400">
                  <RefreshCw className="h-3 w-3 mr-1" />复检 ×{recheckCount}
                </Badge>
              )}
              {verdictLabel && VERDICT_META[verdictLabel] && (
                <Badge className={`border ${VERDICT_META[verdictLabel].cls}`}>
                  {VERDICT_META[verdictLabel].label}
                </Badge>
              )}
              {run.trigger === "auto" && (
                <Badge variant="outline" className="text-xs">由巡检自动触发（编排）</Badge>
              )}
            </div>
            {run.evidenceFingerprint ? (
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-sky-400" />
                  <span className="text-xs text-muted-foreground">证据指纹（sha256）</span>
                  <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded break-all">{run.evidenceFingerprint}</code>
                  {run.evidenceVerified === false ? (
                    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 border">校验不一致！</Badge>
                  ) : run.evidenceVerified === true ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">
                      <CheckCircle2 className="h-3 w-3 mr-1" />与库中记录一致
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  指纹覆盖全部取证/修复/复检步骤的命令、退出码与输出；时间线末尾与 PDF/Word 导出均带同一指纹，可用于核验报告记录是否被篡改。
                </p>
              </div>
            ) : null}
            {Array.isArray(run.similarCases) && run.similarCases.length > 0 && (
              <div>
                <p className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <History className="h-4 w-4 text-amber-400" />历史相似案例（Runbook 命中）
                </p>
                <div className="space-y-2">
                  {run.similarCases.map((c) => (
                    <Link
                      key={c.id}
                      href={`/diagnoses/${c.id}`}
                      className="block rounded-lg border border-border p-3 hover:border-violet-500/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30 border">相似 {c.similarity}%</Badge>
                        <span className="text-sm font-medium">{c.title}</span>
                        {c.repaired && (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">已修复</Badge>
                        )}
                        {c.rechecked && (
                          <Badge variant="outline" className="text-xs text-sky-400 border-sky-500/30">已复检</Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      {c.rootCause && <p className="text-xs text-muted-foreground mt-1.5">{c.rootCause}</p>}
                    </Link>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  同类故障的历史结论与修复轨迹可复用，点击卡片查看完整历史报告。
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {run.status === "success" && repairOptions !== null && repairOptions.length > 0 && (
        <Card className="border-violet-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-5 w-5 text-violet-400" />一键修复（白名单模板）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {repairOptions.map((opt) => {
              const done = steps.some(
                (s) =>
                  s.status === "done" &&
                  (s.tool || "").startsWith("修复·") &&
                  (s.args as { key?: string } | undefined)?.key === opt.key
              );
              const busy = repairingKey === opt.key;
              const risk = RISK_META[opt.risk];
              return (
                <div key={opt.key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{opt.title}</p>
                    <Badge className={`border ${risk.cls}`}>{risk.label}</Badge>
                    {done && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">已执行</Badge>}
                    <Button
                      size="sm"
                      className="ml-auto"
                      variant={opt.risk === "high" ? "destructive" : "outline"}
                      disabled={done || busy || run.status !== "success"}
                      onClick={() => doRepair(opt)}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wrench className="h-4 w-4 mr-1" />}
                      {done ? "已执行" : "执行修复"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{opt.detail}</p>
                  <pre className="text-xs bg-muted/60 rounded-md p-2 mt-2 overflow-x-auto font-mono">$ {opt.command}</pre>
                  {opt.rollback && (
                    <p className="text-xs mt-1.5 flex items-center gap-1.5 text-muted-foreground">
                      <Undo2 className="h-3.5 w-3.5" />回滚：{opt.rollback}
                    </p>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
              修复命令仅来自固定白名单模板，执行会写入审计时间线；成功后自动触发复检，判定“已恢复 / 仍异常”；复检仍异常且方案带回滚命令时，将自动执行回滚并再次复检，全程留痕。
            </p>
          </CardContent>
        </Card>
      )}

      {run.status === "queued" && (
        <Card className="border-amber-500/30">
          <CardContent className="pt-4 text-sm text-amber-200 flex items-start gap-2">
            <Clock3 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              该服务器已有排查在执行，本次已排队等待{typeof run.queuePosition === "number" && run.queuePosition > 0 ? `（前面还有 ${run.queuePosition} 个）` : ""}，轮到后自动开始多步取证。
            </span>
          </CardContent>
        </Card>
      )}

      {run.status === "failed" && (
        <Card className="border-red-500/30">
          <CardContent className="pt-4 text-sm text-red-300 flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>排查失败：{run.error || "未知错误"}</span>
          </CardContent>
        </Card>
      )}

      {run.status === "stopped" && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground flex items-start gap-2">
            <Square className="h-4 w-4 mt-0.5 shrink-0" />
            <span>排查已手动停止，已采集 {steps.length} 步证据。</span>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">排查时间线（{steps.length} 步）</h2>
          {(run.status === "running" || run.status === "queued") && <Loader2 className="h-4 w-4 animate-spin text-blue-400" />}
          {dynamicCount > 0 && (
            <Badge variant="outline" className="text-xs text-violet-400 border-violet-500/30">
              <Sparkles className="h-3 w-3 mr-1" />自适应处理 ×{dynamicCount}
            </Badge>
          )}
        </div>
        {steps.length === 0 ? (
          <Card>
            <CardContent className="pt-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              {run.status === "queued" ? "排队中，轮到后将自动开始取证…" : "AI 正在规划第一步排查动作…"}
            </CardContent>
          </Card>
        ) : (
          steps.map((s) => <StepCard key={s.index} step={s} />)
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        安全模式：排查与复检仅执行白名单只读命令；“一键修复”仅限固定白名单模板（docker start/update、systemctl start），执行前需确认并全程审计留痕。
      </p>
    </div>
  );
}
