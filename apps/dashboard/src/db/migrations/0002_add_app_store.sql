CREATE TABLE "app_store_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'Tools' NOT NULL,
	"icon" varchar(50) DEFAULT 'package' NOT NULL,
	"compose_yaml" text NOT NULL,
	"default_env" jsonb DEFAULT '{}'::jsonb,
	"memory_limit" varchar(20),
	"cpu_limit" varchar(10),
	"logo_url" text,
	"version" varchar(50),
	"author" varchar(255),
	"homepage" text,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_store_entries" ADD CONSTRAINT "app_store_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;