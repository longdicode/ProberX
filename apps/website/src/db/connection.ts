import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "data", "proberx.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Auto-create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id           TEXT PRIMARY KEY,
      username     TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sections (
      key          TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      content      TEXT NOT NULL DEFAULT '{}',
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
}
