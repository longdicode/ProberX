import { z } from "zod";

export const createMonitorBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["http", "tcp", "ping", "dns", "ssl", "grpc"]),
  target: z.string().min(1),
  intervalSec: z.number().int().min(10).max(3600).default(60),
  timeoutMs: z.number().int().min(1000).max(30000).default(5000),
  settings: z.record(z.string(), z.unknown()).default({}),
}, undefined);

export const updateMonitorBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["http", "tcp", "ping", "dns", "ssl", "grpc"]).optional(),
  target: z.string().min(1).optional(),
  intervalSec: z.number().int().min(10).max(3600).optional(),
  timeoutMs: z.number().int().min(1000).max(30000).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
}, undefined);

export type CreateMonitorInput = z.infer<typeof createMonitorBody>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorBody>;
