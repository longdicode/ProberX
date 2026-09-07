import type { FastifyPluginAsync } from "fastify";
import { collectResourceOverview } from "../services/server-resources.service";

/**
 * 服务器资源总览（ProberX Agent 原生直采，不依赖控制面板）。
 */
export const serverResourceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/workspaces/:wid/servers/:sid/resource-overview",
    { preHandler: [app.authenticate, app.guardWorkspace()] },
    async (req, reply) => {
      const { wid, sid } = req.params as { wid: string; sid: string };
      return reply.send(await collectResourceOverview(app.db, wid, sid));
    },
  );
};
