import { env } from "../config/env";

export interface ChatOptions {
  system: string;
  user: string;
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:11434/v1 */
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Minimal OpenAI-compatible chat completion client.
 * Used by the AI inspection pipeline (defaults to the local Ollama model).
 */
export async function chatComplete(opts: ChatOptions): Promise<string> {
  const apiUrl = (opts.apiUrl || env.LLM_API_URL).replace(/\/$/, "") + "/chat/completions";
  const model = opts.model || env.LLM_MODEL;
  const apiKey = opts.apiKey ?? env.LLM_API_KEY;

  const body = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 2048,
    stream: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 180_000);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM returned empty response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the first JSON object from an LLM response (tolerates code fences / prose). */
export function extractJson<T = Record<string, unknown>>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in LLM response");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
