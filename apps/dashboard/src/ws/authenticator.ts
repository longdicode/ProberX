import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config/env";

export interface WsAuth {
  userId: string;
  workspaceId: string;
}

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function wsAuthenticator(app: FastifyInstance, req: FastifyRequest): Promise<WsAuth | null> {
  try {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    const wid = url.searchParams.get("workspaceId");

    if (!token || !wid) return null;

    if (env.NODE_ENV === "development" && token === "bypass") {
      return { userId: DEV_USER_ID, workspaceId: wid };
    }

    const decoded = app.jwt.verify<{ sub: string; email: string }>(token);
    return { userId: decoded.sub, workspaceId: wid };
  } catch {
    return null;
  }
}
