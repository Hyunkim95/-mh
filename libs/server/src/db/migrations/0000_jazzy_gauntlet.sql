CREATE TABLE IF NOT EXISTS "custodial_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"key_identifier" varchar(255) NOT NULL,
	"address" varchar(255) NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"iv" varchar(255) NOT NULL,
	"chain_type" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custodial_wallets_key_identifier_unique" UNIQUE("key_identifier")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_key" varchar(44) NOT NULL,
	"nonce" varchar(32) NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" serial NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_key" varchar(44) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hops" (
	"id" serial PRIMARY KEY NOT NULL,
	"index" integer NOT NULL,
	"to_address" varchar NOT NULL,
	"executes_at" timestamp NOT NULL,
	"executed_at" timestamp,
	"tx_hash" varchar,
	"error" text,
	"is_ready" boolean DEFAULT false NOT NULL,
	"route_id" serial NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar NOT NULL,
	"owner" varchar NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" varchar NOT NULL,
	"pair_address" varchar NOT NULL,
	"fee_percentage" integer NOT NULL,
	"max_hops" integer NOT NULL,
	"max_delay" integer NOT NULL,
	"min_transfer_amount" integer NOT NULL,
	CONSTRAINT "token_configs_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_public_key_idx" ON "auth_challenges" ("public_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_nonce_idx" ON "auth_challenges" ("nonce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_expires_at_idx" ON "auth_challenges" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_public_key_idx" ON "users" ("public_key");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hops" ADD CONSTRAINT "hops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
