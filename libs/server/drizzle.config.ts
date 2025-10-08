import type { Config } from "drizzle-kit";
import path from "path";

const schemaPath = path.join(__dirname, "src/db/schema.ts");
const migrationPath = path.join(__dirname, "src/db/migrations");

export default {
  schema: schemaPath,
  out: migrationPath,
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || "",
  },
} satisfies Config;
