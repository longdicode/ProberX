import fs from "node:fs";
import PDFDocument from "pdfkit";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx";
import type { InspectionFinding } from "./inspection.service";
import type { DiagnosisStep } from "./diagnosis.service";
import type { WeeklyReport } from "./weekly.service";

// Types

export interface ExportReport {
  title: string;
  healthScore: number | null;
  summary: string | null;
  findings: InspectionFinding[];
  metricsSummary: Record<string, unknown>;
  createdAt: string | null;
}

const LEVEL_LABEL: Record<string, string> = { error: "故障", warning: "风险", info: "提示" };

// CJK font discovery for PDF

const FONT_CANDIDATES = [
  ...(process.env.PDF_FONT_PATH ? [process.env.PDF_FONT_PATH] : []),
  "/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc",      // Alpine (apk font-wqy-zenhei)
  "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",     // Debian/Ubuntu
  "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", // Alpine (apk font-noto-cjk)
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
];

function findCjkFont(): string | null {
  for (const p of FONT_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function metricRows(mm: Record<string, unknown>): [string, string][] {
  return [
    ["CPU 平均/峰值", `${mm.cpuAvg ?? "-"}% / ${mm.cpuMax ?? "-"}%`],
    ["内存平均/峰值", `${mm.memAvgPct ?? "-"}% / ${mm.memMaxPct ?? "-"}%`],
    ["磁盘平均/峰值", `${mm.diskAvgPct ?? "-"}% / ${mm.diskMaxPct ?? "-"}%`],
    ["负载 (1min)", mm.load1Avg != null ? String(mm.load1Avg) : "-"],
    ["GPU", mm.gpuName ? `${mm.gpuName} · ${mm.gpuUtilAvg ?? "-"}%` : "未采集"],
    ["网络流入", mm.netInMB != null ? `${mm.netInMB} MB` : "-"],
    ["网络流出", mm.netOutMB != null ? `${mm.netOutMB} MB` : "-"],
  ];
}

// DOCX

export async function renderDocx(report: ExportReport): Promise<Buffer> {
  const findings = report.findings ?? [];
  const mm = report.metricsSummary ?? {};
  const borderStyle = {
    style: BorderStyle.SINGLE, size: 1, color: "cccccc",
  };
  const cellBorders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `生成时间：${report.createdAt ?? ""} · ProberX AI 巡检`, size: 18, color: "888888" })],
    }),
    new Paragraph({ spacing: { before: 120 }, text: `【健康评分】${report.healthScore ?? "-"} / 100`, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: "【总体结论】", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ spacing: { after: 120 }, text: report.summary || "暂无总结论。" }),
    new Paragraph({ text: `【发现项】共 ${findings.length} 项`, heading: HeadingLevel.HEADING_2 }),
  ];

  for (const f of findings) {
    children.push(
      new Paragraph({ text: `[${LEVEL_LABEL[f.level] ?? f.level}] ${f.title}`, heading: HeadingLevel.HEADING_3 }),
      new Paragraph({ children: [new TextRun({ text: "详情：", bold: true }), new TextRun(f.detail)] }),
    );
    if (f.evidence) children.push(new Paragraph({ children: [new TextRun({ text: "证据：", bold: true }), new TextRun(f.evidence)] }));
    if (f.suggestion) children.push(new Paragraph({ children: [new TextRun({ text: "建议：", bold: true }), new TextRun(f.suggestion)] }));
    children.push(new Paragraph({ spacing: { after: 80 }, text: "" }));
  }

  children.push(new Paragraph({ text: "【指标摘要】", heading: HeadingLevel.HEADING_2 }));

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ borders: cellBorders, shading: { type: "clear", fill: "f3f4f6" }, children: [new Paragraph({ children: [new TextRun({ text: "指标", bold: true })] })] }),
        new TableCell({ borders: cellBorders, shading: { type: "clear", fill: "f3f4f6" }, children: [new Paragraph({ children: [new TextRun({ text: "数值", bold: true })] })] }),
      ],
    }),
  ];
  for (const [k, v] of metricRows(mm)) {
    rows.push(new TableRow({
      children: [
        new TableCell({ borders: cellBorders, children: [new Paragraph(k)] }),
        new TableCell({ borders: cellBorders, children: [new Paragraph(v)] }),
      ],
    }));
  }
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300 },
    children: [new TextRun({ text: "— 由 ProberX AI 巡检生成 —", size: 18, color: "999999" })],
  }));

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

// PDF

