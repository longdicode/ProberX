import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CronExpressionParser } from "cron-parser";
import { createCronJobBody, updateCronJobBody } from "../validators/cronjob";
import { paginationQuery } from "../validators/common";
import * as service from "../services/cronjob.service";
import * as execService from "../services/cron-execution.service";

const cronPreviewBody = z.object({
  cronExpr: z.string().min(1),
  count: z.number().int().min(1).max(20).optional().default(5),
});

function buildHumanReadable(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return "Custom schedule";
  const [min, hour, dom, month, dow] = parts;

  // Every hour
  if (min === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") return "Every hour";
  // Daily at midnight
  if (min === "0" && hour === "0" && dom === "*" && month === "*" && dow === "*") return "Daily at midnight";
  // Every 6 hours
  if (min === "0" && hour === "*/6" && dom === "*" && month === "*" && dow === "*") return "Every 6 hours";
  // Weekly (Sunday at 02:00)
  if (min === "0" && hour === "2" && dom === "*" && month === "*" && dow === "0") return "Weekly on Sunday at 02:00";
  // Every X hours
  if (min === "0" && hour.startsWith("*/") && dom === "*" && month === "*" && dow === "*") return `Every ${hour.slice(2)} hours`;
  // Daily at specific time
  if (min !== "*" && hour !== "*" && dom === "*" && month === "*" && dow === "*") return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  // Weekly on specific day
  if (dow !== "*" && dom === "*" && month === "*") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayNames = dow.split(",").map((d) => days[parseInt(d)] || d);
    return `Weekly on ${dayNames.join(", ")} at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  // Monthly on specific day
  if (dom !== "*" && month === "*" && dow === "*") return `Monthly on day ${dom} at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  return "Custom schedule";
}

export const cronjobRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/cronjobs", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const pq = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, pq.limit));
  });

  app.post("/workspaces/:wid/cronjobs", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createCronJobBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.post("/workspaces/:wid/cronjobs/preview", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const parsed = cronPreviewBody.parse(req.body);
    const interval = CronExpressionParser.parse(parsed.cronExpr);
    const nextRuns: string[] = [];
    let current = interval.next();
    for (let i = 0; i < parsed.count; i++) {
      nextRuns.push(current.toDate().toISOString());
      current = interval.next();
    }
    return reply.send({ nextRuns, humanReadable: buildHumanReadable(parsed.cronExpr) });
  });

  app.patch("/workspaces/:wid/cronjobs/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateCronJobBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/cronjobs/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });

  app.get("/workspaces/:wid/cronjobs/:id/executions", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const limit = (req.query as { limit?: string }).limit ? parseInt((req.query as { limit: string }).limit) : 50;
    return reply.send(await execService.listByJob(wid, id, app.db, limit));
  });

  app.get("/workspaces/:wid/cron-executions", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const limit = (req.query as { limit?: string }).limit ? parseInt((req.query as { limit: string }).limit) : 50;
    return reply.send(await execService.listByWorkspace(wid, app.db, limit));
  });
};