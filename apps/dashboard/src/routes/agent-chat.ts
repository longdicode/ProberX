import type { FastifyPluginAsync } from "fastify";
import { startAgentChat, getAgentTask } from "../services/agent-chat.service";
import { EXPERT_CATALOG } from "../services/expert-agents";
import { agentChatBody } from "../validators/agent-chat";

export const agentChatRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.authenticate, app.guardWorkspace()] };

  // Start an agent chat task (async), returns taskId to poll
  app.post("/workspaces/:wid/servers/:id/agents/chat", auth, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const body = agentChatBody.parse(req.body ?? {});
    return reply.send(startAgentChat(wid, id, body, app.db));
  });

  // Poll task state (steps / text / status)
  app.get("/workspaces/:wid/agents/chat/:taskId", auth, async (req, reply) => {
    const { wid, taskId } = req.params as { wid: string; taskId: string };
    const task = getAgentTask(taskId, wid);
    if (!task) return reply.code(404).send({ error: "Task not found or expired" });
    return reply.send(task);
  });

  // Agent catalog（通用能力 + 13 个专项诊断助手；全局目录，无需 workspace 守卫）
  app.get("/agents", { preHandler: [app.authenticate] }, async (_req, reply) => {
    return reply.send([
      { id: "assistant", name: "通用助手", desc: "日常问答与运维知识", icon: "Sparkles", color: "#6366f1", kind: "chat" },
      { id: "inspection", name: "AI 巡检", desc: "健康巡检与风险报告", icon: "Stethoscope", color: "#10b981", kind: "tool" },
      { id: "diagnosis", name: "自主排查", desc: "多步取证定位根因", icon: "Workflow", color: "#8b5cf6", kind: "tool" },
      { id: "terminal", name: "AI 终端", desc: "自然语言生成并执行命令", icon: "Terminal", color: "#f59e0b", kind: "tool" },
      { id: "weekly", name: "AI 运维周报", desc: "自然语言汇总周期运维与价值", icon: "BarChart3", color: "#0ea5e9", kind: "tool" },
      ...EXPERT_CATALOG,
    ]);
  });
};



