CREATE TABLE IF NOT EXISTS "diagnosis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"server_id" uuid,
	"title" varchar(255) NOT NULL,
	"goal" text NOT NULL,
	"trigger" varchar(20) DEFAULT 'manual' NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"root_cause" text,
	"confidence" integer,
	"evidence" text,
	"conclusion" text,
	"suggestions" jsonb DEFAULT '[]'::jsonb,
	"error" text,
	"started_at" timestamptz DEFAULT now() NOT NULL,
	"finished_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnosis_runs" ADD CONSTRAINT "diagnosis_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "diagnosis_runs" ADD CONSTRAINT "diagnosis_runs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_runs_workspace_id_idx" ON "diagnosis_runs" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_runs_created_at_idx" ON "diagnosis_runs" ("created_at" DESC);