import type { FastifyPluginAsync } from "fastify";
import * as toolsService from "../services/tools.service";

export const toolsRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  app.get("/workspaces/:wid/servers/:id/tools/services", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.listServices(wid, id, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/services", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.controlService(wid, id, req.body as { name: string; action: string }, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/services/:name", auth, async (req, reply) => {
    const { wid, id, name } = req.params as { wid: string; id: string; name: string };
    return reply.send(await toolsService.serviceStatus(wid, id, name, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/ssl", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.checkSSL(wid, id, req.body as { domain: string }, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/logs", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const { unit, lines, since } = req.query as { unit?: string; lines?: string; since?: string };
    return reply.send(await toolsService.fetchLogs(wid, id, {
      unit,
      lines: lines ? parseInt(lines, 10) : undefined,
      since,
    }, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/logs/file", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const { path, lines } = req.query as { path: string; lines?: string };
    return reply.send(await toolsService.fetchLogFile(wid, id, {
      path,
      lines: lines ? parseInt(lines, 10) : undefined,
    }, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/packages", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const upgradableOnly = (req.query as { upgradable?: string }).upgradable === "true";
    return reply.send(await toolsService.listPackages(wid, id, upgradableOnly, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/packages", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.upgradePackages(wid, id, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/nginx", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.nginxStatus(wid, id, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/nginx/reload", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.nginxReload(wid, id, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/nginx/config", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const path = (req.query as { path?: string }).path;
    return reply.send(await toolsService.nginxConfig(wid, id, path, app.db));
  });

  // --- Deploy ---

  app.get("/workspaces/:wid/servers/:id/tools/deploy/templates", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.listDeployTemplates(wid, id, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/deploy/list", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.listDeployments(wid, id, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/deploy", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.deployApp(wid, id, req.body as any, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/remove", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.removeDeployment(wid, id, req.body as { appName: string }, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/deploy/logs", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const appName = (req.query as { appName: string }).appName;
    return reply.send(await toolsService.getDeploymentLogs(wid, id, appName, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/start", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.startDeployment(wid, id, req.body as { appName: string }, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/stop", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.stopDeployment(wid, id, req.body as { appName: string }, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/restart", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.restartDeployment(wid, id, req.body as { appName: string }, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/update", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.updateDeployment(wid, id, req.body as { appName: string }, app.db));
  });

  app.get("/workspaces/:wid/servers/:id/tools/deploy/progress", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const appName = (req.query as { appName: string }).appName;
    return reply.send(await toolsService.getDeployProgress(wid, id, appName, app.db));
  });

  app.post("/workspaces/:wid/servers/:id/tools/deploy/check-ports", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await toolsService.checkPorts(wid, id, req.body as { ports: string[] }, app.db));
  });
};
