import { z } from "zod";

export const createAppStoreEntryBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1).max(50).default("Tools"),
  icon: z.string().min(1).max(50).default("package"),
  composeYaml: z.string().min(1),
  defaultEnv: z.record(z.string(), z.string()).optional(),
  memoryLimit: z.string().max(20).optional(),
  cpuLimit: z.string().max(10).optional(),
  logoUrl: z.string().optional(),
  version: z.string().max(50).optional(),
  author: z.string().max(255).optional(),
  homepage: z.string().optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export const updateAppStoreEntryBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().min(1).max(50).optional(),
  icon: z.string().min(1).max(50).optional(),
  composeYaml: z.string().min(1).optional(),
  defaultEnv: z.record(z.string(), z.string()).optional(),
  memoryLimit: z.string().max(20).optional(),
  cpuLimit: z.string().max(10).optional(),
  logoUrl: z.string().optional(),
  version: z.string().max(50).optional(),
  author: z.string().max(255).optional(),
  homepage: z.string().optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export const appStoreQuery = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

export type CreateAppStoreEntryInput = z.infer<typeof createAppStoreEntryBody>;
export type UpdateAppStoreEntryInput = z.infer<typeof updateAppStoreEntryBody>;
