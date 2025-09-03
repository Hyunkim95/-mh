import { TRPCError } from '@trpc/server'
import { BaseUser, BaseSession, AuthMethod } from '@trpc-template/auth-shared'
import { AuthManager } from './auth-manager'

export interface AuthContext<TUser = BaseUser, TSession = BaseSession> {
  user: TUser
  session: TSession
}

export interface AuthMiddlewareOptions {
  optional?: boolean
  requireMethods?: AuthMethod[]
  customValidation?: (user: BaseUser) => Promise<boolean>
}

export function createAuthMiddleware<TUser extends BaseUser = BaseUser, TSession extends BaseSession = BaseSession>(
  authManager: AuthManager<TUser, TSession>
) {
  return function authMiddleware(opts: AuthMiddlewareOptions = {}) {
    return async function ({ ctx, next }: { ctx: any; next: any }) {
      const authHeader = ctx.req?.headers?.authorization
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

      if (!token) {
        if (opts.optional) {
          return next({ ctx })
        }
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No authentication token provided'
        })
      }

      try {
        const result = await authManager.verifyToken(token)
        if (!result || !result.user) {
          if (opts.optional) {
            return next({ ctx })
          }
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid authentication token'
          })
        }

        const { user, session } = result

        // Check required auth methods
        if (opts.requireMethods?.length) {
          const userAuthMethod = (user as any).authMethod
          if (!opts.requireMethods.includes(userAuthMethod)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `Authentication method '${userAuthMethod}' not allowed`
            })
          }
        }

        // Run custom validation
        if (opts.customValidation) {
          const isValid = await opts.customValidation(user as unknown as BaseUser)
          if (!isValid) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Custom validation failed'
            })
          }
        }

        // Add auth context
        const authCtx: AuthContext<TUser, TSession> = { user, session }
        return next({ ctx: { ...ctx, auth: authCtx } })
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error
        }

        if (opts.optional) {
          return next({ ctx })
        }

        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication failed'
        })
      }
    }
  }
}

// Helper to extract auth context from tRPC context
export function getAuthContext<TUser = BaseUser, TSession = BaseSession>(
  ctx: any
): AuthContext<TUser, TSession> | null {
  return ctx.auth || null
}

// Helper to require auth context (throws if not present)
export function requireAuthContext<TUser = BaseUser, TSession = BaseSession>(
  ctx: any
): AuthContext<TUser, TSession> {
  const authCtx = getAuthContext<TUser, TSession>(ctx)
  if (!authCtx) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    })
  }
  return authCtx
}