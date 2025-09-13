ALTER TABLE "routes" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "owner" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "current_index" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "token_type" varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "token_mint" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "token_decimals" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "hop_amount_tokens" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "hop_amount_raw" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "hops" json NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "creator" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "status" varchar(20) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "deployed_at" timestamp;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "deployment_tx_hash" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_config_pda" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "deployment_error" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "amount" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "pair_mint" varchar;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "last_index" integer;