export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: unknown;
}

export interface McpContext {
  dashboardUrl: string;
  token: string;
  wid: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

// ---- Tool definitions ----

export const TOOLS: ToolDefinition[] = [
  // === Servers ===
  {
    name: "list_servers",
    description:
      "List all servers in the ProberX workspace with their online/offline status, IP, hostname, and OS info.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_server_metrics",
    description:
      "Get CPU, memory, disk, and network metrics history for a specific server. Supports '1h', '6h', '24h', or '7d' range.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Server UUID" },
        range: { type: "string", description: "Time range", enum: ["1h", "6h", "24h", "7d"] },
      },
      required: ["server_id"],
    },
  },
  {
    name: "get_server_processes",
    description: "List running processes on a server.",
    inputSchema: {
      type: "object",
      properties: { server_id: { type: "string", description: "Server UUID" } },
      required: ["server_id"],
    },
  },
  {
    name: "get_server_containers",
    description: "List Docker containers running on a server.",
    inputSchema: {
      type: "object",
      properties: { server_id: { type: "string", description: "Server UUID" } },
      required: ["server_id"],
    },
  },
  {
    name: "list_server_services",
    description: "List systemd services on a server (nginx, docker, sshd, etc.) with their status.",
    inputSchema: {
      type: "object",
      properties: { server_id: { type: "string", description: "Server UUID" } },
      required: ["server_id"],
    },
  },
  {
    name: "get_service_status",
    description: "Check the status of a specific systemd service on a server.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Server UUID" },
        service_name: { type: "string", description: "Service name (e.g. nginx, docker)" },
      },
      required: ["server_id", "service_name"],
    },
  },

  // === Monitors & Probes ===
  {
    name: "list_monitors",
    description:
      "List all monitoring probes (HTTP, TCP, Ping, DNS, SSL) in the workspace with their current status.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_probe_results",
    description:
      "Get recent probe results. Either across all monitors or filtered to a specific monitor UUID. Shows success/failure, response time, and error details.",
    inputSchema: {
      type: "object",
      properties: {
        monitor_id: { type: "string", description: "Optional: filter by monitor UUID" },
      },
      required: [],
    },
  },

  // === Alerts ===
  {
    name: "list_alerts",
    description:
      "List all alert rules in the workspace — conditions that trigger notifications when monitors fail.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_alert_events",
    description:
      "List recent alert events (triggered alerts) in the workspace. Shows which monitors failed, when, and whether they've been acknowledged.",
    inputSchema: {
      type: "object",
      properties: {
        alert_id: { type: "string", description: "Optional: filter by alert rule UUID" },
      },
      required: [],
    },
  },
  {
    name: "ack_alert_event",
    description: "Acknowledge/resolve an alert event to silence it.",
    inputSchema: {
      type: "object",
      properties: {
        alert_id: { type: "string", description: "Alert rule UUID" },
        event_id: { type: "string", description: "Alert event UUID" },
      },
      required: ["alert_id", "event_id"],
    },
  },

  // === Cronjobs ===
  {
    name: "list_cronjobs",
    description:
      "List all scheduled cron jobs in the workspace with their schedule, last run status, and next run time.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_cron_executions",
    description: "List recent cron job executions with their results.",
    inputSchema: {
      type: "object",
      properties: {
        cronjob_id: { type: "string", description: "Optional: filter by cron job UUID" },
      },
      required: [],
    },
  },

  // === Shell AI (flagship AI feature) ===
  {
    name: "shell_ai_generate",
    description:
      "Use AI to generate a safe shell command from a natural language description. Supports OpenAI, Claude, DeepSeek, or custom LLM providers. The AI runs on the target server and understands its OS environment. Returns both the command and a human-readable explanation.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Server UUID to target" },
        prompt: { type: "string", description: "Natural language description of what you want to do. E.g. 'show top 10 processes by memory usage' or 'check if nginx is listening on port 443'" },
      },
      required: ["server_id", "prompt"],
    },
  },
  {
    name: "shell_ai_execute",
    description:
      "Execute a shell command on a target server and get stdout, stderr, and exit code. Use this after shell_ai_generate to run the AI-generated command, or to run any safe shell command.",
    inputSchema: {
      type: "object",
      properties: {
        server_id: { type: "string", description: "Server UUID to target" },
        command: { type: "string", description: "Shell command to execute" },
        timeout: { type: "number", description: "Timeout in seconds (default: 30, max: 60)" },
      },
      required: ["server_id", "command"],
    },
  },
  {
    name: "get_shell_ai_config",
    description:
      "Get the current Shell AI configuration for a server (provider, model, API key status).",
    inputSchema: {
      type: "object",
      properties: { server_id: { type: "string", description: "Server UUID" } },
      required: ["server_id"],
    },
  },

  // === Public Status ===
  {
    name: "get_public_status",
    description:
      "Get the public status page for a given slug — shows overall system status (operational/degraded) and per-service health.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Status page slug" } },
      required: ["slug"],
    },
  },

  // === Health ===
  {
    name: "get_dashboard_health",
    description: "Check the ProberX Dashboard health status.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// ---- JSON-RPC method handlers ----

export async function handleRequest(
  method: string,
  params: unknown,
  ctx: McpContext,
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "proberx-mcp", version: "0.1.0" },
      };

    case "notifications/initialized":
      return {};

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const p = params as { name: string; arguments?: Record<string, unknown> };
      return await handleToolCall(p.name, p.arguments ?? {}, ctx);
    }

    case "resources/list":
      return { resources: [] };

    case "ping":
      return {};

    default:
      throw new Error(Unknown method: );
  }
}

