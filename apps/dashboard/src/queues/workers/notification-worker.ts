import { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { eq, and } from "drizzle-orm";
import { connection } from "../connection";
import type { NotificationJob } from "../notification-queue";
import { notificationChannels } from "../../db/schema/notification-channels";
import type { DbClient } from "../../db/index";

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

function createProcessor(db: DbClient) {
  return async (job: { data: NotificationJob }) => {
    const payload = job.data;

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
            const res = await fetch(url, {
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
            if (!res.ok) throw new Error(`webhook ${ch.name} returned ${res.status}`);
          }
          break;
        }
        case "slack": {
          const url = config?.url as string | undefined;
          if (url) {
            const severityColor: Record<string, string> = { warning: "#eab308", critical: "#ef4444", emergency: "#7c3aed" };
            const res = await fetch(url, {
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
            if (!res.ok) throw new Error(`slack returned ${res.status}`);
          }
          break;
        }
        case "email": {
          const to = config?.email as string | undefined;
          if (to) {
            const severityColor: Record<string, string> = { warning: "#eab308", critical: "#ef4444", emergency: "#7c3aed" };
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
          }
          break;
        }
        default: {
          break;
        }
      }
    }
  };
}

export async function startNotificationWorker(db: DbClient) {
  const worker = new Worker<NotificationJob>("notification-dispatch", createProcessor(db), {
    connection,
    concurrency: 3,
  });

  worker.on("failed", (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err.message);
  });

  return worker;
}
