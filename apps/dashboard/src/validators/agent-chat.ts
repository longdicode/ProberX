import { z } from "zod";
import { EXPERT_AGENT_IDS } from "../services/expert-agents";

const AGENT_ENUM = [
  "assistant",
  "inspection",
  "diagnosis",
  "terminal",
  "workflow",
  "weekly",
  ...EXPERT_AGENT_IDS,
] as const;

export const agentChatBody = z.object({
  agent: z.enum(AGENT_ENUM).optional(),
  workflowId: z.string().optional(),
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(20)
    .optional(),
});

export type AgentChatInput = z.infer<typeof agentChatBody>;


