import type { FastifyPluginAsync } from "fastify";
import * as svc from "../services/inspection.service";
import { renderPdf, renderDocx } from "../services/report-export";
import { generateInspectionBody } from "../validators/inspection";

type AuthCtx = { preHandler: any[] };

export const inspectionRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  // List reports of a workspace (optionally filtered by server)
  app.get("/workspaces/:wid/inspections", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const q = req.query as { limit?: string; serverId?: string };
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 50, 200) : 50;
    return reply.send(await svc.listReports(wid, app.db, limit, q.serverId));
  });

  // List reports for one server
  app.get("/workspaces/:wid/servers/:id/inspections", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await svc.listReports(wid, app.db, 50, id));
  });

  // Generate a report synchronously
  app.post("/workspaces/:wid/servers/:id/inspections", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const body = generateInspectionBody.parse(req.body ?? {});
    return reply.send(await svc.generateReport(wid, id, body, app.db));
  });

  // Report detail
  app.get("/workspaces/:wid/inspections/:rid", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    return reply.send(await svc.getReport(wid, rid, app.db));
  });

  // Delete
  app.delete("/workspaces/:wid/inspections/:rid", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    return reply.send(await svc.deleteReport(wid, rid, app.db));
  });

  // HTML export
  app.get("/workspaces/:wid/inspections/:rid/html", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const row = await svc.getReport(wid, rid, app.db);
    const html = svc.renderHtml({
      title: row.title,
      healthScore: row.healthScore,
      summary: row.summary,
      findings: (row.findings as any[]) ?? [],
      markdown: row.markdown,
      createdAt: row.createdAt?.toLocaleString("zh-CN"),
    });
    return reply
      .type("text/html; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(row.title)}.html"`)
      .send(html);
  });

  // Markdown export
  app.get("/workspaces/:wid/inspections/:rid/markdown", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const row = await svc.getReport(wid, rid, app.db);
    return reply
      .type("text/markdown; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(row.title)}.md"`)
      .send(row.markdown ?? "");
  });

  // PDF export
  app.get("/workspaces/:wid/inspections/:rid/pdf", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const row = await svc.getReport(wid, rid, app.db);
    const buf = await renderPdf({
      title: row.title,
      healthScore: row.healthScore,
      summary: row.summary,
      findings: (row.findings as any[]) ?? [],
      metricsSummary: (row.metricsSummary as Record<string, unknown>) ?? {},
      createdAt: row.createdAt?.toLocaleString("zh-CN") ?? null,
    });
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(row.title)}.pdf"`)
      .send(buf);
  });

  // DOCX export
  app.get("/workspaces/:wid/inspections/:rid/docx", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const row = await svc.getReport(wid, rid, app.db);
    const buf = await renderDocx({
      title: row.title,
      healthScore: row.healthScore,
      summary: row.summary,
      findings: (row.findings as any[]) ?? [],
      metricsSummary: (row.metricsSummary as Record<string, unknown>) ?? {},
      createdAt: row.createdAt?.toLocaleString("zh-CN") ?? null,
    });
    return reply
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(row.title)}.docx"`)
      .send(buf);
  });
};
