// Database configuration constants and utilities
export const DATABASE_CONFIG = {
  // Default connection string - override with DATABASE_URL environment variable
  DEFAULT_CONNECTION_STRING: 'postgresql://trpc_user:trpc_password@localhost:5432/trpc_db',
  
  // Get connection string from environment or use default
  getConnectionString: () => 
    process.env.DATABASE_URL || DATABASE_CONFIG.DEFAULT_CONNECTION_STRING,
    
  // Check if we're in development mode
  isDevelopment: () => process.env.NODE_ENV === 'development',
  
  // Database connection options
  getConnectionOptions: () => ({
    synchronize: DATABASE_CONFIG.isDevelopment(),
    logging: DATABASE_CONFIG.isDevelopment(),
  }),
};
