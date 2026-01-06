ALTER TABLE "routes" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "owner" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "current_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS  "route_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS  "name" varchar(255);--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "token_type" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "token_mint" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "token_decimals" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "hop_amount_tokens" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "hop_amount_raw" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "hops" json NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "creator" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "deployed_at" timestamp;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "deployment_tx_hash" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "route_config_pda" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "deployment_error" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "amount" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "pair_mint" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "last_index" integer;