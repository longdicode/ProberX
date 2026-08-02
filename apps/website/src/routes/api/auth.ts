import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import * as authService from "../../services/auth.service.js";
import { env } from "../../config/env.js";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { getDb } from "../../db/connection.js";

const loginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const setupBody = z.object({
  username: z.string().min(2),
  password: z.string().min(6),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Login
  app.post("/api/v1/auth/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.issues });
    }

    const { username, password } = parsed.data;
    const admin = authService.login(username, password);
    if (!admin) {
      return reply.status(401).send({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const token = app.jwt.sign({ sub: admin.id, username: admin.username }, { expiresIn: "7d" });
    return reply.send({ token, user: { id: admin.id, username: admin.username } });
  });

  // Setup (first admin creation)
  app.post("/api/v1/auth/setup", async (req, reply) => {
    if (authService.adminExists()) {
      return reply.status(400).send({ code: "ALREADY_SETUP", message: "Admin already exists" });
    }

    const parsed = setupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.issues });
    }

    const { username, password } = parsed.data;
    const db = getDb();
    const id = uuid();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)").run(id, username, hash);

    const token = app.jwt.sign({ sub: id, username }, { expiresIn: "7d" });
    return reply.status(201).send({ token, user: { id, username } });
  });

  // Get current admin
  app.get("/api/v1/auth/me", { preHandler: [app.authenticateAdmin] }, async (req) => {
    const payload = req.user as { sub: string; username: string };
    const admin = authService.getAdminById(payload.sub);
    if (!admin) return { code: "NOT_FOUND", message: "Admin not found" };
    return { id: (admin as any).id, username: (admin as any).username };
  });
};