export function renderPdf(report: ExportReport): Promise<Buffer> {
  const findings = report.findings ?? [];
  const mm = report.metricsSummary ?? {};
  const fontPath = findCjkFont();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (fontPath) doc.registerFont("CJK", fontPath);
    const useCjk = !!fontPath;
    const main = () => doc.font(useCjk ? "CJK" : "Helvetica");

    // Header
    main().fontSize(20).fillColor("#111111").text(report.title);
    doc.fontSize(9).fillColor("#888888").text(`生成时间：${report.createdAt ?? ""} · ProberX AI 巡检`);
    doc.moveDown(0.4);

    const score = report.healthScore ?? 0;
    main().fontSize(16).fillColor(score >= 80 ? "#0f9d58" : score >= 60 ? "#e2a336" : "#d93025")
      .text(`健康评分：${score} / 100`);
    doc.moveDown(0.2);

    main().fontSize(13).fillColor("#111111").text("总体结论");
    doc.fontSize(10.5).fillColor("#333333").text(report.summary || "暂无总结论。", { lineGap: 3 });
    doc.moveDown(0.4);

    main().fontSize(13).fillColor("#111111").text(`发现项（共 ${findings.length} 项）`);
    for (const f of findings) {
      const color = f.level === "error" ? "#d93025" : f.level === "warning" ? "#e2a336" : "#1a73e8";
      main().fontSize(11).fillColor(color).text(`[${LEVEL_LABEL[f.level] ?? f.level}] ${f.title}`);
      doc.fontSize(10).fillColor("#333333").text(f.detail, { lineGap: 2 });
      if (f.evidence) doc.fontSize(9).fillColor("#666666").text(`证据：${f.evidence}`);
      if (f.suggestion) doc.fontSize(9.5).fillColor("#0f766e").text(`建议：${f.suggestion}`);
      doc.moveDown(0.25);
    }
    doc.moveDown(0.5);

    main().fontSize(13).fillColor("#111111").text("指标摘要");
    for (const [k, v] of metricRows(mm)) {
      doc.fontSize(9.5).fillColor("#444444").text(`${k}：${v}`);
    }
    doc.moveDown(1);

    main().fontSize(8.5).fillColor("#999999").text("— 由 ProberX AI 巡检生成 —", { align: "center" });
    doc.end();
  });
}


// Autonomous diagnosis report export

export interface DiagnosisExportRun {
  title: string;
  goal: string;
  trigger: string;
  status: string;
  steps: DiagnosisStep[];
  rootCause: string | null;
  confidence: number | null;
  evidence: string | null;
  suggestions: { title: string; detail: string }[];
  error: string | null;
  createdAt: Date | string | null;
  finishedAt: Date | string | null;
  evidenceFingerprint?: string | null;
  evidenceVerified?: boolean | null;
}

const DIAGNOSIS_STATUS_LABEL: Record<string, string> = {
  running: "进行中",
  success: "完成",
  failed: "失败",
  stopped: "已停止",
};

const DIAGNOSIS_TRIGGER_LABEL: Record<string, string> = {
  manual: "手动触发",
  auto: "自动触发",
};

function fmtDate(v: Date | string | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("zh-CN");
}

function fingerprintNote(run: DiagnosisExportRun): string {
  if (!run.evidenceFingerprint) return "";
  const short = run.evidenceFingerprint.slice(0, 16);
  return ` · 证据指纹 ${short}${run.evidenceVerified === false ? "（校验不一致！）" : ""}`;
}

// DOCX

