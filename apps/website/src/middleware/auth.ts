import type { preHandlerHookHandler } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticateAdmin: preHandlerHookHandler;
  }
}

export const adminAuthHook: preHandlerHookHandler = async function (req, reply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
};
