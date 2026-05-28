import { z } from "zod";

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
}, undefined);

export const registerBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
}, undefined);

export const oauthBody = z.object({
  provider: z.enum(["github"]),
  code: z.string().min(1),
  redirectUri: z.string().url(),
}, undefined);

export type LoginInput = z.infer<typeof loginBody>;
export type RegisterInput = z.infer<typeof registerBody>;
export type OAuthInput = z.infer<typeof oauthBody>;
