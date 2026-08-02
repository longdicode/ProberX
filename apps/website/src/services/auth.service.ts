import { getDb } from "../db/connection.js";
import bcrypt from "bcryptjs";

export function login(username: string, password: string): { id: string; username: string } | null {
  const db = getDb();
  const row = db.prepare("SELECT id, username, password_hash FROM admins WHERE username = ?").get(username) as { id: string; username: string; password_hash: string } | undefined;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username };
}

export function getAdminById(id: string) {
  const db = getDb();
  return db.prepare("SELECT id, username, created_at FROM admins WHERE id = ?").get(id);
}

export function adminExists(): boolean {
  const db = getDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM admins").get() as { count: number };
  return count > 0;
}
