import { z } from "zod";

export const workflowStepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["builtin", "shell", "mcp"]),
  tool: z.string().min(1),
  name: z.string().max(100).optional().default(""),
  args: z.record(z.string(), z.unknown()).optional().default({}),
});

export const workflowBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional().default(""),
  trigger: z.string().max(100).optional().default(""),
  steps: z.array(workflowStepSchema).min(1).max(20),
  enabled: z.boolean().optional().default(true),
});

export type WorkflowInput = z.infer<typeof workflowBody>;