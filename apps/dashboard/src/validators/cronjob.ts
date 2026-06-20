import { z } from "zod";
import { CronExpressionParser } from "cron-parser";

export const createCronJobBody = z.object({
  name: z.string().min(1).max(255),
  cronExpr: z.string().min(1).max(100).refine((val) => {
    try { CronExpressionParser.parse(val); return true; } catch { return false; }
  }, { message: "Invalid cron expression" }),
  command: z.string().min(1),
  targetServers: z.array(z.string().uuid()).min(1),
}, undefined);

export const updateCronJobBody = z.object({
  name: z.string().min(1).max(255).optional(),
  cronExpr: z.string().min(1).max(100).optional().refine((val) => {
    if (val === undefined) return true;
    try { CronExpressionParser.parse(val); return true; } catch { return false; }
  }, { message: "Invalid cron expression" }),
  command: z.string().min(1).optional(),
  targetServers: z.array(z.string().uuid()).min(1).optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export type CreateCronJobInput = z.infer<typeof createCronJobBody>;
export type UpdateCronJobInput = z.infer<typeof updateCronJobBody>;
