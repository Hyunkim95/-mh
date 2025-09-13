ALTER TABLE "contract_events" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_transactions" ALTER COLUMN "block_time" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_transactions" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "scheduled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "executes_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "executed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "deployed_at" SET DATA TYPE timestamp with time zone;