import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { env } from "./config/env.js";
import { getDb } from "./db/connection.js";
import { seed } from "./db/seed.js";
import { adminAuthHook } from "./middleware/auth.js";
import { publicRoutes } from "./routes/public.js";
import { authRoutes } from "./routes/api/auth.js";
import { sectionsRoutes } from "./routes/api/sections.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Initialize DB and seed
  getDb();
  seed();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  // Plugins
  await app.register(fjwt, { secret: env.JWT_SECRET });
  await app.register(cors, { origin: true });

  // Static files for admin panel
  await app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "admin"),
    prefix: "/admin/",
  });



  // Desktop app downloads (custom route to avoid duplicate fastifyStatic)
  app.get("/downloads/:file", async (request, reply) => {
    const { file } = request.params as { file: string };
    const safeFile = path.basename(file);
    const filePath = path.join(__dirname, "..", "downloads", safeFile);
    try {
      await fs.access(filePath);
      return reply.sendFile(safeFile, path.join(__dirname, "..", "downloads"));
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }
  });

  // Auth decorator
  app.decorate("authenticateAdmin", adminAuthHook);

  // Routes
  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(sectionsRoutes);

  // Start
  const port = env.PORT;
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`ProberX Website CMS running at http://localhost:${port}`);
  app.log.info(`  → Landing page: http://localhost:${port}/`);
  app.log.info(`  → Admin panel:  http://localhost:${port}/admin`);
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
