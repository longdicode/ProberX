ALTER TABLE "servers" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "expiry_notified_at" timestamp with time zone;
