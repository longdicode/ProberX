// AI 智能体“记忆”：本地 Ollama 向量嵌入 + 余弦检索（bge-m3）。
// 设计原则：索引全部后台异步；嵌入失败自动降级，绝不阻塞/破坏主流程。
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { memoryDocs } from "../db/schema/memory-docs";
import type { DbClient } from "../db/index";
import { env } from "../config/env";

export type MemorySourceType = "diagnosis" | "inspection" | "weekly" | "inventory";

export interface MemoryHit {
  sourceId: string;
  sourceType: MemorySourceType;
  title: string;
  content: string;
  similarity: number;
  updatedAt: Date;
}

export interface MemoryDocInput {
  workspaceId: string;
  serverId: string | null;
  sourceType: MemorySourceType;
  sourceId: string;
  title: string;
  content: string;
}

let lastEmbedFailAt = 0;
const FAIL_BACKOFF_MS = 30_000;
const EMBED_TIMEOUT_MS = 25_000;
const MAX_CONTENT = 6000;
const MAX_QUERY = 3000;

function embedEndpoint(): string {
  return `${(env.EMBED_BASE_URL || "http://host.docker.internal:11434").replace(/\/+$/, "")}/api/embed`;
}

/** 单文本 -> 向量；失败返回 null（带 30s 熔断，避免反复打挂 Ollama） */
export async function embedText(text: string): Promise<number[] | null> {
  if (!env.EMBED_ENABLED) return null;
  const input = (text ?? "").trim().slice(0, MAX_QUERY);
  if (!input) return null;
  const now = Date.now();
  if (now - lastEmbedFailAt < FAIL_BACKOFF_MS) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(embedEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.EMBED_MODEL, input }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`embed api ${res.status}`);
    const data = (await res.json()) as { embeddings?: number[][] };
    const vec = data.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length === 0) throw new Error("empty embedding");
    return vec;
  } catch (err) {
    lastEmbedFailAt = Date.now();
    console.error(`[memory] embed failed (${env.EMBED_MODEL}):`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}

/** 写入/更新一条记忆（内部自吞错，永远不抛） */
export async function indexMemory(db: DbClient, doc: MemoryDocInput): Promise<void> {
  try {
    const content = doc.content.slice(0, MAX_CONTENT);
    const vec = await embedText(content);
    const values = {
      serverId: doc.serverId,
      title: doc.title.slice(0, 500),
      content,
      kind: doc.sourceType,
      embedding: vec ? (vec as unknown as Record<string, unknown>) : null,
      dim: vec ? vec.length : null,
      updatedAt: new Date(),
    };
    const [existing] = await db
      .select({ id: memoryDocs.id })
      .from(memoryDocs)
      .where(
        and(
          eq(memoryDocs.workspaceId, doc.workspaceId),
          eq(memoryDocs.sourceType, doc.sourceType),
          eq(memoryDocs.sourceId, doc.sourceId)
        )
      )
      .limit(1);
    if (existing) {
      await db.update(memoryDocs).set(values).where(eq(memoryDocs.id, existing.id));
    } else {
      await db.insert(memoryDocs).values({
        ...values,
        workspaceId: doc.workspaceId,
        sourceType: doc.sourceType,
        sourceId: doc.sourceId.slice(0, 64),
      });
    }
  } catch (err) {
    console.error("[memory] index failed:", (err as Error).message);
  }
}

/** 向量召回：工作区（可选限定服务器）内按语义相似度取 topK */
export async function recallMemory(
  db: DbClient,
  opts: { workspaceId: string; serverId?: string | null; query: string; topK?: number; minScore?: number }
): Promise<MemoryHit[]> {
  try {
    const topK = opts.topK ?? 5;
    const minScore = opts.minScore ?? 0.32;
    const conds = [eq(memoryDocs.workspaceId, opts.workspaceId), isNotNull(memoryDocs.embedding)];
    if (opts.serverId) conds.push(eq(memoryDocs.serverId, opts.serverId));
    const rows = await db
      .select({
        sourceId: memoryDocs.sourceId,
        sourceType: memoryDocs.sourceType,
        title: memoryDocs.title,
        content: memoryDocs.content,
        embedding: memoryDocs.embedding,
        updatedAt: memoryDocs.updatedAt,
      })
      .from(memoryDocs)
      .where(and(...conds))
      .orderBy(desc(memoryDocs.updatedAt))
      .limit(400);
    if (rows.length === 0) return [];
    const q = await embedText(opts.query);
    if (!q) return [];
    const out: MemoryHit[] = [];
    for (const r of rows) {
      const vec = r.embedding as number[] | null;
      if (!Array.isArray(vec) || vec.length === 0) continue;
      const sim = cosineSimilarity(q, vec);
      if (sim >= minScore) {
        out.push({
          sourceId: r.sourceId,
          sourceType: r.sourceType as MemorySourceType,
          title: r.title,
          content: r.content,
          similarity: sim,
          updatedAt: r.updatedAt,
        });
      }
    }
    return out.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  } catch (err) {
    console.error("[memory] recall failed:", (err as Error).message);
    return [];
  }
}

/** 按类型取最近一条记忆（不依赖向量）：用于“追问上次盘点/巡检/排查”等场景 */
export async function latestMemoryByType(
  db: DbClient,
  opts: { workspaceId: string; serverId?: string | null; sourceType: MemorySourceType }
): Promise<MemoryHit | null> {
  try {
    const conds = [eq(memoryDocs.workspaceId, opts.workspaceId), eq(memoryDocs.sourceType, opts.sourceType)];
    if (opts.serverId) conds.push(eq(memoryDocs.serverId, opts.serverId));
    const rows = await db
      .select({
        sourceId: memoryDocs.sourceId,
        sourceType: memoryDocs.sourceType,
        title: memoryDocs.title,
        content: memoryDocs.content,
        updatedAt: memoryDocs.updatedAt,
      })
      .from(memoryDocs)
      .where(and(...conds))
      .orderBy(desc(memoryDocs.updatedAt))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      sourceId: r.sourceId,
      sourceType: r.sourceType as MemorySourceType,
      title: r.title,
      content: r.content,
      similarity: 1,
      updatedAt: r.updatedAt,
    };
  } catch (err) {
    console.error("[memory] latest failed:", (err as Error).message);
    return null;
  }
}

/** 记忆来源的中文名，用于前端步骤卡展示 */
export function memorySourceLabel(t: string): string {
  if (t === "diagnosis") return "自主排查";
  if (t === "inspection") return "AI 巡检";
  if (t === "weekly") return "AI 运维周报";
  if (t === "inventory") return "站点盘点";
  return t;
}