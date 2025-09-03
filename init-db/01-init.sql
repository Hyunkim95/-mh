-- Initialize database with basic setup
-- This script runs when the PostgreSQL container starts for the first time

-- Connect to the created database
\c trpc_dev;

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set timezone
SET timezone = 'UTC';
