ALTER TABLE "metric_snapshots" ADD COLUMN "gpu_name" text;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD COLUMN "gpu_util_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD COLUMN "gpu_mem_total" bigint;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD COLUMN "gpu_mem_used" bigint;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD COLUMN "gpu_temp" numeric(5, 1);