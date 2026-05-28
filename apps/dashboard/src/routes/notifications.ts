import type { FastifyPluginAsync } from "fastify";
import { createChannelBody, updateChannelBody } from "../validators/notification";
import { paginationQuery } from "../validators/common";
import * as service from "../services/notification.service";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/notifications", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const pq = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, pq.limit));
  });

  app.post("/workspaces/:wid/notifications", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createChannelBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.patch("/workspaces/:wid/notifications/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateChannelBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/notifications/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });
};