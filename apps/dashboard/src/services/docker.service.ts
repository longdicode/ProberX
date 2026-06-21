import { getById } from "./server.service";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

export async function getContainers(workspaceId: string, serverId: string, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  const agentSecret = server.agentSecret as string | undefined;
  if (!host) throw AppError.badRequest("Server has no agent host configured");

  const headers: Record<string, string> = {};
  if (agentSecret) headers["Authorization"] = `Bearer ${agentSecret}`;
  const res = await fetch(`http://${host}:${port}/containers`, {
    headers: Object.keys(headers).length ? headers : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);

  return res.json();
}
