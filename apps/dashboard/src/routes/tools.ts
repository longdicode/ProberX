import type { FastifyPluginAsync } from "fastify";
import * as svc from "../services/tools.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthCtx = { preHandler: any[] };

// ── Route builders ────────────────────────────────────────────────

/** GET with query parsing */
function getRoute<T>(
  app: Parameters<FastifyPluginAsync>[0], auth: AuthCtx,
  path: string, handler: (wid: string, sid: string, q: any, db: any) => Promise<T>,
) {
  app.get(path, auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await handler(wid, id, req.query, app.db));
  });
}

/** POST with body forwarding */
function postRoute<T>(
  app: Parameters<FastifyPluginAsync>[0], auth: AuthCtx,
  path: string, handler: (wid: string, sid: string, body: any, db: any) => Promise<T>,
) {
  app.post(path, auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await handler(wid, id, req.body, app.db));
  });
}

/** DELETE with body forwarding */
function delRoute<T>(
  app: Parameters<FastifyPluginAsync>[0], auth: AuthCtx,
  path: string, handler: (wid: string, sid: string, body: any, db: any) => Promise<T>,
) {
  app.delete(path, auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await handler(wid, id, req.body, app.db));
  });
}

// ── Route definitions ─────────────────────────────────────────────

export const toolsRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  // systemd
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/services",
    (w, s, _q, db) => svc.listServices(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/services",
    (w, s, b, db) => svc.controlService(w, s, b, db));
  app.get("/workspaces/:wid/servers/:id/tools/services/:name", auth, async (req, reply) => {
    const { wid, id, name } = req.params as { wid: string; id: string; name: string };
    return reply.send(await svc.serviceStatus(wid, id, name, app.db));
  });

  // SSL
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/ssl",
    (w, s, b, db) => svc.checkSSL(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/ssl/issue",
    (w, s, b, db) => svc.issueSSL(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/ssl/renew",
    (w, s, b, db) => svc.renewSSL(w, s, b, db));

  // Logs
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/logs",
    (w, s, q, db) => svc.fetchLogs(w, s, {
      unit: q?.unit, lines: q?.lines ? parseInt(q.lines, 10) : undefined, since: q?.since,
    }, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/logs/file",
    (w, s, q, db) => svc.fetchLogFile(w, s, {
      path: q?.path, lines: q?.lines ? parseInt(q.lines, 10) : undefined,
    }, db));

  // Packages
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/packages",
    (w, s, q, db) => svc.listPackages(w, s, q?.upgradable === "true", db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/packages",
    (w, s, _b, db) => svc.upgradePackages(w, s, db));

  // Nginx
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/nginx",
    (w, s, _q, db) => svc.nginxStatus(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/nginx/reload",
    (w, s, _b, db) => svc.nginxReload(w, s, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/nginx/config",
    (w, s, q, db) => svc.nginxConfig(w, s, q?.path, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/nginx/vhosts",
    (w, s, _q, db) => svc.listVHosts(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/nginx/vhosts",
    (w, s, b, db) => svc.createVHost(w, s, b, db));
  delRoute(app, auth, "/workspaces/:wid/servers/:id/tools/nginx/vhosts",
    (w, s, b, db) => svc.deleteVHost(w, s, b, db));

  // Deploy
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/templates",
    (w, s, _q, db) => svc.listDeployTemplates(w, s, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/list",
    (w, s, _q, db) => svc.listDeployments(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/deploy",
    (w, s, b, db) => svc.deployApp(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/remove",
    (w, s, b, db) => svc.removeDeployment(w, s, b, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/logs",
    (w, s, q, db) => svc.getDeploymentLogs(w, s, q?.appName, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/start",
    (w, s, b, db) => svc.startDeployment(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/stop",
    (w, s, b, db) => svc.stopDeployment(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/restart",
    (w, s, b, db) => svc.restartDeployment(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/update",
    (w, s, b, db) => svc.updateDeployment(w, s, b, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/progress",
    (w, s, q, db) => svc.getDeployProgress(w, s, q?.appName, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/deploy/check-ports",
    (w, s, b, db) => svc.checkPorts(w, s, b, db));

  // Databases
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/databases",
    (w, s, _q, db) => svc.listDatabases(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/databases",
    (w, s, b, db) => svc.installDatabase(w, s, b, db));
  delRoute(app, auth, "/workspaces/:wid/servers/:id/tools/databases",
    (w, s, b, db) => svc.removeDatabase(w, s, b, db));

  // Backups
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups",
    (w, s, _q, db) => svc.listBackups(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/file",
    (w, s, b, db) => svc.createFileBackup(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/db",
    (w, s, b, db) => svc.createDBBackup(w, s, b, db));
  delRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups",
    (w, s, b, db) => svc.deleteBackup(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/restore",
    (w, s, b, db) => svc.restoreBackup(w, s, b, db));

  // Cloud Backups
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud-config",
    (w, s, _q, db) => svc.getCloudConfig(w, s, db));
  app.put("/workspaces/:wid/servers/:id/tools/backups/cloud-config", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    return reply.send(await svc.updateCloudConfig(wid, id, req.body as any, app.db));
  });
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud/upload",
    (w, s, b, db) => svc.uploadToCloud(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud/download",
    (w, s, b, db) => svc.downloadFromCloud(w, s, b, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud/list",
    (w, s, _q, db) => svc.listCloudBackups(w, s, db));
  delRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud",
    (w, s, b, db) => svc.deleteCloudBackup(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud/sync",
    (w, s, _b, db) => svc.syncCloudBackups(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud/cleanup",
    (w, s, b, db) => svc.cleanupCloudBackups(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/backups/cloud/test",
    (w, s, _b, db) => svc.testCloudConnection(w, s, db));

  // Security
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/security/ssh",
    (w, s, _q, db) => svc.auditSSH(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/security/portscan",
    (w, s, b, db) => svc.portScan(w, s, b, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/security/fail2ban",
    (w, s, _q, db) => svc.fail2banStatus(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/security/fail2ban/unban",
    (w, s, b, db) => svc.fail2banUnban(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/security/fail2ban/ban",
    (w, s, b, db) => svc.fail2banBan(w, s, b, db));

  // Shell AI
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/shell-ai/generate",
    (w, s, b, db) => svc.generateShellCommand(w, s, b, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/shell-ai/execute",
    (w, s, b, db) => svc.executeShellCommand(w, s, b, db));

  // Docker Images
  getRoute(app, auth, "/workspaces/:wid/servers/:id/images",
    (w, s, _q, db) => svc.listImages(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/images/pull",
    (w, s, b, db) => svc.pullImage(w, s, b, db));
  app.delete("/workspaces/:wid/servers/:id/images/:imageId", auth, async (req, reply) => {
    const { wid, id, imageId } = req.params as { wid: string; id: string; imageId: string };
    return reply.send(await svc.deleteImage(wid, id, imageId, app.db));
  });
  app.get("/workspaces/:wid/servers/:id/images/:imageId/json", auth, async (req, reply) => {
    const { wid, id, imageId } = req.params as { wid: string; id: string; imageId: string };
    return reply.send(await svc.inspectImage(wid, id, imageId, app.db));
  });
  postRoute(app, auth, "/workspaces/:wid/servers/:id/images/prune",
    (w, s, _b, db) => svc.pruneImages(w, s, db));

  // DNS
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/dns/providers",
    (w, s, _q, db) => svc.listDNSProviders(w, s, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/dns/config",
    (w, s, _q, db) => svc.getDNSConfig(w, s, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/dns/config",
    (w, s, b, db) => svc.saveDNSConfig(w, s, b, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/dns/zones",
    (w, s, _q, db) => svc.listDNSZones(w, s, db));
  getRoute(app, auth, "/workspaces/:wid/servers/:id/tools/dns/records",
    (w, s, q, db) => svc.listDNSRecords(w, s, q?.zoneId, db));
  postRoute(app, auth, "/workspaces/:wid/servers/:id/tools/dns/records",
    (w, s, b, db) => svc.createDNSRecord(w, s, b, db));
  app.put("/workspaces/:wid/servers/:id/tools/dns/records/:recordId", auth, async (req, reply) => {
    const { wid, id, recordId } = req.params as { wid: string; id: string; recordId: string };
    return reply.send(await svc.updateDNSRecord(wid, id, recordId, req.body as any, app.db));
  });
  app.delete("/workspaces/:wid/servers/:id/tools/dns/records/:recordId", auth, async (req, reply) => {
    const { wid, id, recordId } = req.params as { wid: string; id: string; recordId: string };
    const body = req.body as { zone_id: string } | null;
    return reply.send(await svc.deleteDNSRecord(wid, id, recordId, body?.zone_id || "", app.db));
  });
};
