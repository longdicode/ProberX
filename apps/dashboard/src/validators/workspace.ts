import { z } from "zod";

export const createWorkspaceBody = z.object({
  name: z.string().min(1).max(255),
}, undefined);

export const updateWorkspaceBody = z.object({
  name: z.string().min(1).max(255).optional(),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
}, undefined);

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceBody>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceBody>;
