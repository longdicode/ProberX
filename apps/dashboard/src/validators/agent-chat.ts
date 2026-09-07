import { z } from "zod";

export const agentChatBody = z.object({
  agent: z.enum(["assistant", "inspection", "diagnosis", "terminal", "workflow", "weekly"]).optional(),
  workflowId: z.string().optional(),
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(20)
    .optional(),
});

export type AgentChatInput = z.infer<typeof agentChatBody>;
