import { z } from "zod";

export const panelAdapterKind = z.enum(["bt", "aapanel"]);

export const panelBindingBody = z.object({
  adapter: panelAdapterKind.optional(),
  name: z.string().max(100).optional(),
  panelUrl: z.string().max(500).optional(),
  /** 非空则覆盖已保存的密钥 */
  apiKey: z.string().max(500).optional(),
  /** 置 true 时清空已保存的密钥 */
  clearApiKey: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export type PanelBindingBody = z.infer<typeof panelBindingBody>;
