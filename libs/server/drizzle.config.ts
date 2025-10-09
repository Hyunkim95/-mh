import type { Config } from "drizzle-kit";
import path from "path";

const schemaPath = path.join(__dirname, "src/db/schema.ts");
const migrationPath = path.join(__dirname, "src/db/migrations");

const createDatabaseUrl = () => {
  const useSSL = true;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return !useSSL ? connectionString : connectionString + "?sslmode=no-verify";
};

console.log(createDatabaseUrl());

export default {
  schema: schemaPath,
  out: migrationPath,
  driver: "pg",
  dbCredentials: {
    connectionString: createDatabaseUrl(),
  },
} satisfies Config;
