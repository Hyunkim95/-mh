import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../../trpc';
import { 
  generateAuthChallenge,
  verifySignatureAndCreateSession,
  logoutUser,
  updateUserRole,
  getUserSessions,
  revokeAllUserSessions,
  cleanupExpiredSessions,
  extractTokenFromHeader
} from '../services/auth.service';

// Input validation schemas
const publicKeySchema = z.string().min(32).max(44).regex(/^[A-Za-z0-9]+$/, 'Invalid public key format');

const challengeInputSchema = z.object({
  publicKey: publicKeySchema,
});

const verifyInputSchema = z.object({
  publicKey: publicKeySchema,
  nonce: z.string().min(8).max(32),
  signature: z.string().min(64),
  isHardwareWallet: z.boolean().default(false),
});

const updateRoleInputSchema = z.object({
  publicKey: publicKeySchema,
  role: z.enum(['user', 'admin']),
});

const revokeSessionsInputSchema = z.object({
  userId: z.number().int().positive(),
});

export const authRouter = router({
  /**
   * Generate authentication challenge
   * POST /auth/challenge
   */
  challenge: publicProcedure
    .input(challengeInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { publicKey } = input;
        const challenge = await generateAuthChallenge(publicKey);
        
        return {
          success: true,
          data: challenge,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate challenge',
        });
      }
    }),

  /**
   * Verify signature and create session
   * POST /auth/verify
   */
  verify: publicProcedure
    .input(verifyInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { publicKey, nonce, signature, isHardwareWallet } = input;
        const result = await verifySignatureAndCreateSession(
          publicKey, 
          nonce, 
          signature, 
          isHardwareWallet
        );
        
        return {
          success: true,
          data: {
            user: {
              id: result.user.id,
              publicKey: result.user.publicKey,
              role: result.user.role,
              createdAt: result.user.createdAt,
              updatedAt: result.user.updatedAt,
            },
            session: {
              id: result.session.id,
              expiresAt: result.session.expiresAt,
              createdAt: result.session.createdAt,
            },
            token: result.token,
          },
        };
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('Invalid or expired challenge')) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Challenge is invalid or expired. Please request a new challenge.',
            });
          }
          if (error.message.includes('Invalid signature')) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid signature provided.',
            });
          }
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Authentication verification failed',
        });
      }
    }),

  /**
   * Get current user information
   * GET /auth/me
   */
  me: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        success: true,
        data: {
          user: {
            id: ctx.user.id,
            publicKey: ctx.user.publicKey,
            role: ctx.user.role,
            createdAt: ctx.user.createdAt,
            updatedAt: ctx.user.updatedAt,
          },
          session: {
            id: ctx.session.id,
            expiresAt: ctx.session.expiresAt,
            createdAt: ctx.session.createdAt,
          },
        },
      };
    }),

  /**
   * Logout current user
   * POST /auth/logout
   */
  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const token = extractTokenFromHeader(ctx.req.headers.authorization);
        if (!token) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No token provided',
          });
        }

        const success = await logoutUser(token);
        
        if (!success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to logout',
          });
        }

        return {
          success: true,
          message: 'Successfully logged out',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Logout failed',
        });
      }
    }),

  /**
   * Update user role (Admin only)
   * POST /auth/update-role
   */
  updateRole: adminProcedure
    .input(updateRoleInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { publicKey, role } = input;
        const updatedUser = await updateUserRole(publicKey, role);
        
        if (!updatedUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        return {
          success: true,
          data: {
            user: {
              id: updatedUser.id,
              publicKey: updatedUser.publicKey,
              role: updatedUser.role,
              createdAt: updatedUser.createdAt,
              updatedAt: updatedUser.updatedAt,
            },
          },
          message: `User role updated to ${role}`,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user role',
        });
      }
    }),

  /**
   * Get user sessions (Admin only)
   * GET /auth/user-sessions/:userId
   */
  getUserSessions: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const sessions = await getUserSessions(input.userId);
        
        return {
          success: true,
          data: {
            sessions: sessions.map(session => ({
              id: session.id,
              userId: session.userId,
              expiresAt: session.expiresAt,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            })),
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve user sessions',
        });
      }
    }),

  /**
   * Revoke all user sessions (Admin only)
   * POST /auth/revoke-sessions
   */
  revokeUserSessions: adminProcedure
    .input(revokeSessionsInputSchema)
    .mutation(async ({ input }) => {
      try {
        const { userId } = input;
        const revokedCount = await revokeAllUserSessions(userId);
        
        return {
          success: true,
          data: { revokedCount },
          message: `Revoked ${revokedCount} sessions`,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke user sessions',
        });
      }
    }),

  /**
   * Cleanup expired sessions and challenges (Admin only)
   * POST /auth/cleanup
   */
  cleanup: adminProcedure
    .mutation(async () => {
      try {
        await cleanupExpiredSessions();
        
        return {
          success: true,
          message: 'Expired sessions and challenges cleaned up successfully',
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cleanup expired data',
        });
      }
    }),

  /**
   * Health check for authentication service
   * GET /auth/health
   */
  health: publicProcedure
    .query(() => {
      return {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'solana-auth',
        },
      };
    }),
});