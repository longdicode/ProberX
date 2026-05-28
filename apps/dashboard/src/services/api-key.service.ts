import { eq, and, desc } from "drizzle-orm";
import { apiKeys } from "../db/schema/api-keys";
import { hashPassword, generateApiKey } from "../utils/crypto";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateApiKeyInput, UpdateApiKeyInput } from "../validators/api-key";

export async function list(workspaceId: string, db: DbClient, limit = 50) {
  return db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    permissions: apiKeys.permissions,
    lastUsedAt: apiKeys.lastUsedAt,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  }).from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId))
    .orderBy(desc(apiKeys.createdAt))
    .limit(limit);
}

export async function create(workspaceId: string, input: CreateApiKeyInput, db: DbClient) {
  const plainKey = generateApiKey();
  const keyHash = await hashPassword(plainKey);

  const [key] = await db.insert(apiKeys).values({
    workspaceId,
    name: input.name,
    keyHash,
    permissions: input.permissions,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  }).returning({
    id: apiKeys.id,
    name: apiKeys.name,
    permissions: apiKeys.permissions,
    expiresAt: apiKeys.expiresAt,
    createdAt: apiKeys.createdAt,
  });

  return { ...key, key: plainKey };
}

export async function update(workspaceId: string, keyId: string, input: UpdateApiKeyInput, db: DbClient) {
  const [existing] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId))).limit(1);
  if (!existing) throw AppError.notFound("API key", keyId);

  const [updated] = await db.update(apiKeys)
    .set({
      name: input.name ?? existing.name,
      permissions: input.permissions ?? existing.permissions,
    })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId)))
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      permissions: apiKeys.permissions,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    });
  return updated;
}

export async function remove(workspaceId: string, keyId: string, db: DbClient) {
  const [key] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId))).limit(1);
  if (!key) throw AppError.notFound("API key", keyId);
  await db.delete(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId)));
}
