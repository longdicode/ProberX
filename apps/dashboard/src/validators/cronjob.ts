import { z } from "zod";

export const createCronJobBody = z.object({
  name: z.string().min(1).max(255),
  cronExpr: z.string().min(1).max(100),
  command: z.string().min(1),
  targetServers: z.array(z.string().uuid()).min(1),
}, undefined);

export const updateCronJobBody = z.object({
  name: z.string().min(1).max(255).optional(),
  cronExpr: z.string().min(1).max(100).optional(),
  command: z.string().min(1).optional(),
  targetServers: z.array(z.string().uuid()).min(1).optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export type CreateCronJobInput = z.infer<typeof createCronJobBody>;
export type UpdateCronJobInput = z.infer<typeof updateCronJobBody>;
