import type { FastifyPluginAsync } from "fastify";
import * as sectionsService from "../../services/sections.service.js";
import { invalidateCache } from "../../services/render.service.js";

export const sectionsRoutes: FastifyPluginAsync = async (app) => {
  const adminAuth = { preHandler: [app.authenticateAdmin] };

  app.get("/api/v1/sections/admin", adminAuth, async () => {
    const rows = sectionsService.getAllForAdmin();
    return {
      sections: rows.map((r) => ({
        key: r.key,
        title: r.title,
        content: JSON.parse(r.content),
        updatedAt: r.updated_at,
      })),
    };
  });

  app.get("/api/v1/sections/:key", adminAuth, async (req, reply) => {
    const { key } = req.params as { key: string };
    const row = sectionsService.getByKey(key);
    if (!row) return reply.status(404).send({ code: "NOT_FOUND", message: `Section '${key}' not found` });
    return { key: row.key, title: row.title, content: JSON.parse(row.content), updatedAt: row.updated_at };
  });

  app.put("/api/v1/sections/:key", adminAuth, async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as { title?: string; content?: any } | undefined;
    if (!body || !body.content) {
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "content is required" });
    }

    const updated = sectionsService.updateByKey(key, body.title, body.content);
    if (!updated) return reply.status(404).send({ code: "NOT_FOUND", message: `Section '${key}' not found` });

    invalidateCache();
    return { key: updated.key, title: updated.title, content: JSON.parse(updated.content), updatedAt: updated.updated_at };
  });
};
