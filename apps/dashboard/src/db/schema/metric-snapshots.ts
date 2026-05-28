import { pgTable, uuid, timestamp, decimal, bigint, jsonb, text } from "drizzle-orm/pg-core";
import { servers } from "./servers";

export const metricSnapshots = pgTable("metric_snapshots", {
  time: timestamp("time", { withTimezone: true }).notNull(),
  serverId: uuid("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  cpuPercent: decimal("cpu_percent", { precision: 5, scale: 2 }),
  memTotal: bigint("mem_total", { mode: "number" }),
  memUsed: bigint("mem_used", { mode: "number" }),
  diskTotal: bigint("disk_total", { mode: "number" }),
  diskUsed: bigint("disk_used", { mode: "number" }),
  netInBytes: bigint("net_in_bytes", { mode: "number" }),
  netOutBytes: bigint("net_out_bytes", { mode: "number" }),
  load1: decimal("load_1", { precision: 6, scale: 2 }),
  load5: decimal("load_5", { precision: 6, scale: 2 }),
  load15: decimal("load_15", { precision: 6, scale: 2 }),
  gpuName: text("gpu_name"),
  gpuUtilPercent: decimal("gpu_util_percent", { precision: 5, scale: 2 }),
  gpuMemTotal: bigint("gpu_mem_total", { mode: "number" }),
  gpuMemUsed: bigint("gpu_mem_used", { mode: "number" }),
  gpuTemp: decimal("gpu_temp", { precision: 5, scale: 1 }),
  extra: jsonb("extra").default({}),
});