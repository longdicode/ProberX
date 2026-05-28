import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from "fastify";
import bcrypt from "bcryptjs";
import { servers } from "../db/schema/servers";
import { isNotNull } from "drizzle-orm";

export const agentAuth: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ code: "UNAUTHORIZED", message: "Missing agent token" });
  }
  const token = auth.slice(7);
  const allServers = await req.server.db.select().from(servers).where(isNotNull(servers.agentId));
  let found: typeof servers.$inferSelect | undefined;
  for (const s of allServers) {
    if (s.agentSecret && await bcrypt.compare(token, s.agentSecret)) {
      found = s;
      break;
    }
  }
  if (!found) {
    return reply.code(401).send({ code: "UNAUTHORIZED", message: "Invalid agent token" });
  }
  (req as unknown as Record<string, unknown>).agentServer = found;
};