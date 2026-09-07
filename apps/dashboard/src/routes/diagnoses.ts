import type { FastifyPluginAsync } from "fastify";
import * as svc from "../services/diagnosis.service";
import * as weeklySvc from "../services/weekly.service";
import { renderDiagnosisPdf, renderDiagnosisDocx, renderWeeklyDocx } from "../services/report-export";
import { startDiagnosisBody } from "../validators/diagnosis";

export const diagnosisRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  // List runs of a workspace (optionally filtered by server)
  app.get("/workspaces/:wid/diagnoses", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const q = req.query as { limit?: string; serverId?: string };
    const limit = q.limit ? Math.min(parseInt(q.limit, 10) || 50, 200) : 50;
    return reply.send(await svc.listRuns(wid, app.db, limit, q.serverId));
  });

  // List runs for one server
  app.get("/workspaces/:wid/servers/:id/diagnoses", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await svc.listRuns(wid, app.db, 50, id));
  });

  // Start an autonomous diagnosis (synchronous until finished)
  app.post("/workspaces/:wid/servers/:id/diagnoses", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const body = startDiagnosisBody.parse(req.body ?? {});
    return reply.send(await svc.startDiagnosis(wid, id, body, app.db));
  });

  // Run detail
  app.get("/workspaces/:wid/diagnoses/:rid", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    return reply.send(await svc.getRun(wid, rid, app.db));
  });

  // PDF export
  app.get("/workspaces/:wid/diagnoses/:rid/pdf", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const row = await svc.getRun(wid, rid, app.db);
    const buf = await renderDiagnosisPdf(row as any);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(row.title)}.pdf"`)
      .send(buf);
  });

  // DOCX export
  app.get("/workspaces/:wid/diagnoses/:rid/docx", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const row = await svc.getRun(wid, rid, app.db);
    const buf = await renderDiagnosisDocx(row as any);
    return reply
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .header("Content-Disposition", `attachment; filename="${encodeURIComponent(row.title)}.docx"`)
      .send(buf);
  });

  // AI 运维周报：汇总最近 N 天自主排查统计 + LLM 生成中文周报
  app.get("/workspaces/:wid/reports/weekly", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const q = req.query as { days?: string; serverId?: string };
    return reply.send(
      await weeklySvc.buildWeekly(wid, app.db, {
        days: q.days ? parseInt(q.days, 10) : 7,
        serverId: q.serverId || undefined,
      })
    );
  });

  // AI 运维周报 Markdown 下载
  app.get("/workspaces/:wid/reports/weekly/md", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const q = req.query as { days?: string; serverId?: string };
    const w = await weeklySvc.buildWeekly(wid, app.db, {
      days: q.days ? parseInt(q.days, 10) : 7,
      serverId: q.serverId || undefined,
    });
    return reply
      .type("text/markdown; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="proberx-weekly-${w.windowDays}d.md"`)
      .send(w.markdown);
  });

  // AI 运维周报 Word 下载
  app.get("/workspaces/:wid/reports/weekly/docx", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const q = req.query as { days?: string; serverId?: string };
    const w = await weeklySvc.buildWeekly(wid, app.db, {
      days: q.days ? parseInt(q.days, 10) : 7,
      serverId: q.serverId || undefined,
    });
    const buf = await renderWeeklyDocx(w);
    return reply
      .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .header("Content-Disposition", `attachment; filename="proberx-weekly-${w.windowDays}d.docx"`)
      .send(buf);
  });

  // Stop a running run
  app.post("/workspaces/:wid/diagnoses/:rid/stop", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    return reply.send(await svc.stopDiagnosis(wid, rid, app.db));
  });

  // Re-verify a finished run (read-only recovery check -> recovered / still_failing)
  app.post("/workspaces/:wid/diagnoses/:rid/verify", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    return reply.send(await svc.verifyDiagnosis(wid, rid, app.db));
  });

  // Repair plan preview: whitelisted fix options derived from the run's fault point
  app.get("/workspaces/:wid/diagnoses/:rid/repairs", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const run = await svc.getRun(wid, rid, app.db);
    return reply.send({ runId: rid, options: svc.buildRepairPlan(run) });
  });

  // Execute a whitelisted repair (audited into timeline, auto re-verify on success)
  app.post("/workspaces/:wid/diagnoses/:rid/repairs/execute", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    const body = (req.body ?? {}) as { key?: string; confirmed?: boolean };
    if (!body.key) throw new Error("缺少修复方案 key");
    return reply.send(await svc.executeRepair(wid, rid, body, app.db));
  });

  // Delete
  app.delete("/workspaces/:wid/diagnoses/:rid", auth, async (req, reply) => {
    const { wid, rid } = req.params as { wid: string; rid: string };
    return reply.send(await svc.deleteRun(wid, rid, app.db));
  });
};
