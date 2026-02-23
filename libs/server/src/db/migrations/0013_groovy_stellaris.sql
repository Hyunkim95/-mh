CREATE TABLE IF NOT EXISTS "intermediate_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"custodial_wallet_id" integer NOT NULL,
	"wallet_index" integer NOT NULL,
	"allocated_amount" varchar NOT NULL,
	"funding_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"funding_tx_hash" varchar,
	"funded_at" timestamp with time zone,
	"aggregation_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"aggregation_scheduled_at" timestamp with time zone,
	"aggregation_tx_hash" varchar,
	"aggregated_at" timestamp with time zone,
	"cleanup_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"dust_return_tx_hash" varchar,
	"ata_close_tx_hash" varchar,
	"cleaned_up_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "obfuscation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"wallet_x_id" integer,
	"intermediate_count" integer NOT NULL,
	"token_mint" varchar,
	"token_type" varchar(10) NOT NULL,
	"total_amount" varchar NOT NULL,
	"estimated_fees_lamports" varchar,
	"actual_fees_lamports" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"retry_count" integer DEFAULT 0,
	CONSTRAINT "obfuscation_sessions_route_id_unique" UNIQUE("route_id")
);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "has_obfuscation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "token_configs" DROP COLUMN IF EXISTS "deprecated";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intermediate_wallets" ADD CONSTRAINT "intermediate_wallets_session_id_obfuscation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "obfuscation_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intermediate_wallets" ADD CONSTRAINT "intermediate_wallets_custodial_wallet_id_custodial_wallets_id_fk" FOREIGN KEY ("custodial_wallet_id") REFERENCES "custodial_wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "obfuscation_sessions" ADD CONSTRAINT "obfuscation_sessions_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "obfuscation_sessions" ADD CONSTRAINT "obfuscation_sessions_wallet_x_id_custodial_wallets_id_fk" FOREIGN KEY ("wallet_x_id") REFERENCES "custodial_wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
