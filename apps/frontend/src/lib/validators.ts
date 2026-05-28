import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const serverSchema = z.object({
  name: z.string().min(1, "Server name is required").max(255),
  tags: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
});

export const monitorSchema = z.object({
  name: z.string().min(1, "Monitor name is required").max(255),
  type: z.enum(["http", "tcp", "ping", "dns", "ssl", "grpc"]),
  target: z.string().min(1, "Target is required"),
  intervalSec: z.number().min(10).max(3600).default(60),
  timeoutMs: z.number().min(1000).max(30000).default(5000),
});

export const alertRuleSchema = z.object({
  name: z.string().min(1, "Rule name is required").max(255),
  targetType: z.enum(["server", "monitor"]),
  targetId: z.string().uuid(),
  metric: z.string().min(1),
  operator: z.enum(["gt", "lt", "eq", "neq"]),
  threshold: z.number(),
  durationSec: z.number().min(0).default(0),
  severity: z.enum(["warning", "critical", "emergency"]),
});

export const cronJobSchema = z.object({
  name: z.string().min(1, "Job name is required").max(255),
  cronExpr: z.string().min(1, "Cron expression is required"),
  command: z.string().min(1, "Command is required"),
  targetServers: z.array(z.string().uuid()).min(1, "At least one server required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ServerInput = z.infer<typeof serverSchema>;
export type MonitorInput = z.infer<typeof monitorSchema>;
export type AlertRuleInput = z.infer<typeof alertRuleSchema>;
export type CronJobInput = z.infer<typeof cronJobSchema>;
