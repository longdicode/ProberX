import "dotenv/config";
import Fastify from "fastify";
import { env } from "./config/env";
import { dbPlugin } from "./plugins/db";
import { authPlugin } from "./plugins/auth";
import { redisPlugin } from "./plugins/redis";
import { errorHandler } from "./plugins/error-handler";
import { rateLimitPlugin } from "./plugins/rate-limit";
import { authRoutes } from "./routes/auth";
import { workspaceRoutes } from "./routes/workspaces";
import { serverRoutes } from "./routes/servers";
import { monitorRoutes } from "./routes/monitors";
import { alertRoutes } from "./routes/alerts";
import { notificationRoutes } from "./routes/notifications";
import { cronjobRoutes } from "./routes/cronjobs";
import { statusPageRoutes } from "./routes/status-pages";
import { agentRoutes } from "./routes/agent";
import { publicRoutes } from "./routes/public";
import { apiKeyRoutes } from "./routes/api-keys";
import { membershipRoutes } from "./routes/memberships";
import { toolsRoutes } from "./routes/tools";
import { appStoreRoutes } from "./routes/app-store";
import { wsPlugin } from "./ws/index";
import { startMetricsPoller, stopMetricsPoller } from "./services/metrics-poller";
import { startProbePoller, stopProbePoller } from "./services/probe-poller";
import { startCronPoller, stopCronPoller } from "./services/cron-poller";

const app = Fastify({
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
  bodyLimit: 5 * 1024 * 1024, // 5 MB
});

let notificationWorker: Awaited<ReturnType<typeof import("./queues/workers/notification-worker").startNotificationWorker>> | null = null;
let cronWorker: Awaited<ReturnType<typeof import("./queues/workers/cron-worker").startCronWorker>> | null = null;

async function start() {
  // Plugins
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(errorHandler);

  // Rate limiting — 100 requests per minute per IP per route
  await app.register(rateLimitPlugin, { max: 100, windowMs: 60_000 });

  // CORS — enabled in all environments, origin configurable via CORS_ORIGIN env
  {
    const cors = await import("@fastify/cors");
    const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
    await app.register(cors.default, {
      origin: corsOrigin.split(",").map(s => s.trim()),
      credentials: true,
    });
  }

  // Multipart for file uploads
  await app.register(import("@fastify/multipart"), { limits: { fileSize: 100 * 1024 * 1024 } });

  // REST routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(workspaceRoutes, { prefix: "/api/v1/workspaces" });
  await app.register(serverRoutes, { prefix: "/api/v1" });
  await app.register(monitorRoutes, { prefix: "/api/v1" });
  await app.register(alertRoutes, { prefix: "/api/v1" });
  await app.register(notificationRoutes, { prefix: "/api/v1" });
  await app.register(cronjobRoutes, { prefix: "/api/v1" });
  await app.register(statusPageRoutes, { prefix: "/api/v1" });
  await app.register(agentRoutes, { prefix: "/api/v1/agent" });
  await app.register(publicRoutes, { prefix: "/api/v1/public" });
  await app.register(apiKeyRoutes, { prefix: "/api/v1" });
  await app.register(membershipRoutes, { prefix: "/api/v1" });
  await app.register(toolsRoutes, { prefix: "/api/v1" });
// App store routes
  await app.register(appStoreRoutes, { prefix: "/api/v1" });

  // WebSocket
  await app.register(wsPlugin, { prefix: "/ws" });

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Start
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT }, "ProberX Dashboard started");

  // Metrics poller — pulls from connected agents every 60s
  startMetricsPoller(app.db, 60);
  app.log.info("Metrics poller started");

  // Probe poller — executes monitor tasks against agents every 60s
  startProbePoller(app.db, 60);
  app.log.info("Probe poller started");

  // Cron poller — executes scheduled cron jobs against agents every 60s
  startCronPoller(app.db, 60);
  app.log.info("Cron poller started");

  // BullMQ workers — process notification dispatch and cron execution jobs
  if (env.QUEUE_ENABLED) {
    const { startNotificationWorker } = await import("./queues/workers/notification-worker");
    const { startCronWorker } = await import("./queues/workers/cron-worker");
    const { connectQueue, closeQueue } = await import("./queues/connection");
    const { notificationQueue } = await import("./queues/notification-queue");
    const { cronExecQueue } = await import("./queues/cron-queue");
    await connectQueue();
    notificationWorker = await startNotificationWorker(app.db);
    cronWorker = await startCronWorker(app.db);
    app.log.info("BullMQ workers started (notification + cron)");

  // Graceful shutdown — stop pollers
  app.addHook("onClose", async () => {
    stopMetricsPoller();
    stopProbePoller();
    stopCronPoller();
    app.log.info("Pollers stopped");
  });

    app.addHook("onClose", async () => {
      await notificationWorker?.close();
      await cronWorker?.close();
      await notificationQueue.close();
      await cronExecQueue.close();
      await closeQueue();
      app.log.info("BullMQ workers shut down");
    });
  }
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
