import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAgentSecret(): string {
  return crypto.randomBytes(64).toString("hex");
}

export function generateApiKey(): string {
  return "pk_" + crypto.randomBytes(32).toString("hex");
}