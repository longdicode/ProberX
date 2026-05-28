import type { FastifyPluginAsync } from "fastify";
import { createAlertBody, updateAlertBody } from "../validators/alert";
import { paginationQuery } from "../validators/common";
import * as service from "../services/alert.service";
import * as alertEventService from "../services/alert-event.service";

export const alertRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/alerts", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const pq = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, pq.limit));
  });

  app.post("/workspaces/:wid/alerts", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createAlertBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.patch("/workspaces/:wid/alerts/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateAlertBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/alerts/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });

  // Alert events
  app.get("/workspaces/:wid/alert-events", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const { limit } = paginationQuery.parse(req.query);
    return reply.send(await alertEventService.listByWorkspace(wid, app.db, limit));
  });

  app.get("/workspaces/:wid/alerts/:id/events", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await alertEventService.listByRule(wid, id, app.db));
  });

  app.patch("/workspaces/:wid/alerts/:id/events/:eid", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id, eid } = req.params as { wid: string; id: string; eid: string };
    return reply.send(await alertEventService.resolve(wid, id, eid, app.db));
  });
};