CREATE TABLE IF NOT EXISTS "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" varchar(255) DEFAULT 'user' NOT NULL,
	"public_key" varchar(44) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "busy_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar(64) NOT NULL,
	"transactions_amount" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "busy_wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
DROP TABLE "auth_challenges";--> statement-breakpoint
DROP TABLE "sessions";--> statement-breakpoint
DROP TABLE "users";--> statement-breakpoint
ALTER TABLE "token_configs" DROP CONSTRAINT "token_configs_address_unique";--> statement-breakpoint
ALTER TABLE "token_configs" ALTER COLUMN "min_transfer_amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "token_symbol" varchar(20);--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "is_easy_route" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "token_mint" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "token_config_address" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "creator" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "fee_bps" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "fee_treasury" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "timelock" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "flat_fee_lamports" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" ADD COLUMN "deprecated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_public_key_idx" ON "user" ("public_key");--> statement-breakpoint
ALTER TABLE "hops" DROP COLUMN IF EXISTS "executes_at";--> statement-breakpoint
ALTER TABLE "hops" DROP COLUMN IF EXISTS "is_ready";--> statement-breakpoint
ALTER TABLE "token_configs" DROP COLUMN IF EXISTS "address";--> statement-breakpoint
ALTER TABLE "token_configs" DROP COLUMN IF EXISTS "fee_percentage";--> statement-breakpoint
ALTER TABLE "token_configs" ADD CONSTRAINT "token_configs_token_config_address_unique" UNIQUE("token_config_address");