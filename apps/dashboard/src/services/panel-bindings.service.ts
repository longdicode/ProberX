import { and, desc, eq } from "drizzle-orm";
import { panelBindings } from "../db/schema/panel-bindings";
import { servers } from "../db/schema/servers";
import type { DbClient } from "../db/index";
import { AppError } from "../utils/errors";
import { createPanelAdapter, testConnection } from "./panels/adapters";
import type { PanelAdapterKind, PanelBindingOverview, PanelConnectionConfig, PanelTestResult } from "./panels/types";

type PanelBindingRow = typeof panelBindings.$inferSelect;

const DEFAULT_NAMES: Record<PanelAdapterKind, string> = {
  bt: "BT 面板",
  aapanel: "aaPanel",
};

export interface PanelBindingInput {
  adapter?: PanelAdapterKind;
  name?: string;
  panelUrl?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  enabled?: boolean;
}

function keyHint(key: string): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

function toView(row: PanelBindingRow) {
  const { apiKey, ...rest } = row;
  return {
    ...rest,
    apiKeyConfigured: Boolean(apiKey),
    apiKeyHint: keyHint(apiKey),
  };
}

async function assertServer(db: DbClient, workspaceId: string, serverId: string) {
  const [server] = await db
    .select({ id: servers.id })
    .from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
    .limit(1);
  if (!server) throw AppError.notFound("Server", serverId);
}

async function getBinding(db: DbClient, workspaceId: string, serverId: string, bindingId: string) {
  const [row] = await db
    .select()
    .from(panelBindings)
    .where(and(
      eq(panelBindings.id, bindingId),
      eq(panelBindings.serverId, serverId),
      eq(panelBindings.workspaceId, workspaceId),
    ))
    .limit(1);
  if (!row) throw AppError.notFound("Panel binding", bindingId);
  return row;
}

export async function listForServer(db: DbClient, workspaceId: string, serverId: string) {
  await assertServer(db, workspaceId, serverId);
  const rows = await db
    .select()
    .from(panelBindings)
    .where(and(
      eq(panelBindings.serverId, serverId),
      eq(panelBindings.workspaceId, workspaceId),
    ))
    .orderBy(desc(panelBindings.createdAt));
  return rows.map(toView);
}

export async function createBinding(db: DbClient, workspaceId: string, serverId: string, input: PanelBindingInput) {
  await assertServer(db, workspaceId, serverId);
  const adapter = (input.adapter ?? "bt") as PanelAdapterKind;
  const panelUrl = (input.panelUrl ?? "").trim();
  const apiKey = (input.apiKey ?? "").trim();
  if (!panelUrl) throw AppError.badRequest("面板地址必填");
  if (!apiKey) throw AppError.badRequest("API 密钥必填");
  const [row] = await db
    .insert(panelBindings)
    .values({
      workspaceId,
      serverId,
      adapter,
      name: input.name?.trim() || DEFAULT_NAMES[adapter],
      panelUrl,
      apiKey,
      enabled: input.enabled ?? true,
    })
    .returning();
  return toView(row);
}

export async function updateBinding(
  db: DbClient,
  workspaceId: string,
  serverId: string,
  bindingId: string,
  input: PanelBindingInput,
) {
  await assertServer(db, workspaceId, serverId);
  const existing = await getBinding(db, workspaceId, serverId, bindingId);
  const newKey = typeof input.apiKey === "string" && input.apiKey.trim() ? input.apiKey.trim() : "";
  const apiKey = newKey || (input.clearApiKey ? "" : existing.apiKey);
  if (!apiKey) throw AppError.badRequest("API 密钥不能为空，请重新填写或取消清空");
  const [updated] = await db
    .update(panelBindings)
    .set({
      adapter: input.adapter ?? existing.adapter,
      name: input.name !== undefined ? input.name.trim() || existing.name : existing.name,
      panelUrl: input.panelUrl?.trim() || existing.panelUrl,
      apiKey,
      enabled: input.enabled ?? existing.enabled,
      lastStatus: null,
      errorMsg: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(panelBindings.id, bindingId),
      eq(panelBindings.serverId, serverId),
      eq(panelBindings.workspaceId, workspaceId),
    ))
    .returning();
  return toView(updated);
}

export async function removeBinding(db: DbClient, workspaceId: string, serverId: string, bindingId: string) {
  await assertServer(db, workspaceId, serverId);
  await getBinding(db, workspaceId, serverId, bindingId);
  await db
    .delete(panelBindings)
    .where(and(
      eq(panelBindings.id, bindingId),
      eq(panelBindings.serverId, serverId),
      eq(panelBindings.workspaceId, workspaceId),
    ));
}

function configOf(row: PanelBindingRow): PanelConnectionConfig {
  return { adapter: row.adapter as PanelAdapterKind, panelUrl: row.panelUrl, apiKey: row.apiKey };
}

/** 测试已保存的绑定并回写状态 */
export async function testStoredBinding(
  db: DbClient,
  workspaceId: string,
  serverId: string,
  bindingId: string,
): Promise<{ result: PanelTestResult; binding: ReturnType<typeof toView> }> {
  await assertServer(db, workspaceId, serverId);
  const existing = await getBinding(db, workspaceId, serverId, bindingId);
  const result = await testConnection(configOf(existing));
  const [updated] = await db
    .update(panelBindings)
    .set({
      lastStatus: result.ok ? "ok" : "error",
      errorMsg: result.ok ? null : result.error ?? null,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(panelBindings.id, bindingId))
    .returning();
  return { result, binding: toView(updated) };
}

/** 测试未保存的候选配置（不落库） */
export async function testCandidate(input: PanelBindingInput): Promise<PanelTestResult> {
  const adapter = (input.adapter ?? "bt") as PanelAdapterKind;
  const panelUrl = (input.panelUrl ?? "").trim();
  const apiKey = (input.apiKey ?? "").trim();
  if (!panelUrl) return { ok: false, latencyMs: 0, error: "面板地址必填" };
  if (!apiKey) return { ok: false, latencyMs: 0, error: "API 密钥必填" };
  return testConnection({ adapter, panelUrl, apiKey });
}

/** 拉取绑定面板的归一化概览，并回写连接状态 */
export async function fetchBindingOverview(
  db: DbClient,
  workspaceId: string,
  serverId: string,
  bindingId: string,
): Promise<{ overview: PanelBindingOverview; binding: ReturnType<typeof toView> }> {
  await assertServer(db, workspaceId, serverId);
  const existing = await getBinding(db, workspaceId, serverId, bindingId);
  const adapter = createPanelAdapter(existing.adapter as PanelAdapterKind);
  const overview = await adapter.fetchOverview(configOf(existing));
  const systemOk = overview.system.ok;
  const [updated] = await db
    .update(panelBindings)
    .set({
      lastStatus: systemOk ? "ok" : "error",
      errorMsg: systemOk ? null : (overview.system.ok ? null : overview.system.error),
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(panelBindings.id, bindingId))
    .returning();
  return { overview, binding: toView(updated) };
}
