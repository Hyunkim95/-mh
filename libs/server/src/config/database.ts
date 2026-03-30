import dotenv from "dotenv";
dotenv.config({
  path: "../../.env",
});

const createDatabaseUrl = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const useSSL = process.env.NODE_ENV !== "development";
  return !useSSL ? connectionString : connectionString + "?sslmode=no-verify";
};

// Database configuration constants and utilities
export const DATABASE_CONFIG = {
  // Get connection string from environment or use default
  getConnectionString: () => createDatabaseUrl(),

  // Check if we're in development mode
  isDevelopment: () => process.env.NODE_ENV === "development",

  // Database connection options
  getConnectionOptions: () => ({
    synchronize: DATABASE_CONFIG.isDevelopment(),
    logging: DATABASE_CONFIG.isDevelopment(),
    ssl: DATABASE_CONFIG.isDevelopment() ? false : true,
  }),
};
