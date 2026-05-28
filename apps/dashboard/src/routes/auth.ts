import type { FastifyPluginAsync } from "fastify";
import { loginBody, registerBody, oauthBody } from "../validators/auth";
import * as service from "../services/auth.service";
import { env } from "../config/env";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (req, reply) => {
    const parsed = registerBody.parse(req.body);
    const result = await service.register(parsed, app.db, (payload) => app.jwt.sign(payload as { sub: string; email: string }));
    return reply.code(201).send(result);
  });

  app.post("/login", async (req, reply) => {
    const parsed = loginBody.parse(req.body);
    const result = await service.login(parsed, app.db, (payload, opts) => app.jwt.sign(payload as { sub: string; email: string }, opts));
    return reply.send(result);
  });

  app.post("/refresh", { preHandler: [app.authenticate] }, async (req, reply) => {
    const payload = req.user as { sub: string; email: string };
    const token = app.jwt.sign({ sub: payload.sub, email: payload.email });
    return reply.send({ token });
  });

  app.post("/oauth", async (req, reply) => {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return reply.code(501).send({ code: "NOT_IMPLEMENTED", message: "OAuth is not configured" });
    }
    const parsed = oauthBody.parse(req.body);
    const result = await service.oauthLogin(
      parsed, app.db,
      (payload, opts) => app.jwt.sign(payload as { sub: string; email: string }, opts),
      env.GITHUB_CLIENT_ID!,
      env.GITHUB_CLIENT_SECRET!,
    );
    return reply.send(result);
  });
};