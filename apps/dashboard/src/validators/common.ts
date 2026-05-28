import { z } from "zod";

export const uuidParam = z.object({
  id: z.string().uuid(),
}, undefined);

export const widParam = z.object({
  wid: z.string().uuid(),
}, undefined);

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
}, undefined);

export const metricsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  interval: z.coerce.number().optional(),
}, undefined);
