import type { FastifyPluginAsync } from "fastify";
import { createAppStoreEntryBody, updateAppStoreEntryBody, appStoreQuery } from "../validators/app-store";
import * as service from "../services/app-store.service";

export const appStoreRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  // List app store entries with optional category & search filters
  app.get("/workspaces/:wid/app-store", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const query = appStoreQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, { category: query.category, search: query.search }));
  });

  // Get single entry
  app.get("/workspaces/:wid/app-store/:id", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await service.getById(wid, id, app.db));
  });

  // Create entry (admin)
  app.post("/workspaces/:wid/app-store", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createAppStoreEntryBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  // Update entry (admin)
  app.patch("/workspaces/:wid/app-store/:id", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateAppStoreEntryBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  // Delete entry (admin)
  app.delete("/workspaces/:wid/app-store/:id", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });

  // Seed default apps
  app.post("/workspaces/:wid/app-store/seed", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const result = await service.seed(wid, app.db);
    return reply.send(result);
  });
};
