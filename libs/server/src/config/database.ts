import dotenv from 'dotenv';
dotenv.config();

// Database configuration constants and utilities
export const DATABASE_CONFIG = {
  // Get connection string from environment or use default
  getConnectionString: () => 
    process.env.DATABASE_URL,
    
  // Check if we're in development mode
  isDevelopment: () => process.env.NODE_ENV === 'development',
  
  // Database connection options
  getConnectionOptions: () => ({
    synchronize: DATABASE_CONFIG.isDevelopment(),
    logging: DATABASE_CONFIG.isDevelopment(),
  }),
};