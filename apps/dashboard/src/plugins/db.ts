import fp from "fastify-plugin";
import { createDb, type DbClient } from "../db/index";
import { env } from "../config/env";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
  }
}

export const dbPlugin = fp(async (app) => {
  const db = createDb(env.DATABASE_URL);
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    await db.$client.end();
  });
});