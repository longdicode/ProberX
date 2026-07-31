import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { memberships } from "../db/schema/memberships";
import * as serverSvc from "../services/server.service";
import * as metricsSvc from "../services/metrics.service";
import * as monitorSvc from "../services/monitor.service";
import * as probeSvc from "../services/probe.service";
import * as alertSvc from "../services/alert.service";
import * as alertEventSvc from "../services/alert-event.service";
import * as cronjobSvc from "../services/cronjob.service";
import * as cronExecSvc from "../services/cron-execution.service";
import * as toolsSvc from "../services/tools.service";
import * as statusPageSvc from "../services/status-page.service";
import * as dockerSvc from "../services/docker.service";
import { metricsQuery } from "../validators/common";

// ── JSON-RPC 2.0 types ──

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

// ── Tools ──

const TOOLS: ToolDefinition[] = [
  { name: "list_servers", description: "列出工作空间所有服务器，含在线状态、IP、主机名、操作系统。", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "get_server_metrics", description: "获取指定服务器的 CPU、内存、磁盘、网络历史指标。", inputSchema: { type: "object", properties: { server_id: { type: "string", description: "服务器 UUID" }, range: { type: "string", description: "时间范围", enum: ["1h", "6h", "24h", "7d"] } }, required: ["server_id"] } },
  { name: "get_server_processes", description: "列出服务器上的运行进程。", inputSchema: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_server_containers", description: "列出服务器上的 Docker 容器。", inputSchema: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "list_server_services", description: "列出服务器上的 systemd 服务及其状态。", inputSchema: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_service_status", description: "查询指定 systemd 服务的状态。", inputSchema: { type: "object", properties: { server_id: { type: "string" }, service_name: { type: "string", description: "如 nginx、docker" } }, required: ["server_id", "service_name"] } },
  { name: "list_monitors", description: "列出所有监控探测任务（HTTP、TCP、Ping、DNS、SSL）及其状态。", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "get_probe_results", description: "获取最近的探测结果，可按 monitor_id 过滤。", inputSchema: { type: "object", properties: { monitor_id: { type: "string", description: "可选" } }, required: [] } },
  { name: "list_alerts", description: "列出所有告警规则。", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "list_alert_events", description: "列出最近的告警事件，可按 alert_id 过滤。", inputSchema: { type: "object", properties: { alert_id: { type: "string", description: "可选" } }, required: [] } },
  { name: "ack_alert_event", description: "确认/静默一个告警事件。", inputSchema: { type: "object", properties: { alert_id: { type: "string" }, event_id: { type: "string" } }, required: ["alert_id", "event_id"] } },
  { name: "list_cronjobs", description: "列出所有 Cron 定时任务。", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "list_cron_executions", description: "列出 Cron 任务执行记录。", inputSchema: { type: "object", properties: { cronjob_id: { type: "string", description: "可选" } }, required: [] } },
  { name: "shell_ai_generate", description: "用 AI 将自然语言转成 Shell 命令。支持 OpenAI / Claude / DeepSeek。", inputSchema: { type: "object", properties: { server_id: { type: "string" }, prompt: { type: "string", description: "如'查看占用内存前10的进程'" } }, required: ["server_id", "prompt"] } },
  { name: "shell_ai_execute", description: "在服务器上执行 Shell 命令并返回 stdout、stderr、exit_code。", inputSchema: { type: "object", properties: { server_id: { type: "string" }, command: { type: "string" }, timeout: { type: "number", description: "超时秒数" } }, required: ["server_id", "command"] } },
  { name: "get_shell_ai_config", description: "获取服务器上 Shell AI 的当前配置。", inputSchema: { type: "object", properties: { server_id: { type: "string" } }, required: ["server_id"] } },
  { name: "get_public_status", description: "获取公开状态页信息。", inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
  { name: "get_dashboard_health", description: "检查 Dashboard 健康状态。", inputSchema: { type: "object", properties: {}, required: [] } },
];

// ── Auto-detect workspace for a user ──

async function resolveWid(userId: string, db: any): Promise<string> {
  // Get the users most recently joined workspace
  const [m] = await db.select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.joinedAt)
    .limit(1);
  if (!m) throw new Error("No workspace found for this user. Create one first.");
  return m.workspaceId;
}

