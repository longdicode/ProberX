import crypto from "crypto";
import nodemailer from "nodemailer";

export interface NotificationPayload {
  channelName: string;
  ruleName: string;
  severity: string;
  message: string;
  metricValue?: string;
  workspaceId?: string;
  eventId?: string;
}

// ── Helpers ──────────────────────────────────────────────

function severityColor(severity: string): string {
  const colors: Record<string, string> = {
    warning: "#eab308",
    critical: "#ef4444",
    emergency: "#7c3aed",
  };
  return colors[severity] ?? "#6b7280";
}

function severityDiscordColor(severity: string): number {
  const colors: Record<string, number> = {
    warning: 0xeab308,
    critical: 0xef4444,
    emergency: 0x7c3aed,
  };
  return colors[severity] ?? 0x6b7280;
}

function formatMarkdownBody(payload: NotificationPayload): string {
  const lines = [
    `## [${payload.severity.toUpperCase()}] ${payload.ruleName}`,
    "",
    payload.message,
  ];
  if (payload.metricValue) {
    lines.push("", `**Value:** ${payload.metricValue}`);
  }
  lines.push("", "---", "*Sent by ProberX*");
  return lines.join("\n");
}

// ── DingTalk HMAC-SHA256 signing ─────────────────────────

function signDingTalk(timestamp: number, secret: string): string {
  const sign = crypto
    .createHmac("sha256", secret)
    .update(timestamp + "\n" + secret)
    .digest("base64url");
  return `&timestamp=${timestamp}&sign=${sign}`;
}

// ── Feishu HMAC-SHA256 signing ───────────────────────────

function signFeishu(timestamp: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(timestamp + "\n" + secret)
    .digest("base64");
}

// ── SMTP transporter (lazy singleton) ────────────────────

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

// ── Per-channel sender functions ─────────────────────────

export async function sendWebhook(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const url = config.url as string | undefined;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: payload.channelName,
      rule: payload.ruleName,
      severity: payload.severity,
      message: payload.message,
      value: payload.metricValue,
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendSlack(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const url = config.url as string | undefined;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachments: [
        {
          color: severityColor(payload.severity),
          title: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
          text: payload.message,
          fields: [
            { title: "Severity", value: payload.severity, short: true },
            ...(payload.metricValue
              ? [{ title: "Value", value: payload.metricValue, short: true }]
              : []),
          ],
          footer: "ProberX",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendTelegram(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const botToken = config.botToken as string | undefined;
  const chatId = config.chatId as string | undefined;
  if (!botToken || !chatId) return;
  const text = `<b>[${payload.severity.toUpperCase()}] ${payload.ruleName}</b>\n${payload.message}${payload.metricValue ? `\n\nValue: <code>${payload.metricValue}</code>` : ""}`;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendDiscord(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const webhookUrl = config.webhookUrl as string | undefined;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
          description: payload.message,
          color: severityDiscordColor(payload.severity),
          fields: [
            { name: "Severity", value: payload.severity, inline: true },
            ...(payload.metricValue
              ? [{ name: "Value", value: payload.metricValue, inline: true }]
              : []),
          ],
          footer: { text: "ProberX" },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendEmail(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const to = config.email as string | undefined;
  if (!to) return;
  const color = severityColor(payload.severity);
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM ?? "ProberX <alerts@example.com>",
    to,
    subject: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
    html: `<div style="border-left:4px solid ${color};padding:12px 16px;font-family:sans-serif">
<h2 style="margin:0;color:${color}">${payload.severity.toUpperCase()}: ${payload.ruleName}</h2>
<p style="margin:8px 0;color:#374151">${payload.message}</p>
${payload.metricValue ? `<p style="margin:4px 0;color:#6b7280"><strong>Value:</strong> ${payload.metricValue}</p>` : ""}
<p style="margin-top:16px;font-size:12px;color:#9ca3af">Sent by ProberX</p>
</div>`,
  });
}

export async function sendDingTalk(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  let url = config.url as string | undefined;
  if (!url) return;
  const secret = config.secret as string | undefined;
  if (secret) {
    const ts = Date.now();
    url = url + signDingTalk(ts, secret);
  }
  const text = formatMarkdownBody(payload);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { title: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`, text },
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendFeishu(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const url = config.url as string | undefined;
  if (!url) return;
  const secret = config.secret as string | undefined;

  const headerColor: Record<string, string> = {
    warning: "yellow",
    critical: "red",
    emergency: "purple",
  };

  const body: Record<string, unknown> = {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
        },
        template: headerColor[payload.severity] ?? "grey",
      },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: payload.message } },
        ...(payload.metricValue
          ? [
              {
                tag: "div",
                fields: [
                  {
                    is_short: true,
                    text: { tag: "lark_md", content: `**Value:** ${payload.metricValue}` },
                  },
                ],
              },
            ]
          : []),
        { tag: "hr" },
        {
          tag: "note",
          elements: [{ tag: "plain_text", content: "Sent by ProberX" }],
        },
      ],
    },
  };

  if (secret) {
    const ts = String(Math.floor(Date.now() / 1000));
    body.timestamp = ts;
    body.sign = signFeishu(ts, secret);
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendWeCom(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const url = config.url as string | undefined;
  if (!url) return;
  const text = formatMarkdownBody(payload);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { content: text },
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export async function sendTelegramBot(
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const endpoint = config.endpoint as string | undefined;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: payload.workspaceId,
      eventId: payload.eventId,
      ruleName: payload.ruleName,
      severity: payload.severity,
      message: payload.message,
      metricValue: payload.metricValue,
    }),
    signal: AbortSignal.timeout(5000),
  });
}

// ── Unified sender lookup ────────────────────────────────

const SENDERS: Record<
  string,
  (config: Record<string, unknown>, payload: NotificationPayload) => Promise<void>
> = {
  webhook: sendWebhook,
  slack: sendSlack,
  telegram: sendTelegram,
  discord: sendDiscord,
  email: sendEmail,
  dingtalk: sendDingTalk,
  feishu: sendFeishu,
  wecom: sendWeCom,
  "telegram-bot": sendTelegramBot,
};

export async function sendToChannel(
  type: string,
  config: Record<string, unknown>,
  payload: NotificationPayload,
): Promise<void> {
  const sender = SENDERS[type];
  if (!sender) return;
  try {
    await sender(config, payload);
  } catch {
    // delivery failed — non-critical, never block the alert pipeline
  }
}
