import { z } from "zod";

export const createServerBody = z.object({
  name: z.string().min(1).max(255),
  agentId: z.string().min(1).max(64).optional(),
  tags: z.array(z.string()).default([]),
  isHidden: z.boolean().optional().default(false),
  agentHost: z.string().min(1).max(255).optional(),
  agentPort: z.number().int().min(1).max(65535).optional().default(9800),
  installMode: z.enum(["online", "offline"]).optional().default("offline"),
  dashboardUrl: z.string().min(1).max(255).optional(),
  ssh: z.object({
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535).optional().default(22),
    username: z.string().min(1).max(128).optional().default("root"),
    password: z.string().min(1).max(512),
  }, undefined).optional(),
}, undefined);

export const updateServerBody = z.object({
  name: z.string().min(1).max(255).optional(),
  tags: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
  agentHost: z.string().min(1).max(255).optional(),
  agentPort: z.number().int().min(1).max(65535).optional(),
}, undefined);

export type CreateServerInput = z.infer<typeof createServerBody>;
export type UpdateServerInput = z.infer<typeof updateServerBody>;
