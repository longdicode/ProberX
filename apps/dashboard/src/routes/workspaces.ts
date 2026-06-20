import type { FastifyPluginAsync } from "fastify";
import { createWorkspaceBody, updateWorkspaceBody } from "../validators/workspace";
import { widParam, alertRangeQuery } from "../validators/common";
import * as service from "../services/workspace.service";

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    return reply.send(await service.list(userId, app.db));
  });

  app.post("/", { preHandler: [app.authenticate] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const parsed = createWorkspaceBody.parse(req.body);
    return reply.code(201).send(await service.create(userId, parsed, app.db));
  });

  app.get("/:wid", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { wid } = req.params as { wid: string };
    return reply.send(await service.getById(userId, wid, app.db));
  });

  app.get("/:wid/dashboard", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    return reply.send(await service.getDashboardStats(wid, app.db));
  });

  app.get("/:wid/alert-trends", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const { range } = alertRangeQuery.parse(req.query);
    return reply.send(await service.getAlertTrends(wid, range, app.db));
  });

  app.get("/:wid/server-comparison", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    return reply.send(await service.getServerComparison(wid, app.db));
  });

  app.patch("/:wid", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { wid } = req.params as { wid: string };
    const parsed = updateWorkspaceBody.parse(req.body);
    return reply.send(await service.update(userId, wid, parsed, app.db));
  });

  app.delete("/:wid", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const userId = (req.user as { sub: string }).sub;
    const { wid } = req.params as { wid: string };
    await service.remove(userId, wid, app.db);
    return reply.code(204).send();
  });
};