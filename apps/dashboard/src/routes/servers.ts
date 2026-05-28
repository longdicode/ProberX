import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { createServerBody, updateServerBody } from "../validators/server";
import { metricsQuery, paginationQuery } from "../validators/common";
import * as service from "../services/server.service";
import * as metricsService from "../services/metrics.service";
import * as dockerService from "../services/docker.service";
import * as fileopsService from "../services/fileops.service";
import * as firewallService from "../services/firewall.service";
import { fileListQuery, fileReadQuery, fileDeleteBody, fileMkdirBody, fileRenameBody } from "../validators/fileops";

const runProbeBody = z.object({
  type: z.enum(["http", "tcp", "ping", "dns", "ssl"]),
  target: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
}, undefined);

export const serverRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/servers", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const pq = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, pq.limit));
  });

  app.post("/workspaces/:wid/servers", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createServerBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  app.get("/workspaces/:wid/servers/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await service.getById(wid, id, app.db));
  });

  app.patch("/workspaces/:wid/servers/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateServerBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  app.delete("/workspaces/:wid/servers/:id", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });

  app.get("/workspaces/:wid/servers/:id/metrics", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const query = metricsQuery.parse(req.query);
    return reply.send(await metricsService.getServerMetrics(wid, id, query, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/regenerate-token", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await service.regenerateToken(wid, id, app.db));
  });

  // On-demand agent actions (pull model)
  app.post("/workspaces/:wid/servers/:id/pull-metrics", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await service.pullMetrics(wid, id, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/run-probe", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = runProbeBody.parse(req.body);
    return reply.send(await service.runProbe(wid, id, parsed, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/processes", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await service.getProcesses(wid, id, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/containers", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await dockerService.getContainers(wid, id, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/files/list", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const query = fileListQuery.parse(req.query);
    return reply.send(await fileopsService.listFiles(wid, id, query.path, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/files/read", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const query = fileReadQuery.parse(req.query);
    return reply.send(await fileopsService.readFile(wid, id, query.path, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/files/download", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const query = fileReadQuery.parse(req.query);
    const { buffer, filename, contentType } = await fileopsService.downloadFileBuffer(wid, id, query.path, app.db);
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", contentType);
    return reply.send(buffer);
  });

  app.post("/workspaces/:wid/servers/:id/files/upload", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const destPath = (req.query as Record<string, string>).path;
    if (!destPath) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "path query parameter required" });
    }
    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "file field required" });
    }
    const buffer = await data.toBuffer();
    return reply.send(await fileopsService.uploadFile(wid, id, destPath, buffer, data.filename, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/files/mkdir", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = fileMkdirBody.parse(req.body);
    return reply.send(await fileopsService.mkdir(wid, id, parsed.path, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/files/rename", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = fileRenameBody.parse(req.body);
    return reply.send(await fileopsService.renameEntry(wid, id, parsed.path, parsed.newName, app.db));
  });

  app.delete("/workspaces/:wid/servers/:id/files/delete", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = fileDeleteBody.parse(req.body);
    return reply.send(await fileopsService.deleteEntry(wid, id, parsed.path, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/firewall/rules", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await firewallService.getRules(wid, id, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/firewall/rules", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await firewallService.addRule(wid, id, req.body as Record<string, unknown>, app.db));
  });

  app.delete("/workspaces/:wid/servers/:id/firewall/rules", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const { chain, num } = req.body as { chain: string; num: string };
    return reply.send(await firewallService.deleteRule(wid, id, { chain, num }, app.db));
  });
};