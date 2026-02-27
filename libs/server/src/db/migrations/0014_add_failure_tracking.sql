-- Add failure tracking columns to obfuscation_sessions table
ALTER TABLE "obfuscation_sessions" ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0;
ALTER TABLE "obfuscation_sessions" ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp with time zone;
ALTER TABLE "obfuscation_sessions" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;
ALTER TABLE "obfuscation_sessions" ADD COLUMN IF NOT EXISTS "locked_by" varchar(255);
ALTER TABLE "obfuscation_sessions" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;

-- Add failure tracking columns to intermediate_wallets table
ALTER TABLE "intermediate_wallets" ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0;
ALTER TABLE "intermediate_wallets" ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp with time zone;
ALTER TABLE "intermediate_wallets" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;

-- Create index for efficient querying of sessions by lock status
CREATE INDEX IF NOT EXISTS "idx_obfuscation_sessions_locked" ON "obfuscation_sessions" ("locked_by", "locked_at");

-- Create index for efficient querying of wallets ready for retry
CREATE INDEX IF NOT EXISTS "idx_intermediate_wallets_retry" ON "intermediate_wallets" ("aggregation_status", "next_retry_at");
