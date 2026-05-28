import type { FastifyPluginAsync } from "fastify";
import { agentRegisterBody, agentHeartbeatBody, agentMetricsBody } from "../validators/agent";
import * as agentService from "../services/agent.service";

export const agentRoutes: FastifyPluginAsync = async (app) => {
  // Agent calls this on startup to report host info and mark itself online.
  // No token auth — agent identifies itself by agentId.
  app.post("/register", async (req, reply) => {
    const parsed = agentRegisterBody.parse(req.body);
    const remoteIp = req.ip ?? req.socket.remoteAddress ?? undefined;
    const result = await agentService.register(parsed, app.db, remoteIp);
    return reply.send(result);
  });

  app.post("/heartbeat", async (req, reply) => {
    const parsed = agentHeartbeatBody.parse(req.body);
    const result = await agentService.heartbeat(parsed.agentId, app.db);
    return reply.send(result);
  });

  app.post("/metrics", async (req, reply) => {
    const parsed = agentMetricsBody.parse(req.body);
    const result = await agentService.ingestMetrics(parsed, app.db);
    return reply.send(result);
  });
};
