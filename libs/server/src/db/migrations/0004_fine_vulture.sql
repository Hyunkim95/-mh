ALTER TABLE "hops" ADD COLUMN "scheduled_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" DROP COLUMN IF EXISTS "delay_minutes";--> statement-breakpoint
ALTER TABLE "hops" DROP COLUMN IF EXISTS "delay_seconds";