import type { FastifyPluginAsync } from "fastify";
import { createCronJobBody, updateCronJobBody } from "../validators/cronjob";
import { paginationQuery } from "../validators/common";
import * as service from "../services/cronjob.service";
import * as execService from "../services/cron-execution.service";

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