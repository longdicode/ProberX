import { and, eq, sql } from "drizzle-orm";
import { inspectionReports } from "../db/schema/inspection-reports";
import { servers } from "../db/schema/servers";
import { workspaces } from "../db/schema/workspaces";
import type { DbClient } from "../db/index";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Daily health-report scheduler: at 08:00 Beijing time (UTC 00:00 of the
 * same UTC day), generates one inspection report per online server.
 * Protected by a run lock + per-server "already today" DB check.
 */
export function startInspectionScheduler(db: DbClient, intervalSec = 300) {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      // Beijing 08:00 == UTC 00:00 of the same day
      const runAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      if (now.getTime() < runAt.getTime()) return;

      const ws = await db.select({ id: workspaces.id }).from(workspaces);
      for (const w of ws) {
        const online = await db
          .select({ id: servers.id, name: servers.name })
          .from(servers)
          .where(and(eq(servers.workspaceId, w.id), eq(servers.isOnline, true)));

        for (const s of online) {
          // Skip if a scheduled report already exists for this server today
          const rows = await db.execute(sql`
            SELECT 1 FROM inspection_reports
            WHERE workspace_id = ${w.id} AND server_id = ${s.id}
              AND trigger = 'schedule'
              AND created_at >= date_trunc('day', now())
            LIMIT 1
          `);
          if (rows.rows.length > 0) continue;

          try {
            const { generateReport } = await import("./inspection.service");
            await generateReport(
              w.id,
              s.id,
              { title: `${s.name} 每日巡检报告`, hours: 24, trigger: "schedule" },
              db
            );
            console.log(`[inspection-scheduler] daily report done for ${s.name}`);
          } catch (err) {
            console.error("[inspection-scheduler] failed:", (err as Error).message);
          }
        }
      }
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalSec * 1000);
  tick();
  console.log("[inspection-scheduler] daily 08:00 (UTC+8) report scheduler started");
}

export function stopInspectionScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