// ---- Tool call dispatch ----

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await dispatchTool(name, args, ctx);
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return { content: [{ type: "text", text }] };
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<unknown> {
  const { dashboardUrl, token, wid } = ctx;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = Bearer ;

  async function apiGet(path: string): Promise<unknown> {
    const url = ${dashboardUrl};
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(API : );
    }
    return res.json();
  }

  async function apiPatch(path: string, body: unknown): Promise<unknown> {
    const url = ${dashboardUrl};
    const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(API : );
    }
    return res.json();
  }

  async function apiPost(path: string, body: unknown): Promise<unknown> {
    const url = ${dashboardUrl};
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(API : );
    }
    return res.json();
  }

  function requireWid(): string {
    if (!wid) throw new Error("DASHBOARD_WID env var is required for this tool");
    return wid;
  }

  const w = requireWid();
  const sid = args.server_id as string;

  switch (name) {
    // === Servers ===
    case "list_servers":
      return apiGet(/workspaces//servers);

    case "get_server_metrics": {
      const range = (args.range as string) ?? "1h";
      return apiGet(/workspaces//servers//metrics?range=);
    }

    case "get_server_processes":
      return apiGet(/workspaces//servers//processes);

    case "get_server_containers":
      return apiGet(/workspaces//servers//containers);

    case "list_server_services":
      return apiGet(/workspaces//servers//tools/services);

    case "get_service_status":
      return apiGet(/workspaces//servers//tools/services/);

    // === Monitors & Probes ===
    case "list_monitors":
      return apiGet(/workspaces//monitors);

    case "get_probe_results":
      if (args.monitor_id) {
        return apiGet(/workspaces//monitors//results);
      }
      return apiGet(/workspaces//probe-results);

    // === Alerts ===
    case "list_alerts":
      return apiGet(/workspaces//alerts);

    case "list_alert_events":
      if (args.alert_id) {
        return apiGet(/workspaces//alerts//events);
      }
      return apiGet(/workspaces//alert-events);

    case "ack_alert_event":
      return apiPatch(
        /workspaces//alerts//events/,
        {},
      );

    // === Cronjobs ===
    case "list_cronjobs":
      return apiGet(/workspaces//cronjobs);

    case "list_cron_executions":
      if (args.cronjob_id) {
        return apiGet(/workspaces//cronjobs//executions);
      }
      return apiGet(/workspaces//cron-executions);

    // === Shell AI (flagship AI feature) ===
    case "shell_ai_generate":
      return apiPost(/workspaces//servers//tools/shell-ai/generate, {
        prompt: args.prompt,
      });

    case "shell_ai_execute":
      return apiPost(/workspaces//servers//tools/shell-ai/execute, {
        command: args.command,
        timeout: (args.timeout as number) ?? 30,
      });

    case "get_shell_ai_config":
      return apiGet(/workspaces//servers//tools/shell-ai/settings);

    // === Public ===
    case "get_public_status":
      return apiGet(/public/status/);

    // === Health ===
    case "get_dashboard_health": {
      const baseUrl = dashboardUrl.replace(/\/api\/v1$/, "");
      const res = await fetch(${baseUrl}/health);
      if (!res.ok) throw new Error(Health check failed: );
      return res.json();
    }

    default:
      throw new Error(Unknown tool: );
  }
}
