import { z } from "zod";

export const aiSettingsBody = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().max(50).optional(),
  apiUrl: z.string().max(500).optional(),
  model: z.string().max(200).optional(),
  /** 非空则覆盖已保存的 key */
  apiKey: z.string().max(500).optional(),
  /** 置 true 时清空已保存的 key */
  clearApiKey: z.boolean().optional(),
});

export type AiSettingsInput = z.infer<typeof aiSettingsBody>;
