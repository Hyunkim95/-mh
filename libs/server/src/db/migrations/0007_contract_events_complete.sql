-- Contract Events System Migration
-- This migration ensures all tables needed for the contract events system are present

-- Contract transactions table (may already exist from migration 0005)
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

-- Contract events table (may already exist from migration 0005)
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

-- ETL cursors table for tracking ETL job progress
CREATE TABLE IF NOT EXISTS "etl_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" varchar(255) NOT NULL,
	"cursor_value" text NOT NULL,
	"metadata" json,
	"last_processed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "etl_cursors_job_name_unique" UNIQUE("job_name")
);

-- Add foreign key constraint for contract_events -> contract_transactions
DO $$ BEGIN
 ALTER TABLE "contract_events" ADD CONSTRAINT "contract_events_transaction_id_contract_transactions_id_fk" 
 FOREIGN KEY ("transaction_id") REFERENCES "contract_transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "idx_contract_events_route_pda" ON "contract_events" ("route_pda");
CREATE INDEX IF NOT EXISTS "idx_contract_events_event_type" ON "contract_events" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_contract_events_processed" ON "contract_events" ("processed");
CREATE INDEX IF NOT EXISTS "idx_contract_events_signature" ON "contract_events" ("signature");
CREATE INDEX IF NOT EXISTS "idx_contract_transactions_program_id" ON "contract_transactions" ("program_id");
CREATE INDEX IF NOT EXISTS "idx_contract_transactions_slot" ON "contract_transactions" ("slot");
CREATE INDEX IF NOT EXISTS "idx_etl_cursors_job_name" ON "etl_cursors" ("job_name"); 