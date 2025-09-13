import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { verifyAuthToken, extractTokenFromHeader, AuthContext } from './auth/services/auth.service';

// Create context type
export interface Context extends AuthContext {
  req: CreateFastifyContextOptions['req'];
  res: CreateFastifyContextOptions['res'];
}

// Create context function
export const createContext = async (opts: CreateFastifyContextOptions): Promise<Context> => {
  const { req, res } = opts;
  
  // Extract token from Authorization header
  const token = extractTokenFromHeader(req.headers.authorization);
  console.log('token', token);
  let authContext: AuthContext = { user: null, session: null };
  
  if (token) {
    authContext = await verifyAuthToken(token);
  }

  return {
    req,
    res,
    ...authContext,
  };
};

// Initialize tRPC with context
const t = initTRPC.context<Context>().create();

// Base router and procedures
export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
  
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      session: ctx.session,
    },
  });
});

// Admin procedure that requires admin role
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }
  
  return next({
    ctx,
  });
});

// Role-based procedure factory
export const createRoleBasedProcedure = (requiredRole: 'user' | 'admin') => {
  return protectedProcedure.use(({ ctx, next }) => {
    if (requiredRole === 'admin' && ctx.user.role !== 'admin') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `${requiredRole} access required`,
      });
    }
    
    return next({
      ctx,
    });
  });
};
