import { eq, and } from "drizzle-orm";
import nodemailer from "nodemailer";
import { notificationChannels } from "../db/schema/notification-channels";
import { env } from "../config/env";
import type { DbClient } from "../db/index";

export interface NotificationPayload {
  workspaceId: string;
  eventId: string;
  ruleName: string;
  severity: string;
  message: string;
  metricValue?: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.example.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER ?? "",
        pass: process.env.SMTP_PASS ?? "",
      },
    });
  }
  return transporter;
}

export async function dispatchAlert(db: DbClient, payload: NotificationPayload) {
  if (env.QUEUE_ENABLED) {
    const { enqueueNotification } = await import("../queues/notification-queue");
    await enqueueNotification(payload);
    return;
  }

  await sendNotifications(db, payload);
}

export async function sendNotifications(db: DbClient, payload: NotificationPayload) {
  const channels = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.workspaceId, payload.workspaceId),
        eq(notificationChannels.isEnabled, true),
      ),
    );

  for (const ch of channels) {
    const config = ch.config as Record<string, unknown>;

    switch (ch.type) {
      case "webhook": {
        const url = config?.url as string | undefined;
        if (url) {
          try {
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channel: ch.name,
                rule: payload.ruleName,
                severity: payload.severity,
                message: payload.message,
                value: payload.metricValue,
              }),
              signal: AbortSignal.timeout(5000),
            });
          } catch {
            // Webhook delivery failed — non-critical
          }
        }
        break;
      }
      case "slack": {
        const url = config?.url as string | undefined;
        if (url) {
          const severityColor: Record<string, string> = { warning: "#eab308", critical: "#ef4444", emergency: "#7c3aed" };
          try {
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                attachments: [{
                  color: severityColor[payload.severity] ?? "#6b7280",
                  title: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
                  text: payload.message,
                  fields: [
                    { title: "Severity", value: payload.severity, short: true },
                    ...(payload.metricValue ? [{ title: "Value", value: payload.metricValue, short: true }] : []),
                  ],
                  footer: "ProberX",
                  ts: Math.floor(Date.now() / 1000),
                }],
              }),
              signal: AbortSignal.timeout(5000),
            });
          } catch {
            // Slack delivery failed — non-critical
          }
        }
        break;
      }
      case "email": {
        const to = config?.email as string | undefined;
        if (to) {
          const severityColor: Record<string, string> = { warning: "#eab308", critical: "#ef4444", emergency: "#7c3aed" };
          try {
            await getTransporter().sendMail({
              from: process.env.SMTP_FROM ?? "ProberX <alerts@example.com>",
              to,
              subject: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
              html: `<div style="border-left:4px solid ${severityColor[payload.severity] ?? "#6b7280"};padding:12px 16px;font-family:sans-serif">
<h2 style="margin:0;color:${severityColor[payload.severity] ?? "#6b7280"}">${payload.severity.toUpperCase()}: ${payload.ruleName}</h2>
<p style="margin:8px 0;color:#374151">${payload.message}</p>
${payload.metricValue ? `<p style="margin:4px 0;color:#6b7280"><strong>Value:</strong> ${payload.metricValue}</p>` : ""}
<p style="margin-top:16px;font-size:12px;color:#9ca3af">Sent by ProberX</p>
</div>`,
            });
          } catch {
            // Email delivery failed — non-critical
          }
        }
        break;
      }
      default: {
        break;
      }
    }
  }
}
