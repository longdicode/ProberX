import { z } from "zod";

export const startDiagnosisBody = z.object({
  goal: z.string().min(4).max(1000),
  title: z.string().min(1).max(255).optional(),
  trigger: z.enum(["manual", "auto"]).default("manual").optional(),
});

export type StartDiagnosisInput = z.infer<typeof startDiagnosisBody>;