import { getById } from "./server.service";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";

async function agentUrl(wid: string, sid: string, db: DbClient): Promise<{ host: string; port: number }> {
  const server = await getById(wid, sid, db);
  const hostInfo = server.hostInfo as Record<string, unknown> | null;
  const host = hostInfo?.agent_host as string | undefined;
  const port = (hostInfo?.agent_port as number) ?? 9800;
  if (!host) throw AppError.badRequest("Server has no agent host configured");
  return { host, port };
}

export async function listFiles(wid: string, sid: string, path: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const url = `http://${host}:${port}/files/list?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);
  return res.json();
}

export async function readFile(wid: string, sid: string, path: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const url = `http://${host}:${port}/files/read?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw AppError.badRequest((err as Record<string, unknown>).error as string || `Agent returned status ${res.status}`);
  }
  return res.json();
}

export async function downloadFileBuffer(wid: string, sid: string, path: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const url = `http://${host}:${port}/files/download?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw AppError.badRequest(`Agent returned status ${res.status}`);
  const disp = res.headers.get("content-disposition") || "";
  const filename = disp.match(/filename="?(.+?)"?\s*$/)?.[1] || "download";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename, contentType: res.headers.get("content-type") || "application/octet-stream" };
}

export async function deleteEntry(wid: string, sid: string, path: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const res = await fetch(`http://${host}:${port}/files/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw AppError.badRequest((err as Record<string, unknown>).error as string || `Agent returned status ${res.status}`);
  }
  return res.json();
}

export async function renameEntry(wid: string, sid: string, path: string, newName: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const res = await fetch(`http://${host}:${port}/files/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, newName }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw AppError.badRequest((err as Record<string, unknown>).error as string || `Agent returned status ${res.status}`);
  }
  return res.json();
}

export async function mkdir(wid: string, sid: string, path: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const res = await fetch(`http://${host}:${port}/files/mkdir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw AppError.badRequest((err as Record<string, unknown>).error as string || `Agent returned status ${res.status}`);
  }
  return res.json();
}

export async function writeFile(wid: string, sid: string, path: string, content: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const res = await fetch(`http://${host}:${port}/files/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw AppError.badRequest((err as Record<string, unknown>).error as string || `Agent returned status ${res.status}`);
  }
  return res.json();
}

export async function uploadFile(wid: string, sid: string, destPath: string, fileBuffer: Buffer, filename: string, db: DbClient) {
  const { host, port } = await agentUrl(wid, sid, db);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filename);
  const url = `http://${host}:${port}/files/upload?path=${encodeURIComponent(destPath)}`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw AppError.badRequest(`Upload failed: status ${res.status}`);
  return res.json();
}
