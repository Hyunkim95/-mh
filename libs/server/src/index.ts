import { config } from 'dotenv';
config();

import { router } from './trpc';
import { helloRouter } from './routers/hello';
import { authRouter } from './auth/routers/auth.router';
import { contractRouter } from './routers/contract.router';
import { routesRouter } from './routers/routes.router';
import { dualContractEventsRouter } from './routers/dual-contract-events.router';
import dualDirectionContractEventsService from './solana/dual-direction-contract-events.service';


export const appRouter = router({
  hello: helloRouter,
  auth: authRouter,
  contract: contractRouter,
  routes: routesRouter,
  dualContractEvents: dualContractEventsRouter, // New dual direction router
});

export type AppRouter = typeof appRouter;

// Export the router and types
export { 
  router, 
  publicProcedure, 
  protectedProcedure, 
  adminProcedure, 
  createRoleBasedProcedure,
  createContext
} from './trpc';

// Export authentication types and services
export type { Context } from './trpc';
export { authService } from './auth/services/auth.service';
export type { AuthContext, JWTPayload } from './auth/services/auth.service';
export * from './solana/contract.service';
// Export database configurations
export * from './db';

// Export executor service
export { default as executorService } from './executors/executor.service';

// Export timezone utilities
export * from './utils/timezone';
export * from './hops/services/hops-scheduler.service';
export {
  dualDirectionContractEventsService
}