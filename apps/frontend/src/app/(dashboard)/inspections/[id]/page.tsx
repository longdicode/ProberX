"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Download, FileCode2, FileText, FileType, AlertTriangle, Info as InfoIcon, ExternalLink, Workflow, ArrowRight } from "lucide-react";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useInspectionReport, type InspectionFinding, type DiagnosisRun } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { getToken } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";

const LEVEL_META: Record<string, { cls: string; label: string; Icon: typeof AlertTriangle }> = {
  error: { cls: "bg-red-500/15 text-red-400 border-red-500/30", label: "故障", Icon: AlertTriangle },
  warning: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "风险", Icon: AlertTriangle },
  info: { cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "提示", Icon: InfoIcon },
};

function ScoreRing({ score }: { score: number | null }) {
  const s = score ?? 0;
  const color = s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444";
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${(s / 100) * c} ${c}`}
          transform="rotate(-90 60 60)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score ?? "—"}</span>
        <span className="text-xs text-muted-foreground">/100 健康分</span>
      </div>
    </div>
  );
}

function FindingCard({ f }: { f: InspectionFinding }) {
  const meta = LEVEL_META[f.level] ?? LEVEL_META.info;
  const Icon = meta.Icon;
  const borderColor = f.level === "error" ? "#ef4444" : f.level === "warning" ? "#f59e0b" : "#3b82f6";
  return (
    <div className="rounded-lg border p-4" style={{ borderLeft: `4px solid ${borderColor}`, borderColor: "rgba(128,128,128,.2)" }}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: borderColor }} />
        <span className="text-sm font-semibold">[{meta.label}] {f.title}</span>
        <Badge className="ml-auto border text-xs" style={{ color: borderColor, borderColor }}>{f.category}</Badge>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{f.detail}</p>
      {f.evidence && <p className="text-xs text-muted-foreground/80 mt-2"><span className="font-medium">证据：</span>{f.evidence}</p>}
      {f.suggestion && <p className="text-xs mt-2"><span className="font-medium text-emerald-400">建议：</span>{f.suggestion}</p>}
    </div>
  );
}

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useLocale();
  const { current } = useWorkspaceStore();
  const { data: report, isLoading } = useInspectionReport(current?.id, params.id);
  const [exporting, setExporting] = useState<string | null>(null);
  const [autoDiagnoses, setAutoDiagnoses] = useState<DiagnosisRun[] | null>(null);

  // 编排联动：展示本份巡检触发后自动发起的“自主排查”（多智能体编排轨迹）
  useEffect(() => {
    if (!current?.id || !report?.serverId || report.status !== "done") {
      setAutoDiagnoses(null);
      return;
    }
    const baseTime = report.finishedAt
      ? Date.parse(report.finishedAt)
      : report.createdAt
        ? Date.parse(report.createdAt)
        : Date.now();
    api
      .get<DiagnosisRun[]>(`/workspaces/${current.id}/servers/${report.serverId}/diagnoses`)
      .then((runs) => {
        const arr = Array.isArray(runs) ? runs : [];
        setAutoDiagnoses(
          arr
            .filter((r) => r.trigger === "auto" && Date.parse(r.createdAt) >= baseTime - 60_000)
            .slice(0, 5)
        );
      })
      .catch(() => setAutoDiagnoses([]));
  }, [current?.id, report?.serverId, report?.status, report?.finishedAt, report?.createdAt]);

  async function download(kind: "html" | "markdown" | "pdf" | "docx") {
    if (!current?.id || !report) return;
    setExporting(kind);
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${current.id}/inspections/${report.id}/${kind}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`下载失败 (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extMap: Record<string, string> = { html: "html", markdown: "md", pdf: "pdf", docx: "docx" };
      a.download = `${report.title}.${extMap[kind]}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已开始下载");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下载失败");
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) return <PageSkeleton />;
  if (!report) return <div className="text-muted-foreground">报告不存在</div>;

  const findings = report.findings || [];
  const errorCount = findings.filter((f) => f.level === "error").length;
  const warnCount = findings.filter((f) => f.level === "warning").length;
  const mm = report.metricsSummary || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/inspections" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{report.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              生成于 {report.createdAt ? new Date(report.createdAt).toLocaleString("zh-CN") : "—"}
              {report.trigger === "schedule" ? " · 每日定时报告" : " · 手动生成"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={report.status !== "done" || exporting !== null}
            onClick={() => download("html")}>
            {exporting === "html" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
            导出 HTML
          </Button>
          <Button variant="outline" size="sm" disabled={report.status !== "done" || exporting !== null}
            onClick={() => download("markdown")}>
            {exporting === "markdown" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileCode2 className="h-4 w-4 mr-1" />}
            Markdown
          </Button>
          <Button variant="outline" size="sm" disabled={report.status !== "done" || exporting !== null}
            onClick={() => download("pdf")}>
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileType className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" disabled={report.status !== "done" || exporting !== null}
            onClick={() => download("docx")}>
            {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
            Word
          </Button>
        </div>
      </div>

      {autoDiagnoses && autoDiagnoses.length > 0 && (
        <Card className="border-violet-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Workflow className="h-4 w-4 text-violet-400" />智能编排：巡检触发后的自动排查
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {autoDiagnoses.map((r) => (
              <Link
                key={r.id}
                href={`/diagnoses/${r.id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 hover:border-violet-500/40 transition-colors"
              >
                <Workflow className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-medium">自主排查</span>
                <Badge variant="outline" className="text-xs">{r.status === "success" ? "已完成" : r.status === "running" ? "进行中" : r.status}</Badge>
                {r.rootCause && <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{r.rootCause}</span>}
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("zh-CN")}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
            <p className="text-xs text-muted-foreground">
              巡检发现异常后自动触发多步只读取证定位根因，形成“巡检 → 排查 → 修复/复检”的闭环编排。
            </p>
          </CardContent>
        </Card>
      )}

      {report.status === "running" && (
        <Card className="border-blue-500/30">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <div>
              <div className="text-sm font-medium">AI 正在巡检分析…</div>
              <div className="text-xs text-muted-foreground">正在采集指标与实时诊断数据，并调用大模型生成报告，通常需要 30-90 秒</div>
            </div>
          </CardContent>
        </Card>
      )}

      {report.status === "failed" && (
        <Card className="border-red-500/30">
          <CardContent className="py-4">
            <div className="text-sm font-medium text-red-400">报告生成失败</div>
            <div className="text-xs text-muted-foreground mt-1">{report.error || "未知错误"}</div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">健康评分</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-4">
            <ScoreRing score={report.healthScore} />
            <div className="text-sm text-muted-foreground space-y-1">
              <div><span className="text-red-400 font-medium">{errorCount}</span> 项故障</div>
              <div><span className="text-amber-400 font-medium">{warnCount}</span> 项风险</div>
              <div><span className="text-blue-400 font-medium">{findings.filter((f) => f.level === "info").length}</span> 项提示</div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">总体结论</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{report.summary || "暂无总结论。"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">发现项（{findings.length}）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">未发现明显问题。</p>
          ) : (
            findings.map((f, i) => <FindingCard key={i} f={f} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">指标摘要</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              ["CPU 平均 / 峰值", `${mm.cpuAvg ?? "-"}% / ${mm.cpuMax ?? "-"}%`],
              ["内存平均 / 峰值", `${mm.memAvgPct ?? "-"}% / ${mm.memMaxPct ?? "-"}%`],
              ["磁盘平均 / 峰值", `${mm.diskAvgPct ?? "-"}% / ${mm.diskMaxPct ?? "-"}%`],
              ["负载 (1min)", mm.load1Avg ?? "-"],
              ["GPU", mm.gpuName ? `${mm.gpuName} · ${mm.gpuUtilAvg ?? "-"}%` : "未采集"],
              ["网络流入", mm.netInMB != null ? `${mm.netInMB} MB` : "-"],
              ["网络流出", mm.netOutMB != null ? `${mm.netOutMB} MB` : "-"],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border bg-muted/40 px-3 py-2">
                <div className="text-xs text-muted-foreground">{String(k)}</div>
                <div className="font-medium mt-0.5">{String(v)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {report.markdown && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">Markdown 原文
              <a href="#" onClick={(e) => { e.preventDefault(); download("markdown"); }} className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1">
                下载 <ExternalLink className="h-3 w-3" />
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground bg-muted/40 rounded-lg p-4 max-h-96 overflow-auto">{report.markdown}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
