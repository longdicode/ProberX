import { eq, and } from "drizzle-orm";
import { users } from "../db/schema/users";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { LoginInput, RegisterInput, OAuthInput } from "../validators/auth";

export async function getUserById(id: string, db: DbClient) {
  const [user] = await db.select({
    id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl, createdAt: users.createdAt,
  }).from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function register(input: RegisterInput, db: DbClient, jwtSign: (payload: object) => string) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length > 0) throw AppError.conflict("Email already registered");

  const passwordHash = await hashPassword(input.password);
  const [user] = await db.insert(users).values({
    email: input.email,
    passwordHash,
    name: input.name,
  }).returning({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl, createdAt: users.createdAt });

  const token = jwtSign({ sub: user.id, email: user.email });
  return { token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } };
}

export async function login(input: LoginInput, db: DbClient, jwtSign: (payload: object, opts?: Record<string, unknown>) => string) {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user || !user.passwordHash) throw AppError.unauthorized("Invalid email or password");

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw AppError.unauthorized("Invalid email or password");

  const token = jwtSign({ sub: user.id, email: user.email });
  const refreshToken = jwtSign({ sub: user.id, email: user.email }, { expiresIn: "30d" });
  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
  };
}

export async function oauthLogin(input: OAuthInput, db: DbClient, jwtSign: (payload: object, opts?: Record<string, unknown>) => string, clientId: string, clientSecret: string) {
  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: input.code, redirect_uri: input.redirectUri }),
  });
  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) throw AppError.badRequest(tokenData.error || "OAuth token exchange failed");

  // Fetch GitHub user
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "ProberX" },
  });
  const ghUser = await userRes.json() as { id: number; login: string; avatar_url: string; email?: string; name?: string };
  if (!ghUser.id) throw AppError.badRequest("Failed to fetch GitHub user");

  // Fetch emails if not public
  let email = ghUser.email;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "ProberX" },
    });
    const emails = await emailsRes.json() as { email: string; primary: boolean; verified: boolean }[];
    const primary = emails.find((e) => e.primary && e.verified);
    if (primary) email = primary.email;
  }

  const oauthId = String(ghUser.id);

  // Find existing
  const [existing] = await db.select({
    id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl,
  }).from(users)
    .where(and(eq(users.oauthProvider, input.provider), eq(users.oauthId, oauthId)))
    .limit(1);

  const user = existing ?? await db.insert(users).values({
    email: email || `${ghUser.login}@github.oauth`,
    name: ghUser.name || ghUser.login,
    avatarUrl: ghUser.avatar_url,
    oauthProvider: input.provider,
    oauthId,
  }).returning({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl }).then(([u]) => u);

  const token = jwtSign({ sub: user.id, email: user.email ?? undefined });
  const refreshToken = jwtSign({ sub: user.id, email: user.email ?? undefined }, { expiresIn: "30d" });
  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
  };
}
