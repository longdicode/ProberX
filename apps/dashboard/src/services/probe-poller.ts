import { eq, and, isNotNull } from "drizzle-orm";
import { monitorTasks } from "../db/schema/monitor-tasks";
import { servers } from "../db/schema/servers";
import { probeResults } from "../db/schema/probe-results";
import { broadcastProbeResult } from "../ws/broadcaster";
import { evaluateProbe } from "./alert-evaluator";
import type { DbClient } from "../db/index";

let timer: ReturnType<typeof setInterval> | null = null;

export function startProbePoller(db: DbClient, intervalSec = 60) {
  if (timer) return;

  const poll = async () => {
    const tasks = await db
      .select({
        id: monitorTasks.id,
        name: monitorTasks.name,
        workspaceId: monitorTasks.workspaceId,
        type: monitorTasks.type,
        target: monitorTasks.target,
        timeoutMs: monitorTasks.timeoutMs,
      })
      .from(monitorTasks)
      .where(eq(monitorTasks.isEnabled, true));

    for (const task of tasks) {
      const [agent] = await db
        .select({
          id: servers.id,
          hostInfo: servers.hostInfo,
        })
        .from(servers)
        .where(
          and(
            eq(servers.workspaceId, task.workspaceId),
            eq(servers.isOnline, true),
            isNotNull(servers.hostInfo),
          ),
        )
        .limit(1);

      const hostInfo = agent?.hostInfo as Record<string, unknown> | null;
      const host = hostInfo?.agent_host as string | undefined;
      const port = (hostInfo?.agent_port as number) ?? 9800;
      if (!host) continue;

      try {
        const res = await fetch(`http://${host}:${port}/probe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: task.type,
            target: task.target,
            timeout_ms: task.timeoutMs,
          }),
          signal: AbortSignal.timeout(task.timeoutMs + 5000),
        });

        if (!res.ok) throw new Error(`probe status ${res.status}`);

        const result = (await res.json()) as {
          is_success: boolean;
          response_ms: number;
          status_code?: number;
          error_msg?: string;
          detail?: unknown;
        };

        await db.insert(probeResults).values({
          time: new Date(),
          taskId: task.id,
          isSuccess: result.is_success,
          responseMs: result.response_ms,
          statusCode: result.status_code ?? null,
          errorMsg: result.error_msg ?? null,
          detail: result.detail ?? {},
        });

        broadcastProbeResult(task.workspaceId, {
          taskId: task.id,
          taskName: task.name,
          isSuccess: result.is_success,
          responseMs: result.response_ms,
          statusCode: result.status_code,
          errorMsg: result.error_msg,
        });

        evaluateProbe(db, task.workspaceId, task.id, task.name, result.is_success, result.response_ms, result.status_code ?? null);
      } catch {
        // Probe execution failed — retry next cycle
      }
    }
  };

  poll();
  timer = setInterval(poll, intervalSec * 1000);
}

export function stopProbePoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
