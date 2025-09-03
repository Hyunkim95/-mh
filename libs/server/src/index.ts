import { router } from './trpc';
import { helloRouter } from './routers/hello';

export const appRouter = router({
  hello: helloRouter,
});

export type AppRouter = typeof appRouter;

// Export the router and types
export { router, publicProcedure } from './trpc';

// Export database configurations
export * from './db';