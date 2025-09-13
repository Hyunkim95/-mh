import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DATABASE_CONFIG } from '../config/database';

dotenv.config();

// Create the connection pool with UTC timezone
const client = new Pool({
  connectionString: DATABASE_CONFIG.getConnectionString(),
  // Ensure all database operations use UTC timezone
  options: '-c timezone=UTC',
  ssl: DATABASE_CONFIG.isDevelopment() ? false : {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(client, { schema });

// Export the client for raw queries if needed
export { client };
