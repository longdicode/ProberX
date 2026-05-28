import { z } from "zod";

export const createAlertBody = z.object({
  name: z.string().min(1).max(255),
  targetType: z.enum(["server", "monitor"]),
  targetId: z.string().uuid().optional(),
  metric: z.string().min(1).max(50),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
  threshold: z.number(),
  durationSec: z.number().int().min(0).default(0),
  severity: z.enum(["warning", "critical", "emergency"]).default("warning"),
}, undefined);

export const updateAlertBody = z.object({
  name: z.string().min(1).max(255).optional(),
  metric: z.string().min(1).max(50).optional(),
  operator: z.enum(["gt", "lt", "eq", "neq"]).optional(),
  threshold: z.number().optional(),
  durationSec: z.number().int().min(0).optional(),
  severity: z.enum(["warning", "critical", "emergency"]).optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export type CreateAlertInput = z.infer<typeof createAlertBody>;
export type UpdateAlertInput = z.infer<typeof updateAlertBody>;
