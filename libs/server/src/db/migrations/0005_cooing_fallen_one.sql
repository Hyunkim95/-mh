CREATE TABLE IF NOT EXISTS "contract_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"signature" varchar NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_data" json NOT NULL,
	"route_pda" varchar,
	"route_id" bigint,
	"creator" varchar,
	"hop_index" integer,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"signature" varchar NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp,
	"fee" bigint DEFAULT 0,
	"success" boolean DEFAULT true NOT NULL,
	"error" text,
	"program_id" varchar NOT NULL,
	"transaction_data" json,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contract_transactions_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_transaction_id_contract_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "contract_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
