CREATE TABLE IF NOT EXISTS "panel_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"server_id" uuid NOT NULL,
	"adapter" varchar(20) DEFAULT 'bt' NOT NULL,
	"name" varchar(100),
	"panel_url" text NOT NULL,
	"api_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_status" varchar(40),
	"error_msg" text,
	"last_checked_at" timestamptz,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "panel_bindings" ADD CONSTRAINT "panel_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "panel_bindings" ADD CONSTRAINT "panel_bindings_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "panel_bindings_server_id_idx" ON "panel_bindings" ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "panel_bindings_workspace_id_idx" ON "panel_bindings" ("workspace_id");
