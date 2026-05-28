import { z } from "zod";

export const createApiKeyBody = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
}, undefined);

export const updateApiKeyBody = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.string()).optional(),
}, undefined);

export type CreateApiKeyInput = z.infer<typeof createApiKeyBody>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeyBody>;
