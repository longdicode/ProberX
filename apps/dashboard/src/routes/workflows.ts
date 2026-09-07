import type { FastifyPluginAsync } from "fastify";
import * as svc from "../services/workflow.service";
import { workflowBody } from "../validators/workflow";

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  // Tool catalog for the workflow builder
  app.get("/workspaces/:wid/workflow-tools", auth, async (_req, reply) => {
    return reply.send(svc.workflowToolCatalog());
  });

  // List workflows
  app.get("/workspaces/:wid/workflows", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    return reply.send(await svc.listWorkflows(wid, app.db));
  });

  // Create workflow
  app.post("/workspaces/:wid/workflows", auth, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const body = workflowBody.parse(req.body ?? {});
    return reply.send(await svc.createWorkflow(wid, body, app.db));
  });

  // Update workflow
  app.put("/workspaces/:wid/workflows/:wfid", auth, async (req, reply) => {
    const { wid, wfid } = req.params as { wid: string; wfid: string };
    const body = workflowBody.parse(req.body ?? {});
    return reply.send(await svc.updateWorkflow(wid, wfid, body, app.db));
  });

  // Delete workflow
  app.delete("/workspaces/:wid/workflows/:wfid", auth, async (req, reply) => {
    const { wid, wfid } = req.params as { wid: string; wfid: string };
    return reply.send(await svc.deleteWorkflow(wid, wfid, app.db));
  });

  // Run a workflow against a server (async, poll workflow-runs/:runId)
  app.post("/workspaces/:wid/servers/:id/workflows/:wfid/run", auth, async (req, reply) => {
    const { wid, id, wfid } = req.params as { wid: string; id: string; wfid: string };
    return reply.send(await svc.startWorkflowRun(wid, id, wfid, app.db));
  });

  // Poll a workflow run
  app.get("/workspaces/:wid/workflow-runs/:runId", auth, async (req, reply) => {
    const { wid, runId } = req.params as { wid: string; runId: string };
    const run = svc.getWorkflowRun(runId, wid);
    if (!run) return reply.code(404).send({ error: "Run not found or expired" });
    return reply.send(run);
  });
};