import { getDb } from "./connection.js";
import { DEFAULT_SECTIONS } from "../config/constants.js";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

export function seed(): void {
  const db = getDb();

  const sectionCount = db.prepare("SELECT COUNT(*) as count FROM sections").get() as { count: number };
  if (sectionCount.count > 0) {
    console.log(`[seed] Sections already exist (${sectionCount.count} rows), skipping.`);
    return;
  }

  const insert = db.prepare("INSERT OR REPLACE INTO sections (key, title, content, updated_at) VALUES (?, ?, ?, datetime('now'))");
  const tx = db.transaction(() => {
    for (const [key, section] of Object.entries(DEFAULT_SECTIONS)) {
      insert.run(key, section.title, JSON.stringify(section.content));
    }
  });
  tx();
  console.log(`[seed] Inserted ${Object.keys(DEFAULT_SECTIONS).length} default sections.`);

  const adminCount = db.prepare("SELECT COUNT(*) as count FROM admins").get() as { count: number };
  if (adminCount.count === 0) {
    const username = env.ADMIN_USERNAME;
    const password = env.ADMIN_PASSWORD;
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)").run(uuid(), username, hash);
    console.log(`[seed] Default admin created: ${username}`);
  }
}

// Allow running directly: `npx tsx src/db/seed.ts`
const isMain = process.argv[1]?.includes("seed");
if (isMain) {
  seed();
  console.log("[seed] Done.");
}