export async function renderDiagnosisDocx(run: DiagnosisExportRun): Promise<Buffer> {
  const steps = run.steps ?? [];

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: run.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: `发起时间：${fmtDate(run.createdAt)} · ${DIAGNOSIS_TRIGGER_LABEL[run.trigger] ?? run.trigger} · ${DIAGNOSIS_STATUS_LABEL[run.status] ?? run.status} · ProberX 自主排查${fingerprintNote(run)}`, size: 18, color: "888888" })],
    }),
    new Paragraph({ spacing: { before: 120 }, text: "【排查目标】", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ spacing: { after: 120 }, text: run.goal || "—" }),
    new Paragraph({ text: "【根因结论】", heading: HeadingLevel.HEADING_2 }),
  ];

  if (run.status === "success" && run.rootCause) {
    children.push(new Paragraph({ text: run.rootCause, heading: HeadingLevel.HEADING_3 }));
    if (run.confidence != null) children.push(new Paragraph({ children: [new TextRun({ text: "置信度：", bold: true }), new TextRun(`${run.confidence}%`)] }));
    if (run.evidence) children.push(new Paragraph({ children: [new TextRun({ text: "证据链：", bold: true }), new TextRun(run.evidence)] }));
    const suggestions = run.suggestions ?? [];
    if (suggestions.length > 0) {
      children.push(new Paragraph({ text: `修复建议（${suggestions.length} 条）`, heading: HeadingLevel.HEADING_3 }));
      for (const s of suggestions) {
        children.push(new Paragraph({ children: [new TextRun({ text: `· ${s.title}`, bold: true })] }));
        if (s.detail) children.push(new Paragraph({ children: [new TextRun({ text: s.detail })] }));
      }
    }
  } else if (run.status === "failed") {
    children.push(new Paragraph({ text: `排查失败：${run.error || "未知错误"}` }));
  } else if (run.status === "stopped") {
    children.push(new Paragraph({ text: `排查已手动停止，已采集 ${steps.length} 步证据。` }));
  } else {
    children.push(new Paragraph({ text: "排查进行中，暂未生成最终结论。" }));
  }

  children.push(new Paragraph({ text: `【排查时间线】共 ${steps.length} 步`, heading: HeadingLevel.HEADING_2 }));

  for (const s of steps) {
    const stLabel = s.status === "error" ? "错误" : s.status === "running" ? "进行中" : "完成";
    children.push(new Paragraph({ text: `第 ${s.index} 步 · ${s.tool}（${stLabel}）`, heading: HeadingLevel.HEADING_3 }));
    if (s.reason) children.push(new Paragraph({ children: [new TextRun({ text: "原因：", bold: true }), new TextRun(s.reason)] }));
    if (s.command) children.push(new Paragraph({ children: [new TextRun({ text: "命令：", bold: true }), new TextRun({ text: `$ ${s.command}`, font: "Courier New" })] }));
    const out = s.stderr ? `[stderr] ${s.stderr}\n` : "";
    const body = s.stdout ? out + s.stdout : out;
    if (s.stdout || s.stderr) children.push(new Paragraph({ children: [new TextRun({ text: body || "（无输出）", font: "Courier New", size: 18 })] }));
    if (s.judgment) children.push(new Paragraph({ children: [new TextRun({ text: "分析：", bold: true }), new TextRun(s.judgment)] }));
    children.push(new Paragraph({ spacing: { after: 80 }, text: "" }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300 },
    children: [new TextRun({ text: "— 由 ProberX AI 自主排查生成 —", size: 18, color: "999999" })],
  }));

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

// PDF

export function renderDiagnosisPdf(run: DiagnosisExportRun): Promise<Buffer> {
  const steps = run.steps ?? [];
  const fontPath = findCjkFont();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (fontPath) doc.registerFont("CJK", fontPath);
    const useCjk = !!fontPath;
    const main = () => doc.font(useCjk ? "CJK" : "Helvetica");

    main().fontSize(20).fillColor("#111111").text(run.title);
    doc.fontSize(9).fillColor("#888888").text(`发起时间：${fmtDate(run.createdAt)} · ${DIAGNOSIS_TRIGGER_LABEL[run.trigger] ?? run.trigger} · ${DIAGNOSIS_STATUS_LABEL[run.status] ?? run.status} · ProberX 自主排查${fingerprintNote(run)}`);
    doc.moveDown(0.4);

    main().fontSize(13).fillColor("#111111").text("排查目标");
    doc.fontSize(10.5).fillColor("#333333").text(run.goal || "—", { lineGap: 3 });
    doc.moveDown(0.4);

    main().fontSize(13).fillColor("#111111").text("根因结论");
    if (run.status === "success" && run.rootCause) {
      main().fontSize(11).fillColor("#0f9d58").text(run.rootCause);
      if (run.confidence != null) doc.fontSize(10).fillColor("#333333").text(`置信度：${run.confidence}%`);
      if (run.evidence) doc.fontSize(9.5).fillColor("#666666").text(`证据链：${run.evidence}`, { lineGap: 2 });
      for (const s of run.suggestions ?? []) {
        doc.moveDown(0.15);
        main().fontSize(10.5).fillColor("#0f766e").text(`建议：${s.title}`);
        if (s.detail) doc.fontSize(9.5).fillColor("#666666").text(s.detail, { lineGap: 2 });
      }
    } else if (run.status === "failed") {
      doc.fontSize(10.5).fillColor("#d93025").text(`排查失败：${run.error || "未知错误"}`);
    } else if (run.status === "stopped") {
      doc.fontSize(10.5).fillColor("#e2a336").text(`排查已手动停止，已采集 ${steps.length} 步证据。`);
    } else {
      doc.fontSize(10.5).fillColor("#888888").text("排查进行中，暂未生成最终结论。");
    }
    doc.moveDown(0.4);

    main().fontSize(13).fillColor("#111111").text(`排查时间线（共 ${steps.length} 步）`);
    for (const s of steps) {
      const stLabel = s.status === "error" ? "错误" : s.status === "running" ? "进行中" : "完成";
      const color = s.status === "error" ? "#d93025" : "#1a73e8";
      main().fontSize(11).fillColor(color).text(`第 ${s.index} 步 · ${s.tool}（${stLabel}）`);
      if (s.reason) doc.fontSize(9.5).fillColor("#555555").text(`原因：${s.reason}`, { lineGap: 2 });
      if (s.command) doc.fontSize(9).fillColor("#333333").text(`$ ${s.command}`, { lineGap: 2 });
      if (s.stdout || s.stderr) {
        const out = s.stderr ? `[stderr] ${s.stderr}\n` : "";
        const body = s.stdout ? out + s.stdout : out;
        doc.fontSize(8.5).fillColor("#444444").text(body, { lineGap: 2 });
      }
      if (s.judgment) doc.fontSize(9.5).fillColor("#0f766e").text(`分析：${s.judgment}`, { lineGap: 2 });
      doc.moveDown(0.25);
    }
    doc.moveDown(1);

    main().fontSize(8.5).fillColor("#999999").text("— 由 ProberX AI 自主排查生成 —", { align: "center" });
    doc.end();
  });
}

