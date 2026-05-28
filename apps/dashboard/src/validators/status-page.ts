import { z } from "zod";

export const createStatusPageBody = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  customDomain: z.string().optional(),
  logoUrl: z.string().url().optional(),
  theme: z.record(z.string(), z.unknown()).default({}),
}, undefined);

export const updateStatusPageBody = z.object({
  name: z.string().min(1).max(255).optional(),
  customDomain: z.string().optional(),
  logoUrl: z.string().url().optional().nullable(),
  theme: z.record(z.string(), z.unknown()).optional(),
  isPublished: z.boolean().optional(),
}, undefined);

export type CreateStatusPageInput = z.infer<typeof createStatusPageBody>;
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageBody>;
