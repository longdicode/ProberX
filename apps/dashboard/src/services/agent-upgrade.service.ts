import { getById } from "./server.service";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

/**
 * Triggers a remote agent self-upgrade. The agent downloads the latest
 * binary from the panel download server, replaces itself and restarts.
 */
export async function upgradeAgent(workspaceId: string, serverId: string, body: { url?: string }, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (server.agentSecret) headers["Authorization"] = `Bearer ${server.agentSecret}`;

  const res = await fetch(`http://${host}:${port}/upgrade`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);
  return res.json();
}
