import type { FastifyPluginAsync } from "fastify";
import { createMonitorBody, updateMonitorBody } from "../validators/monitor";
import { paginationQuery } from "../validators/common";
import * as service from "../services/monitor.service";
import * as probeService from "../services/probe.service";

export const monitorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/monitors", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const pq = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, pq.limit));
  });

  app.post("/workspaces/:wid/monitors", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createMonitorBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.patch("/workspaces/:wid/monitors/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateMonitorBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/monitors/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });

  // Probe results
  app.get("/workspaces/:wid/monitors/:id/results", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const { limit } = paginationQuery.parse(req.query);
    return reply.send(await probeService.listByMonitor(wid, id, app.db, limit));
  });

  app.get("/workspaces/:wid/probe-results", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const { limit } = paginationQuery.parse(req.query);
    return reply.send(await probeService.listRecent(wid, app.db, limit));
  });
};