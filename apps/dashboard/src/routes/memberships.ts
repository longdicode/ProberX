import type { FastifyPluginAsync } from "fastify";
import { updateMemberBody } from "../validators/membership";
import * as service from "../services/membership.service";

export const membershipRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/members", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    return reply.send(await service.list(wid, app.db));
  });

  app.patch("/workspaces/:wid/members/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateMemberBody.parse(req.body);
    return reply.send(await service.updateRole(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/members/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });
};
