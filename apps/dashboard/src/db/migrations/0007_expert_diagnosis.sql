ALTER TABLE "diagnosis_runs" ADD COLUMN IF NOT EXISTS "expert_type" varchar(40);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_runs_expert_type_idx" ON "diagnosis_runs" ("expert_type");

