import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3100),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  JWT_SECRET: z.string().min(8).default("proberx-website-secret-change-in-production"),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("proberx-admin"),
});

export const env = envSchema.parse(process.env);
