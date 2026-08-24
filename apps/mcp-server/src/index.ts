import "dotenv/config";
import { createInterface } from "node:readline";
import { handleRequest, type JsonRpcResponse } from "./protocol.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3001/api/v1";
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN ?? "";
const DASHBOARD_WID = process.env.DASHBOARD_WID ?? "";

function send(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

function log(msg: string): void {
  process.stderr.write([proberx-mcp] \n);
}

const rl = createInterface({ input: process.stdin });

rl.on("line", async (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request: { jsonrpc: string; method: string; id: unknown; params?: unknown };
  try {
    request = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    return;
  }

  if (!request.jsonrpc || request.jsonrpc !== "2.0" || !request.method) {
    send({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id: request.id ?? null });
    return;
  }

  try {
    const result = await handleRequest(request.method, request.params, {
      dashboardUrl: DASHBOARD_URL,
      token: DASHBOARD_TOKEN,
      wid: DASHBOARD_WID,
    });
    send({ jsonrpc: "2.0", result, id: request.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(error: );
    send({ jsonrpc: "2.0", error: { code: -32603, message: msg }, id: request.id });
  }
});

log("ProberX MCP server started");
log(dashboard: );
log(wid: );