// ── Route ──

export const mcpRoutes: FastifyPluginAsync = async (app) => {
  app.post("/mcp", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as JsonRpcRequest;

    if (!body || body.jsonrpc !== "2.0" || !body.method) {
      return reply.send({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: body?.id ?? null });
    }

        // initialize/ping are public; everything else requires JWT
    if (body.method !== "initialize" && body.method !== "ping") {
      try { await (app.authenticate as any)(req, reply); } catch { return; }
      // authenticate sends 401 directly on failure without throwing
      if (reply.sent) return;
    }

    const userId = (req as any).user?.sub;

    // initialize / ping don't need auth or wid
    if (body.method === "initialize") {
      return reply.send({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "proberx-mcp", version: "0.1.0" },
        },
        id: body.id,
      });
    }

    if (body.method === "ping") {
      return reply.send({ jsonrpc: "2.0", result: {}, id: body.id });
    }

    // auto-resolve workspace
    let wid: string;
    try {
      wid = await resolveWid(userId, app.db);
    } catch {
      return reply.send({ jsonrpc: "2.0", error: { code: -32001, message: "No workspace found" }, id: body.id });
    }

    try {
      const result = await dispatch(body.method, body.params, wid, app.db);
      return reply.send({ jsonrpc: "2.0", result, id: body.id });
    } catch (err: any) {
      return reply.send({ jsonrpc: "2.0", error: { code: -32603, message: err.message }, id: body.id });
    }
  });
};

// ── Dispatch ──

async function dispatch(method: string, params: unknown, wid: string, db: any): Promise<unknown> {
  switch (method) {
    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const p = params as { name: string; arguments?: Record<string, unknown> };
      const data = await callTool(p.name, p.arguments ?? {}, wid, db);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    case "resources/list":
      return { resources: [] };

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// ── Tool handlers ──

async function callTool(name: string, args: Record<string, unknown>, wid: string, db: any): Promise<unknown> {
  const sid = args.server_id as string;

  switch (name) {
    case "list_servers":
      return serverSvc.list(wid, db);

    case "get_server_metrics": {
      const range = (args.range as string) ?? "1h";
      return metricsSvc.getServerMetrics(wid, sid, metricsQuery.parse({ range }), db);
    }

    case "get_server_processes":
      return serverSvc.getProcesses(wid, sid, db);

    case "get_server_containers":
      return dockerSvc.getContainers(wid, sid, db);

    case "list_server_services":
      return toolsSvc.listServices(wid, sid, db);

    case "get_service_status":
      return toolsSvc.serviceStatus(wid, sid, args.service_name as string, db);

    case "list_monitors":
      return monitorSvc.list(wid, db);

    case "get_probe_results":
      return args.monitor_id
        ? probeSvc.listByMonitor(wid, args.monitor_id as string, db)
        : probeSvc.listRecent(wid, db);

    case "list_alerts":
      return alertSvc.list(wid, db);

    case "list_alert_events":
      return args.alert_id
        ? alertEventSvc.listByRule(wid, args.alert_id as string, db)
        : alertEventSvc.listByWorkspace(wid, db);

    case "ack_alert_event":
      return alertEventSvc.resolve(wid, args.alert_id as string, args.event_id as string, db);

    case "list_cronjobs":
      return cronjobSvc.list(wid, db);

    case "list_cron_executions":
      return args.cronjob_id
        ? cronExecSvc.listByJob(wid, args.cronjob_id as string, db)
        : cronExecSvc.listByWorkspace(wid, db);

    case "shell_ai_generate":
      return toolsSvc.generateShellCommand(wid, sid, { prompt: args.prompt as string, provider: (args.provider as string) ?? '' }, db);

    case "shell_ai_execute":
      return toolsSvc.executeShellCommand(wid, sid, {
        command: args.command as string,
        timeout: (args.timeout as number) ?? 30,
      }, db);

    case "get_shell_ai_config":
      return toolsSvc.getShellAIConfig(wid, sid, db);

    case "get_public_status":
      return statusPageSvc.getBySlug(args.slug as string, db);

    case "get_dashboard_health":
      return { status: "ok", timestamp: new Date().toISOString() };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
