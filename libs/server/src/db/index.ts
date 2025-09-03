// Export database connection and schema
export { db, client } from './connection';
export * from './schema';

// Export types for external use
export type { User, NewUser, Post, NewPost } from './schema';
