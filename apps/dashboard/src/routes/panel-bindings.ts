import type { FastifyPluginAsync } from "fastify";
import { panelBindingBody } from "../validators/panel-binding";
import * as service from "../services/panel-bindings.service";

export const panelBindingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/workspaces/:wid/servers/:sid/panel-bindings", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, sid } = req.params as { wid: string; sid: string };
    return reply.send(await service.listForServer(app.db, wid, sid));
  });

  app.post("/workspaces/:wid/servers/:sid/panel-bindings", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, sid } = req.params as { wid: string; sid: string };
    const parsed = panelBindingBody.parse(req.body ?? {});
    return reply.code(201).send(await service.createBinding(app.db, wid, sid, parsed));
  });

  // 测试「未保存」的候选配置（不落库），供表单先测后存
  app.post("/workspaces/:wid/servers/:sid/panel-bindings/test-candidate", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const parsed = panelBindingBody.parse(req.body ?? {});
    return reply.send(await service.testCandidate(parsed));
  });

  app.patch("/workspaces/:wid/servers/:sid/panel-bindings/:bid", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, sid, bid } = req.params as { wid: string; sid: string; bid: string };
    const parsed = panelBindingBody.parse(req.body ?? {});
    return reply.send(await service.updateBinding(app.db, wid, sid, bid, parsed));
  });

  app.delete("/workspaces/:wid/servers/:sid/panel-bindings/:bid", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, sid, bid } = req.params as { wid: string; sid: string; bid: string };
    await service.removeBinding(app.db, wid, sid, bid);
    return reply.code(204).send();
  });

  // 测试已保存的绑定并回写连接状态
  app.post("/workspaces/:wid/servers/:sid/panel-bindings/:bid/test", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, sid, bid } = req.params as { wid: string; sid: string; bid: string };
    return reply.send(await service.testStoredBinding(app.db, wid, sid, bid));
  });

  // 拉取绑定面板的归一化概览（系统/站点/证书）
  app.get("/workspaces/:wid/servers/:sid/panel-bindings/:bid/overview", { preHandler: [app.authenticate, app.guardWorkspace()] }, async (req, reply) => {
    const { wid, sid, bid } = req.params as { wid: string; sid: string; bid: string };
    return reply.send(await service.fetchBindingOverview(app.db, wid, sid, bid));
  });
};
