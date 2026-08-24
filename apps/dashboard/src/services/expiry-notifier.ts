import { eq, and, isNotNull } from "drizzle-orm";
import { servers } from "../db/schema/servers";
import { alertRules } from "../db/schema/alert-rules";
import { alertEvents } from "../db/schema/alert-events";
import { dispatchAlert } from "./notification-dispatcher";
import type { DbClient } from "../db/index";

let timer: ReturnType<typeof setInterval> | null = null;
const DAY_MS = 86400000;
const WINDOW_DAYS = 7;

/** 到期剩余天数（本地日历日差：今天到期 = 0，已过期 = 负数） */
function daysLeft(expiresAt: Date): number {
  const expLocal = new Date(
    expiresAt.getUTCFullYear(),
    expiresAt.getUTCMonth(),
    expiresAt.getUTCDate(),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((expLocal.getTime() - today.getTime()) / DAY_MS);
}

/** 确保工作空间存在“服务器到期提醒”系统规则（用户可在规则列表禁用） */
async function ensureExpiryRule(workspaceId: string, db: DbClient) {
  const [existing] = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.workspaceId, workspaceId),
        eq(alertRules.metric, "server_expiry"),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [rule] = await db
    .insert(alertRules)
    .values({
      workspaceId,
      name: "服务器到期提醒",
      targetType: "server",
      metric: "server_expiry",
      operator: "lte",
      threshold: String(WINDOW_DAYS),
      durationSec: 0,
      severity: "warning",
      isEnabled: true,
    })
    .returning();
  return rule;
}

async function scan(db: DbClient) {
  const due = await db
    .select()
    .from(servers)
    .where(isNotNull(servers.expiresAt));

  for (const s of due) {
    if (!s.expiresAt) continue;
    const left = daysLeft(s.expiresAt);
    // 仅进入 7 天窗口且未提醒过的服务器
    if (left < 0 || left > WINDOW_DAYS) continue;
    if (s.expiryNotifiedAt) continue;

    const rule = await ensureExpiryRule(s.workspaceId, db);
    if (!rule.isEnabled) continue; // 用户禁用了到期提醒规则

    const dateStr = s.expiresAt.toISOString().slice(0, 10);
    const message =
      left === 0
        ? `服务器「${s.name}」今天到期（${dateStr}），请及时续费或清理。`
        : `服务器「${s.name}」将于 ${dateStr} 到期，剩余 ${left} 天。`;

    const [event] = await db
      .insert(alertEvents)
      .values({
        ruleId: rule.id,
        serverId: s.id,
        severity: "warning",
        message,
      })
      .returning();

    await dispatchAlert(db, {
      workspaceId: s.workspaceId,
      eventId: event.id,
      ruleName: rule.name,
      severity: "warning",
      message,
    });

    await db
      .update(servers)
      .set({ expiryNotifiedAt: new Date() })
      .where(eq(servers.id, s.id));
  }
}

export function startExpiryNotifier(db: DbClient, intervalSec = 3600) {
  if (timer) return;
  const run = async () => {
    try {
      await scan(db);
    } catch (err) {
      console.error("Expiry notifier error:", err);
    }
  };
  run();
  timer = setInterval(run, intervalSec * 1000);
  if (typeof timer.unref === "function") timer.unref();
}

export function stopExpiryNotifier() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
