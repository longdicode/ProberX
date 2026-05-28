import { eq, and, count } from "drizzle-orm";
import { memberships } from "../db/schema/memberships";
import { users } from "../db/schema/users";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { UpdateMemberInput } from "../validators/membership";

export async function list(workspaceId: string, db: DbClient) {
  return db.select({
    id: memberships.id,
    userId: users.id,
    name: users.name,
    email: users.email,
    avatarUrl: users.avatarUrl,
    role: memberships.role,
    joinedAt: memberships.joinedAt,
  }).from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, workspaceId))
    .orderBy(memberships.joinedAt);
}

export async function updateRole(workspaceId: string, memberId: string, input: UpdateMemberInput, db: DbClient) {
  const [member] = await db.select().from(memberships)
    .where(and(eq(memberships.id, memberId), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  if (!member) throw AppError.notFound("Member", memberId);

  if (member.role === "owner" && input.role !== "owner") {
    const [ownerCount] = await db.select({ count: count() }).from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
    if (ownerCount.count <= 1) throw AppError.badRequest("Cannot change the last owner's role");
  }

  const [updated] = await db.update(memberships)
    .set({ role: input.role })
    .where(and(eq(memberships.id, memberId), eq(memberships.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, memberId: string, db: DbClient) {
  const [member] = await db.select().from(memberships)
    .where(and(eq(memberships.id, memberId), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  if (!member) throw AppError.notFound("Member", memberId);

  if (member.role === "owner") {
    const [ownerCount] = await db.select({ count: count() }).from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")));
    if (ownerCount.count <= 1) throw AppError.badRequest("Cannot remove the last owner");
  }

  await db.delete(memberships)
    .where(and(eq(memberships.id, memberId), eq(memberships.workspaceId, workspaceId)));
}
