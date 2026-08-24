import fs from "node:fs";
import PDFDocument from "pdfkit";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from "docx";
import type { InspectionFinding } from "./inspection.service";

// ── Types ────────────────────────────────────────────────────────

export interface ExportReport {
  title: string;
  healthScore: number | null;
  summary: string | null;
  findings: InspectionFinding[];
  metricsSummary: Record<string, unknown>;
  createdAt: string | null;
}

const LEVEL_LABEL: Record<string, string> = { error: "故障", warning: "风险", info: "提示" };

// ── CJK font discovery for PDF ───────────────────────────────────

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

// ── DOCX ─────────────────────────────────────────────────────────

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

// ── PDF ──────────────────────────────────────────────────────────

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
