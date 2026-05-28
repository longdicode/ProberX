import { eq, and, desc } from "drizzle-orm";
import { statusPages } from "../db/schema/status-pages";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateStatusPageInput, UpdateStatusPageInput } from "../validators/status-page";

export async function list(workspaceId: string, db: DbClient) {
  return db.select().from(statusPages)
    .where(eq(statusPages.workspaceId, workspaceId))
    .orderBy(desc(statusPages.createdAt));
}

export async function create(workspaceId: string, input: CreateStatusPageInput, db: DbClient) {
  const existing = await db.select({ id: statusPages.id }).from(statusPages).where(eq(statusPages.slug, input.slug)).limit(1);
  if (existing.length > 0) throw AppError.conflict("Slug already taken");

  const [sp] = await db.insert(statusPages).values({
    workspaceId,
    name: input.name,
    slug: input.slug,
    customDomain: input.customDomain,
    logoUrl: input.logoUrl,
    theme: input.theme as Record<string, unknown>,
  }).returning();
  return sp;
}

export async function getBySlug(slug: string, db: DbClient) {
  const [sp] = await db.select().from(statusPages)
    .where(and(eq(statusPages.slug, slug), eq(statusPages.isPublished, true))).limit(1);
  if (!sp) throw AppError.notFound("Status page", slug);
  return sp;
}

export async function update(workspaceId: string, pageId: string, input: UpdateStatusPageInput, db: DbClient) {
  const [existing] = await db.select().from(statusPages)
    .where(and(eq(statusPages.id, pageId), eq(statusPages.workspaceId, workspaceId))).limit(1);
  if (!existing) throw AppError.notFound("Status page", pageId);

  const [updated] = await db.update(statusPages)
    .set({
      name: input.name ?? existing.name,
      customDomain: input.customDomain !== undefined ? input.customDomain : existing.customDomain,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : existing.logoUrl,
      theme: input.theme ? (input.theme as Record<string, unknown>) : existing.theme,
      isPublished: input.isPublished ?? existing.isPublished,
    })
    .where(and(eq(statusPages.id, pageId), eq(statusPages.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, pageId: string, db: DbClient) {
  const [sp] = await db.select().from(statusPages)
    .where(and(eq(statusPages.id, pageId), eq(statusPages.workspaceId, workspaceId))).limit(1);
  if (!sp) throw AppError.notFound("Status page", pageId);
  await db.delete(statusPages).where(and(eq(statusPages.id, pageId), eq(statusPages.workspaceId, workspaceId)));
}
