import type { Config } from "drizzle-kit";
import path from "path";

const schemaPath = path.join("src/db/schema.ts");
const migrationPath = path.join("src/db/migrations");

const createDatabaseUrl = () => {
  const useSSL = true;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return !useSSL ? connectionString : connectionString + "?sslmode=no-verify";
};

export default {
  schema: schemaPath,
  out: migrationPath,
  driver: "pg",
  dbCredentials: {
    connectionString: createDatabaseUrl(),
  },
} satisfies Config;
