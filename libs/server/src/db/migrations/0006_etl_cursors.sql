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