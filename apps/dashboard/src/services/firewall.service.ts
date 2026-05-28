import { getById } from "./server.service";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

async function resolveAgent(workspaceId: string, serverId: string, db: DbClient) {
  const server = await getById(workspaceId, serverId, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");
  return { host, port };
}

export async function getRules(workspaceId: string, serverId: string, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/firewall/rules`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);
  return res.json();
}

export async function addRule(workspaceId: string, serverId: string, body: Record<string, unknown>, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/firewall/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);
  return res.json();
}

export async function deleteRule(workspaceId: string, serverId: string, body: { chain: string; num: string }, db: DbClient) {
  const { host, port } = await resolveAgent(workspaceId, serverId, db);
  const res = await fetch(`http://${host}:${port}/firewall/rules`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);
  return res.json();
}
