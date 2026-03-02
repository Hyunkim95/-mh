import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { DATABASE_CONFIG } from "../config/database";

dotenv.config({
  path: "../../.env",
});

// Create the connection pool with UTC timezone
const client = new Pool({
  connectionString: DATABASE_CONFIG.getConnectionString(),
  // Ensure all database operations use UTC timezone
  options: "-c timezone=UTC",
  ssl: DATABASE_CONFIG.isDevelopment()
    ? false
    : {
        rejectUnauthorized: false,
      },
  max: 5,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
});

export const db = drizzle(client, { schema });

// Export the client for raw queries if needed
export { client };
