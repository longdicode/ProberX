import { Redis } from "ioredis";
import { env } from "../config/env";

export const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export async function connectQueue(): Promise<void> {
  await connection.connect();
}

export async function closeQueue(): Promise<void> {
  await connection.quit();
}
