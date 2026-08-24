import { z } from "zod";

export const generateInspectionBody = z.object({
  title: z.string().min(1).max(255).optional(),
  hours: z.number().int().min(1).max(168).optional(),
});

export type GenerateInspectionInput = z.infer<typeof generateInspectionBody>;
