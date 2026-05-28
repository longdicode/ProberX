import fp from "fastify-plugin";
import { Redis } from "ioredis";
import { env } from "../config/env";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (app) => {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await redis.connect();
  app.decorate("redis", redis);
  app.addHook("onClose", async () => {
    await redis.quit();
  });
});