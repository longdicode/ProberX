import { z } from "zod";

export const agentRegisterBody = z.object({
  agentId: z.string().min(1).max(64),
  hostInfo: z.record(z.string(), z.unknown()).default({}),
}, undefined);

export const agentHeartbeatBody = z.object({
  agentId: z.string().min(1).max(64),
  timestamp: z.number(),
  metrics: z.object({
    cpu: z.number().optional(),
    mem: z.number().optional(),
    disk: z.number().optional(),
  }, undefined).optional(),
}, undefined);

export const agentMetricsBody = z.object({
  agentId: z.string().min(1).max(64),
  timestamp: z.number(),
  cpu_percent: z.number().min(0).max(100).optional(),
  mem_total: z.number().int().positive().optional(),
  mem_used: z.number().int().positive().optional(),
  disk_total: z.number().int().positive().optional(),
  disk_used: z.number().int().positive().optional(),
  net_in_bytes: z.number().int().positive().optional(),
  net_out_bytes: z.number().int().positive().optional(),
  load_1: z.number().optional(),
  load_5: z.number().optional(),
  load_15: z.number().optional(),
  gpu_name: z.string().optional(),
  gpu_util_percent: z.number().min(0).max(100).optional(),
  gpu_mem_total: z.number().int().min(0).optional(),
  gpu_mem_used: z.number().int().min(0).optional(),
  gpu_temp: z.number().optional(),
  collected_at: z.number().optional(),
}, undefined);

export type AgentRegisterInput = z.infer<typeof agentRegisterBody>;
export type AgentMetricsInput = z.infer<typeof agentMetricsBody>;
