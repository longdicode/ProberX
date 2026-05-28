import type { FastifyPluginAsync } from "fastify";
import { createStatusPageBody, updateStatusPageBody } from "../validators/status-page";
import * as service from "../services/status-page.service";

export const statusPageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/status-pages", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    return reply.send(await service.list(wid, app.db));
  });

  app.post("/workspaces/:wid/status-pages", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createStatusPageBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.patch("/workspaces/:wid/status-pages/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateStatusPageBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/status-pages/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });
};