// AI 运维周报 DOCX

export async function renderWeeklyDocx(report: WeeklyReport): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: "ProberX AI 运维周报", heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `统计周期：${new Date(report.since).toLocaleDateString("zh-CN")} ~ ${new Date(report.until).toLocaleDateString("zh-CN")}（最近 ${report.windowDays} 天） · 生成时间：${new Date(report.generatedAt).toLocaleString("zh-CN")}`,
          size: 18,
          color: "888888",
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 120 }, text: "【统计概览】", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `自主排查 ${report.runCount} 次（成功 ${report.byStatus.success ?? 0} / 失败 ${report.byStatus.failed ?? 0} / 停止 ${report.byStatus.stopped ?? 0} / 进行中 ${report.byStatus.running ?? 0}），自动触发 ${report.autoCount} 次` }),
    new Paragraph({ text: `累计取证 ${report.totalSteps} 步（平均 ${report.avgSteps} 步/次），覆盖服务器 ${report.servers.length} 台` }),
    new Paragraph({ text: `白名单修复 ${report.totalRepairs} 次 · 自动回滚 ${report.totalRollbacks} 次 · 自动复检 ${report.totalRechecks} 次` }),
    new Paragraph({ text: `复检判定：已恢复 ${report.recoveredCount} 次 / 仍异常 ${report.stillFailingCount} 次` }),
    new Paragraph({ text: `预估节省人工排查时间：约 ${report.savedMinEstimate} 分钟` }),
  ];
  if (report.rootTopics.length) {
    children.push(new Paragraph({ text: "【高频根因类型】", heading: HeadingLevel.HEADING_2 }));
    for (const t of report.rootTopics) {
      children.push(new Paragraph({ children: [new TextRun({ text: `· ${t.text}`, bold: true }), new TextRun(`（${t.count} 次）`)] }));
    }
  }
  if (report.servers.length) {
    children.push(new Paragraph({ text: "【服务器排查分布】", heading: HeadingLevel.HEADING_2 }));
    for (const s of report.servers) {
      children.push(new Paragraph({ text: `· ${s.name}：${s.runCount} 次` }));
    }
  }
  children.push(new Paragraph({ text: "【AI 周报分析】", heading: HeadingLevel.HEADING_2 }));
  for (const line of (report.markdown || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) {
      children.push(new Paragraph({ text: t.replace(/^#+\s*/, ""), heading: HeadingLevel.HEADING_3 }));
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      children.push(new Paragraph({ text: t.replace(/^[-*]\s*/, "· ") }));
    } else {
      children.push(new Paragraph({ text: t }));
    }
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [new TextRun({ text: "— 由 ProberX AI 自主排查平台生成 —", size: 18, color: "999999" })],
    })
  );
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
