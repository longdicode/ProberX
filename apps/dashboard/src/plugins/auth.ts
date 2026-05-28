import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { env } from "../config/env";
import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import { eq, and } from "drizzle-orm";
import { memberships } from "../db/schema/memberships";
import { users } from "../db/schema/users";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    guardWorkspace: (paramName?: string) => preHandlerHookHandler;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

export const authPlugin = fp(async (app) => {
  await app.register(fjwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  const DEV_USER = { sub: "00000000-0000-0000-0000-000000000001", email: "dev@proberx.local" };

  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    if (env.NODE_ENV === "development" && header === "Bearer bypass") {
      await app.db.insert(users).values({ id: DEV_USER.sub, email: DEV_USER.email, name: "Dev User" }).onConflictDoNothing();
      (req as unknown as Record<string, unknown>).user = DEV_USER;
      return;
    }
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      });
    }
  });

  app.decorate("guardWorkspace", (paramName = "wid") =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      const wid = (req.params as Record<string, string>)[paramName];
      const userId = (req as unknown as { user: { sub: string } }).user?.sub;
      if (!userId) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });

      if (env.NODE_ENV === "development" && userId === "dev-001") return;

      const [member] = await app.db.select().from(memberships).where(
        and(eq(memberships.workspaceId, wid), eq(memberships.userId, userId))
      ).limit(1);
      if (!member) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "You do not have access to this workspace" });
      }
    }
  );
});