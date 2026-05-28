import { eq, and } from "drizzle-orm";
import { alertRules } from "../db/schema/alert-rules";
import { alertEvents } from "../db/schema/alert-events";
import { broadcastAlertEvent } from "../ws/broadcaster";
import { dispatchAlert } from "./notification-dispatcher";
import type { DbClient } from "../db/index";

export async function evaluateProbe(
  db: DbClient,
  workspaceId: string,
  taskId: string,
  taskName: string,
  isSuccess: boolean,
  responseMs: number,
  statusCode: number | null,
) {
  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.workspaceId, workspaceId),
        eq(alertRules.isEnabled, true),
        eq(alertRules.targetType, "monitor"),
      ),
    );

  for (const rule of rules) {
    if (rule.targetId && rule.targetId !== taskId) continue;

    const metricValue = rule.metric === "responseMs" ? responseMs : rule.metric === "isSuccess" ? (isSuccess ? 1 : 0) : null;
    if (metricValue === null) continue;

    const threshold = Number(rule.threshold);
    let triggered = false;

    switch (rule.operator) {
      case "gt": triggered = metricValue > threshold; break;
      case "gte": triggered = metricValue >= threshold; break;
      case "lt": triggered = metricValue < threshold; break;
      case "lte": triggered = metricValue <= threshold; break;
      case "eq": triggered = metricValue === threshold; break;
      case "neq": triggered = metricValue !== threshold; break;
    }

    if (!triggered) continue;

    const message = `${rule.name}: ${taskName} ${rule.metric} ${rule.operator} ${threshold} (value=${metricValue})`;

    const [event] = await db.insert(alertEvents).values({
      ruleId: rule.id,
      taskId,
      severity: rule.severity,
      message,
      metricValue: String(metricValue),
    }).returning();

    broadcastAlertEvent(workspaceId, {
      eventId: event.id,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message,
      metricValue,
    });

    dispatchAlert(db, {
      workspaceId,
      eventId: event.id,
      ruleName: rule.name,
      severity: rule.severity,
      message,
      metricValue: String(metricValue),
    });
  }
}

export async function evaluateMetrics(
  db: DbClient,
  workspaceId: string,
  serverId: string,
  serverName: string,
  cpuPercent: number,
  memUsed: number,
  diskUsed: number,
) {
  const rules = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.workspaceId, workspaceId),
        eq(alertRules.isEnabled, true),
        eq(alertRules.targetType, "server"),
      ),
    );

  for (const rule of rules) {
    if (rule.targetId && rule.targetId !== serverId) continue;

    let metricValue: number | null = null;
    switch (rule.metric) {
      case "cpuPercent": metricValue = cpuPercent; break;
      case "memUsed": metricValue = memUsed; break;
      case "diskUsed": metricValue = diskUsed; break;
    }
    if (metricValue === null) continue;

    const threshold = Number(rule.threshold);
    let triggered = false;

    switch (rule.operator) {
      case ">": triggered = metricValue > threshold; break;
      case ">=": triggered = metricValue >= threshold; break;
      case "<": triggered = metricValue < threshold; break;
      case "<=": triggered = metricValue <= threshold; break;
      case "==": triggered = metricValue === threshold; break;
      case "!=": triggered = metricValue !== threshold; break;
    }

    if (!triggered) continue;

    const message = `${rule.name}: ${serverName} ${rule.metric} ${rule.operator} ${threshold}% (${metricValue}%)`;

    const [event] = await db.insert(alertEvents).values({
      ruleId: rule.id,
      serverId,
      severity: rule.severity,
      message,
      metricValue: String(metricValue),
    }).returning();

    broadcastAlertEvent(workspaceId, {
      eventId: event.id,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message,
      metricValue,
    });

    dispatchAlert(db, {
      workspaceId,
      eventId: event.id,
      ruleName: rule.name,
      severity: rule.severity,
      message,
      metricValue: String(metricValue),
    });
  }
}
