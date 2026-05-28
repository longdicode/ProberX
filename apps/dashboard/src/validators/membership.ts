import { z } from "zod";

export const updateMemberBody = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
}, undefined);

export type UpdateMemberInput = z.infer<typeof updateMemberBody>;
