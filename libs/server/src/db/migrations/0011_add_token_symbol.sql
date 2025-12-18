-- Add tokenSymbol column to routes table
ALTER TABLE "routes" ADD COLUMN "token_symbol" varchar(20);
