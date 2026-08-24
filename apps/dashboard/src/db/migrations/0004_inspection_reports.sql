CREATE TABLE IF NOT EXISTS "inspection_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"server_id" uuid,
	"title" varchar(255) NOT NULL,
	"trigger" varchar(20) DEFAULT 'manual' NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"health_score" integer,
	"summary" text,
	"findings" jsonb DEFAULT '[]'::jsonb,
	"metrics_summary" jsonb DEFAULT '{}'::jsonb,
	"markdown" text,
	"raw_evidence" text,
	"error" text,
	"started_at" timestamptz DEFAULT now() NOT NULL,
	"finished_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_reports_workspace_id_idx" ON "inspection_reports" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_reports_created_at_idx" ON "inspection_reports" ("created_at" DESC);
