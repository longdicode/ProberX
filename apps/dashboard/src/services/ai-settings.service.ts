import { eq } from "drizzle-orm";
import { workspaces } from "../db/schema/workspaces";
import { env } from "../config/env";
import { chatComplete } from "./llm-client";
import type { DbClient } from "../db/index";

/**
 * Per-workspace AI (LLM) settings for the AI Agent module.
 * Stored inside `workspaces.settings.ai` as jsonb - no DDL migration needed.
 *
 * settings.ai = {
 *   enabled: boolean,   // enable workspace-level AI endpoint (overrides server env)
 *   provider: string,   // openai | deepseek | claude | proberx | custom
 *   apiUrl: string,     // OpenAI-compatible base URL, e.g. https://api.deepseek.com/v1
 *   model: string,
 *   apiKey: string      // stored server-side only, never returned to the client
 * }
 */

const AI_KEY = "ai";
const EMPTY: AiSettingsRecord = { enabled: false, provider: "", apiUrl: "", model: "", apiKey: "" };

export interface AiSettingsRecord {
  enabled: boolean;
  provider: string;
  apiUrl: string;
  model: string;
  apiKey: string;
}

/** Fields passed into chatComplete to override environment defaults */
export interface AiLlmOverrides {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface ResolvedAiLlm extends AiLlmOverrides {
  provider: string;
  apiUrl: string;
  model: string;
  source: "workspace" | "env";
}

export interface EffectiveAiLlmView {
  provider: string;
  apiUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  source: "workspace" | "env";
}

export interface AiSettingsView {
  enabled: boolean;
  provider: string;
  apiUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
  effective: EffectiveAiLlmView;
}

export interface AiSettingsInput {
  enabled?: boolean;
  provider?: string;
  apiUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
}

export function parseAiSettings(settings: unknown): AiSettingsRecord {
  const root = (settings ?? {}) as Record<string, unknown>;
  const ai = (root[AI_KEY] ?? {}) as Record<string, unknown>;
  if (!ai || typeof ai !== "object") return { ...EMPTY };
  return {
    enabled: ai.enabled === true,
    provider: typeof ai.provider === "string" ? ai.provider.slice(0, 50) : "",
    apiUrl: typeof ai.apiUrl === "string" ? ai.apiUrl.slice(0, 500) : "",
    model: typeof ai.model === "string" ? ai.model.slice(0, 200) : "",
    apiKey: typeof ai.apiKey === "string" ? ai.apiKey.slice(0, 500) : "",
  };
}

/** Remove settings.ai.apiKey so it never leaks through generic workspace endpoints. */
export function redactAiKey(settings: unknown): unknown {
  const root = (settings ?? {}) as Record<string, unknown>;
  if (!root || typeof root !== "object") return settings;
  const clone: Record<string, unknown> = { ...root };
  const ai = (clone[AI_KEY] ?? {}) as Record<string, unknown>;
  if (ai && typeof ai === "object") {
    const aiClone: Record<string, unknown> = { ...ai };
    delete aiClone.apiKey;
    clone[AI_KEY] = aiClone;
  }
  return clone;
}

export function keyHint(key: string): string | null {
  if (!key) return null;
  if (key.length <= 8) return "已配置";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

/** Effective config: enabled + at least one field set -> workspace wins (blank fields fall back to env). */
export function resolveEffective(rec: AiSettingsRecord): ResolvedAiLlm {
  const hasAny = Boolean(rec.apiUrl.trim() || rec.model.trim() || rec.apiKey.trim());
  if (rec.enabled && hasAny) {
    return {
      provider: rec.provider.trim() || "custom",
      apiUrl: rec.apiUrl.trim() || env.LLM_API_URL,
      model: rec.model.trim() || env.LLM_MODEL,
      apiKey: rec.apiKey.trim() || env.LLM_API_KEY || undefined,
      source: "workspace",
    };
  }
  return {
    provider: "env",
    apiUrl: env.LLM_API_URL,
    model: env.LLM_MODEL,
    apiKey: env.LLM_API_KEY || undefined,
    source: "env",
  };
}

async function readRawSettings(db: DbClient, workspaceId: string): Promise<unknown> {
  const [row] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row?.settings ?? {};
}

export async function readStored(db: DbClient, workspaceId: string): Promise<AiSettingsRecord> {
  return parseAiSettings(await readRawSettings(db, workspaceId));
}

/**
 * Workspace-level effective LLM config. AI services (agent chat / inspection /
 * diagnosis / weekly / inventory) call this once at entry and pass the returned
 * apiUrl/apiKey/model into chatComplete to override environment defaults.
 */
export async function resolveAiLlm(db: DbClient, workspaceId: string): Promise<ResolvedAiLlm> {
  try {
    return resolveEffective(await readStored(db, workspaceId));
  } catch (err) {
    console.warn(`[ai-settings] resolve fallback to env for ${workspaceId}:`, (err as Error).message);
    return resolveEffective(EMPTY);
  }
}

function toView(rec: AiSettingsRecord): AiSettingsView {
  const eff = resolveEffective(rec);
  return {
    enabled: rec.enabled,
    provider: rec.provider,
    apiUrl: rec.apiUrl,
    model: rec.model,
    apiKeyConfigured: Boolean(rec.apiKey),
    apiKeyHint: keyHint(rec.apiKey),
    // 不把 apiKey 明文回传，只暴露是否已配置
    effective: {
      provider: eff.provider,
      apiUrl: eff.apiUrl,
      model: eff.model,
      apiKeyConfigured: Boolean(eff.apiKey),
      source: eff.source,
    },
  };
}

export async function getAiSettings(db: DbClient, workspaceId: string): Promise<AiSettingsView> {
  return toView(await readStored(db, workspaceId));
}

export async function updateAiSettings(
  db: DbClient,
  workspaceId: string,
  input: AiSettingsInput
): Promise<AiSettingsView> {
  const prev = await readStored(db, workspaceId);
  const next: AiSettingsRecord = {
    enabled: input.enabled ?? prev.enabled,
    provider: input.provider !== undefined ? input.provider.trim() : prev.provider,
    apiUrl: input.apiUrl !== undefined ? input.apiUrl.trim() : prev.apiUrl,
    model: input.model !== undefined ? input.model.trim() : prev.model,
    apiKey: prev.apiKey,
  };
  if (input.clearApiKey) {
    next.apiKey = "";
  } else if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    next.apiKey = input.apiKey.trim();
  }

  const raw = ((await readRawSettings(db, workspaceId)) ?? {}) as Record<string, unknown>;
  await db
    .update(workspaces)
    .set({ settings: { ...raw, [AI_KEY]: next }, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  return toView(next);
}

export interface AiTestResult {
  ok: boolean;
  latencyMs: number;
  model: string;
  apiUrl: string;
  reply?: string;
  error?: string;
}

/** Run a minimal request with the current (or candidate, unsaved) config to verify connectivity. */
export async function testAiSettings(
  db: DbClient,
  workspaceId: string,
  candidate: AiSettingsInput = {}
): Promise<AiTestResult> {
  const prev = await readStored(db, workspaceId);
  const merged: AiSettingsRecord = {
    enabled: candidate.enabled ?? prev.enabled,
    provider: candidate.provider !== undefined ? candidate.provider.trim() : prev.provider,
    apiUrl: candidate.apiUrl !== undefined ? candidate.apiUrl.trim() : prev.apiUrl,
    model: candidate.model !== undefined ? candidate.model.trim() : prev.model,
    apiKey: candidate.clearApiKey
      ? ""
      : typeof candidate.apiKey === "string" && candidate.apiKey.trim()
        ? candidate.apiKey.trim()
        : prev.apiKey,
  };
  const llm = resolveEffective(merged);
  const startedAt = Date.now();
  try {
    const reply = await chatComplete({
      system: "你是连接测试助手。收到请求后只回复两个字：成功",
      user: "ping",
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: 0,
      maxTokens: 16,
      timeoutMs: 30_000,
    });
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      model: llm.model,
      apiUrl: llm.apiUrl,
      reply: (reply ?? "").slice(0, 200),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model: llm.model,
      apiUrl: llm.apiUrl,
      error: (err as Error).message,
    };
  }
}
