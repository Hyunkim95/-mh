ALTER TABLE "hops" DROP CONSTRAINT "hops_route_id_routes_id_fk";
--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "executes_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" ALTER COLUMN "route_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "hops" ADD COLUMN "hop_index" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" ADD COLUMN "recipient" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" ADD COLUMN "delay_minutes" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" ADD COLUMN "delay_seconds" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "hops" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hops" ADD CONSTRAINT "hops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "hops" DROP COLUMN IF EXISTS "index";--> statement-breakpoint
ALTER TABLE "hops" DROP COLUMN IF EXISTS "to_address";--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN IF EXISTS "hops";