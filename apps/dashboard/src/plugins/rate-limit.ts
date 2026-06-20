import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../utils/errors";

/** Simple in-memory rate limiter — no external dependencies */
export const rateLimitPlugin: FastifyPluginAsync<{
  max?: number;      // max requests per window (default: 100)
  windowMs?: number; // time window in ms (default: 60_000)
}> = async (app, opts) => {
  const max = opts.max ?? 100;
  const windowMs = opts.windowMs ?? 60_000;
  const store = new Map<string, { count: number; resetAt: number }>();

  // Cleanup stale entries every 5 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 300_000);
  if (cleanup.unref) cleanup.unref();

  app.addHook("onRequest", async (req) => {
    // Use IP + route prefix as key (different limits per endpoint group)
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `${ip}:${req.routeOptions?.url ?? req.url}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
    }

    entry.count++;
    store.set(key, entry);

    // Set rate limit headers on the request object for the onSend hook
    const remaining = Math.max(0, max - entry.count);
    const resetSec = Math.ceil((entry.resetAt - now) / 1000);
    (req as any).__rateLimit = { remaining, resetSec };

    if (entry.count > max) {
      throw AppError.tooMany(
        `Rate limit exceeded. Try again in ${resetSec}s`
      );
    }
  });

  // Add rate limit headers to all responses
  app.addHook("onSend", async (req, _reply, payload) => {
    const rl = (req as any).__rateLimit;
    if (rl) {
      _reply.header("X-RateLimit-Remaining", String(rl.remaining));
      _reply.header("X-RateLimit-Reset", String(rl.resetSec));
    }
    return payload;
  });
};
