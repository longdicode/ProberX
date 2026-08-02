import { getDb } from "../db/connection.js";

export interface SectionRow {
  key: string;
  title: string;
  content: string; // JSON string
  updated_at: string;
}

export function getAll(): SectionRow[] {
  return getDb().prepare("SELECT key, title, content, updated_at FROM sections ORDER BY key").all() as SectionRow[];
}

export function getAllForAdmin(): SectionRow[] {
  return getDb().prepare("SELECT key, title, content, updated_at FROM sections ORDER BY key").all() as SectionRow[];
}

export function getByKey(key: string): SectionRow | undefined {
  return getDb().prepare("SELECT key, title, content, updated_at FROM sections WHERE key = ?").get(key) as SectionRow | undefined;
}

export function updateByKey(key: string, title: string | undefined, content: any): SectionRow | null {
  const db = getDb();
  const existing = getByKey(key);
  if (!existing) return null;

  const newTitle = title ?? existing.title;
  const newContent = typeof content === "string" ? content : JSON.stringify(content);

  db.prepare("UPDATE sections SET title = ?, content = ?, updated_at = datetime('now') WHERE key = ?").run(newTitle, newContent, key);

  return getByKey(key)!;
}

export function invalidateCache(): void {
  // Will be called after updates to clear page cache
}
