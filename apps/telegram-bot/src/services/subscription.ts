import { getDb } from "../db/index.js";

export interface Subscription {
  id: number;
  chat_id: string;
  workspace_id: string;
  workspace_name: string;
  api_key: string;
  created_at: string;
}

export function addSubscription(chatId: number, workspaceId: string, workspaceName: string, apiKey: string): Subscription {
  const db = getDb();
  const chatIdStr = String(chatId);
  // upsert
  const existing = db.prepare("SELECT id FROM subscriptions WHERE chat_id = ?").get(chatIdStr) as { id: number } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE subscriptions SET workspace_id = ?, workspace_name = ?, api_key = ? WHERE chat_id = ?",
    ).run(workspaceId, workspaceName, apiKey, chatIdStr);
  } else {
    db.prepare(
      "INSERT INTO subscriptions (chat_id, workspace_id, workspace_name, api_key) VALUES (?, ?, ?, ?)",
    ).run(chatIdStr, workspaceId, workspaceName, apiKey);
  }
  return db.prepare("SELECT * FROM subscriptions WHERE chat_id = ?").get(chatIdStr) as Subscription;
}

export function getSubscription(chatId: number): Subscription | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM subscriptions WHERE chat_id = ?").get(String(chatId)) as Subscription | undefined;
}

export function removeSubscription(chatId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM subscriptions WHERE chat_id = ?").run(String(chatId));
}

export function getSubscriptionsByWorkspace(workspaceId: string): Subscription[] {
  const db = getDb();
  return db.prepare("SELECT * FROM subscriptions WHERE workspace_id = ?").all(workspaceId) as Subscription[];
}

export function getAllSubscriptions(): Subscription[] {
  const db = getDb();
  return db.prepare("SELECT * FROM subscriptions ORDER BY created_at DESC").all() as Subscription[];
}
