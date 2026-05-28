import type { FastifyPluginAsync } from "fastify";
import { createApiKeyBody, updateApiKeyBody } from "../validators/api-key";
import { paginationQuery } from "../validators/common";
import * as service from "../services/api-key.service";

export const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/api-keys", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const pq = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, pq.limit));
  });

  app.post("/workspaces/:wid/api-keys", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createApiKeyBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.patch("/workspaces/:wid/api-keys/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateApiKeyBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/api-keys/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });
};
